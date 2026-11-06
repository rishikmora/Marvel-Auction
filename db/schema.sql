-- =====================================================================
-- MARVEL: THE AUCTION — PostgreSQL schema
--
-- The app ships with a zero-config JSON persistence driver (src/server/store.ts)
-- so it runs anywhere Node runs. This schema is the production target: the store
-- interface was written against it, so swapping drivers means implementing the
-- same methods over these tables rather than reshaping the application.
--
-- The invariants that matter are enforced here as constraints, not just in code:
--   * one character can belong to exactly one team per game
--   * a roster cannot exceed the game's configured size
--   * a bid cannot be negative, and cannot exceed the bidder's remaining budget
--   * auction state transitions are validated by a trigger
--
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

CREATE TYPE user_role        AS ENUM ('ADMIN', 'HOST', 'PLAYER');
CREATE TYPE game_status      AS ENUM ('LOBBY', 'ACTIVE', 'FINISHED', 'CANCELLED');
CREATE TYPE auction_state    AS ENUM ('WAITING', 'CHARACTER_REVEALED', 'BIDDING', 'SOLD', 'PASSED', 'PAUSED', 'FINISHED');
CREATE TYPE connection_state AS ENUM ('ONLINE', 'CONNECTING', 'DISCONNECTED', 'RECONNECTED');
CREATE TYPE universe         AS ENUM ('AVENGERS','X_MEN','FANTASTIC_FOUR','GUARDIANS','SPIDER_VERSE','COSMIC','VILLAINS','STREET','MYSTIC');
CREATE TYPE character_role   AS ENUM ('TANK','DAMAGE','SUPPORT','LEADER','STRATEGIST','SPEEDSTER','RANGED','MAGICAL','COSMIC','TECH','MUTANT','ASSASSIN');
CREATE TYPE character_tier   AS ENUM ('STREET','ENHANCED','ELITE','COSMIC','OMEGA');
CREATE TYPE character_rarity AS ENUM ('COMMON','RARE','EPIC','LEGENDARY','MYTHIC');

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username       citext UNIQUE,                 -- requires the citext extension; text + lower() index also works
  display_name   text        NOT NULL CHECK (length(display_name) BETWEEN 1 AND 20),
  email          text UNIQUE,
  password_hash  text,                          -- null for guest sessions
  avatar         text        NOT NULL DEFAULT 'shield',
  role           user_role   NOT NULL DEFAULT 'PLAYER',
  is_guest       boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Character catalogue
-- ---------------------------------------------------------------------

CREATE TABLE character_categories (
  id          universe PRIMARY KEY,
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE characters (
  id                 text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  name               text             NOT NULL,
  alias              text             NOT NULL DEFAULT '',
  universe           universe         NOT NULL REFERENCES character_categories(id),
  tier               character_tier   NOT NULL,
  rarity             character_rarity NOT NULL,
  base_price         int              NOT NULL CHECK (base_price > 0),
  description        text             NOT NULL DEFAULT '',
  image_url          text,
  palette_primary    text             NOT NULL,
  palette_secondary  text             NOT NULL,
  glyph              text             NOT NULL DEFAULT '??',
  special_abilities  text[]           NOT NULL DEFAULT '{}',
  synergy_tags       text[]           NOT NULL DEFAULT '{}',
  roles              character_role[] NOT NULL CHECK (array_length(roles, 1) >= 1),
  is_active          boolean          NOT NULL DEFAULT true,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX characters_universe_idx    ON characters (universe) WHERE is_active;
CREATE INDEX characters_synergy_tag_idx ON characters USING gin (synergy_tags);

-- A character may appear in several categories (Loki: Avengers + Villains + Mystic).
CREATE TABLE character_category_map (
  character_id text     NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  category_id  universe NOT NULL REFERENCES character_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (character_id, category_id)
);

-- Stats live in their own table so the scoring engine can be reweighted, versioned or
-- extended with new attributes without touching the character record itself.
CREATE TABLE character_stats (
  character_id    text PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  strength        smallint NOT NULL CHECK (strength        BETWEEN 0 AND 100),
  speed           smallint NOT NULL CHECK (speed           BETWEEN 0 AND 100),
  durability      smallint NOT NULL CHECK (durability      BETWEEN 0 AND 100),
  intelligence    smallint NOT NULL CHECK (intelligence    BETWEEN 0 AND 100),
  combat          smallint NOT NULL CHECK (combat          BETWEEN 0 AND 100),
  energy          smallint NOT NULL CHECK (energy          BETWEEN 0 AND 100),
  versatility     smallint NOT NULL CHECK (versatility     BETWEEN 0 AND 100),
  leadership      smallint NOT NULL CHECK (leadership      BETWEEN 0 AND 100),
  special_ability smallint NOT NULL CHECK (special_ability BETWEEN 0 AND 100)
);

-- ---------------------------------------------------------------------
-- Rules data (never hard-coded in the UI)
-- ---------------------------------------------------------------------

CREATE TABLE synergy_rules (
  id                text PRIMARY KEY,
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',
  tag               text NOT NULL,
  min_count         int  NOT NULL CHECK (min_count >= 1),
  flat_bonus        int  NOT NULL DEFAULT 0,
  per_extra_member  int  NOT NULL DEFAULT 0,
  cap               int  CHECK (cap IS NULL OR cap >= 0),
  is_active         boolean NOT NULL DEFAULT true
);

CREATE TABLE counter_relationships (
  id                   text PRIMARY KEY,
  source_tag           text    NOT NULL,
  target_tag           text    NOT NULL,
  advantage_multiplier numeric(4,3) NOT NULL CHECK (advantage_multiplier > 1 AND advantage_multiplier < 3),
  reason               text    NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  UNIQUE (source_tag, target_tag)
);

-- ---------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------

CREATE TABLE games (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6,8}$'),
  name              text        NOT NULL,
  mode              text        NOT NULL DEFAULT 'CLASSIC',
  host_user_id      uuid        NOT NULL REFERENCES users(id),
  status            game_status NOT NULL DEFAULT 'LOBBY',
  auction_state     auction_state NOT NULL DEFAULT 'WAITING',
  round             int         NOT NULL DEFAULT 0 CHECK (round >= 0),
  current_character_id text     REFERENCES characters(id),
  current_bid       int         NOT NULL DEFAULT 0 CHECK (current_bid >= 0),
  highest_bidder_id uuid,                        -- FK added after game_players exists
  auction_ends_at   timestamptz,
  is_private        boolean     NOT NULL DEFAULT false,
  password_hash     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX games_status_idx ON games (status) WHERE status IN ('LOBBY', 'ACTIVE');

-- One row per game; every tunable the host or admin can change.
CREATE TABLE game_settings (
  game_id                      uuid PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  starting_budget              int  NOT NULL CHECK (starting_budget > 0),
  max_roster                   int  NOT NULL CHECK (max_roster BETWEEN 1 AND 12),
  min_players                  int  NOT NULL DEFAULT 2  CHECK (min_players >= 1),
  max_players                  int  NOT NULL DEFAULT 10 CHECK (max_players >= 2),
  auction_seconds              int  NOT NULL CHECK (auction_seconds BETWEEN 5 AND 300),
  min_increment                int  NOT NULL CHECK (min_increment > 0),
  anti_snipe_enabled           boolean NOT NULL DEFAULT true,
  anti_snipe_threshold_seconds int  NOT NULL DEFAULT 5,
  anti_snipe_extension_seconds int  NOT NULL DEFAULT 5,
  manual_sale_confirmation     boolean NOT NULL DEFAULT false,
  reserve_budget_for_slots     boolean NOT NULL DEFAULT true,
  host_plays                   boolean NOT NULL DEFAULT true,
  allow_reconnect_bidding      boolean NOT NULL DEFAULT true,
  categories                   universe[] NOT NULL DEFAULT '{}',
  character_pool               text[],
  -- Full scoring model, so a finished game can always be re-explained with the exact
  -- weights it was judged under even after the admin changes the defaults.
  scoring                      jsonb NOT NULL,
  CHECK (max_players >= min_players)
);

CREATE TABLE game_players (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id),
  team_name      text NOT NULL,
  avatar         text NOT NULL DEFAULT 'shield',
  is_host        boolean NOT NULL DEFAULT false,
  is_spectator   boolean NOT NULL DEFAULT false,
  is_ready       boolean NOT NULL DEFAULT false,
  budget         int  NOT NULL CHECK (budget >= 0),
  spent          int  NOT NULL DEFAULT 0 CHECK (spent >= 0),
  connection     connection_state NOT NULL DEFAULT 'ONLINE',
  joined_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)
);

CREATE INDEX game_players_game_idx ON game_players (game_id);

ALTER TABLE games
  ADD CONSTRAINT games_highest_bidder_fk
  FOREIGN KEY (highest_bidder_id) REFERENCES game_players(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Auction rounds, bids and ownership
-- ---------------------------------------------------------------------

CREATE TABLE auction_rounds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number   int  NOT NULL CHECK (round_number > 0),
  character_id   text NOT NULL REFERENCES characters(id),
  state          auction_state NOT NULL DEFAULT 'CHARACTER_REVEALED',
  opened_at      timestamptz,
  ends_at        timestamptz,
  extensions     int  NOT NULL DEFAULT 0,
  resolved_at    timestamptz,
  UNIQUE (game_id, round_number),
  -- A character is auctioned at most once per game.
  UNIQUE (game_id, character_id)
);

CREATE TABLE bids (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id       uuid NOT NULL REFERENCES auction_rounds(id) ON DELETE CASCADE,
  player_id      uuid NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  amount         int  NOT NULL CHECK (amount > 0),
  offset_ms      int  NOT NULL DEFAULT 0 CHECK (offset_ms >= 0),
  triggered_anti_snipe boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bids_round_idx ON bids (round_id, amount DESC);
CREATE INDEX bids_game_idx  ON bids (game_id, created_at);

CREATE TABLE purchases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id       uuid NOT NULL UNIQUE REFERENCES auction_rounds(id) ON DELETE CASCADE,
  character_id   text NOT NULL REFERENCES characters(id),
  player_id      uuid REFERENCES game_players(id) ON DELETE SET NULL,  -- null when passed
  price          int  NOT NULL DEFAULT 0 CHECK (price >= 0),
  bid_count      int  NOT NULL DEFAULT 0,
  passed         boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((passed AND player_id IS NULL AND price = 0) OR (NOT passed AND player_id IS NOT NULL))
);

-- Roster membership. The UNIQUE (game_id, character_id) is the constraint that makes
-- "a character can only belong to one player" impossible to violate, even under a race.
CREATE TABLE team_characters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id      uuid NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  character_id   text NOT NULL REFERENCES characters(id),
  price          int  NOT NULL CHECK (price >= 0),
  round_number   int  NOT NULL,
  acquired_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, character_id)
);

CREATE INDEX team_characters_player_idx ON team_characters (player_id);

-- Final (or provisional) score, stored decomposed so results stay explainable forever.
CREATE TABLE team_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id         uuid NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  character_power   int  NOT NULL DEFAULT 0,
  synergy_bonus     int  NOT NULL DEFAULT 0,
  balance_bonus     int  NOT NULL DEFAULT 0,
  leadership_bonus  int  NOT NULL DEFAULT 0,
  penalty           int  NOT NULL DEFAULT 0,
  total             int  NOT NULL DEFAULT 0,
  rank              int,
  shared_rank       boolean NOT NULL DEFAULT false,
  tie_break         text,
  breakdown         jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id),
  CHECK (total = character_power + synergy_bonus + balance_bonus + leadership_bonus - penalty)
);

-- ---------------------------------------------------------------------
-- Achievements, notifications
-- ---------------------------------------------------------------------

CREATE TABLE achievements (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL,
  icon        text NOT NULL DEFAULT '*',
  scope       text NOT NULL DEFAULT 'game' CHECK (scope IN ('game', 'profile'))
);

CREATE TABLE player_achievements (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  game_id        uuid REFERENCES games(id) ON DELETE SET NULL,
  earned_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id    uuid REFERENCES games(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  message    text NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- Global defaults the admin panel edits (weights, caps, bid rules).
CREATE TABLE app_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

-- =====================================================================
-- Invariants enforced in the database, not only in application code
-- =====================================================================

-- 1. A roster can never exceed the game's configured size.
CREATE OR REPLACE FUNCTION enforce_roster_limit() RETURNS trigger AS $$
DECLARE
  roster_size int;
  limit_size  int;
BEGIN
  SELECT count(*) INTO roster_size
    FROM team_characters
   WHERE player_id = NEW.player_id;

  SELECT gs.max_roster INTO limit_size
    FROM game_settings gs
   WHERE gs.game_id = NEW.game_id;

  IF roster_size > limit_size THEN
    RAISE EXCEPTION 'ROSTER_FULL: player % already holds % of % slots',
      NEW.player_id, roster_size, limit_size;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER team_characters_roster_limit
  AFTER INSERT ON team_characters
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION enforce_roster_limit();

-- 2. A bid can never exceed the bidder's remaining budget, and must beat the
--    standing bid by at least the game's minimum increment.
CREATE OR REPLACE FUNCTION enforce_bid_rules() RETURNS trigger AS $$
DECLARE
  player_budget int;
  standing_bid  int;
  increment     int;
BEGIN
  SELECT budget INTO player_budget FROM game_players WHERE id = NEW.player_id;
  IF NEW.amount > player_budget THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: bid % exceeds budget %', NEW.amount, player_budget;
  END IF;

  SELECT coalesce(max(amount), 0) INTO standing_bid FROM bids WHERE round_id = NEW.round_id;
  SELECT gs.min_increment INTO increment
    FROM game_settings gs JOIN auction_rounds r ON r.game_id = gs.game_id
   WHERE r.id = NEW.round_id;

  IF standing_bid > 0 AND NEW.amount < standing_bid + increment THEN
    RAISE EXCEPTION 'BID_TOO_LOW: % does not beat % by %', NEW.amount, standing_bid, increment;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bids_enforce_rules
  BEFORE INSERT ON bids
  FOR EACH ROW EXECUTE FUNCTION enforce_bid_rules();

-- 3. Auction state transitions. Anything not listed is rejected outright rather than
--    silently clamped, mirroring the engine's state machine.
CREATE OR REPLACE FUNCTION enforce_auction_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.auction_state = NEW.auction_state THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.auction_state = 'WAITING'            AND NEW.auction_state IN ('CHARACTER_REVEALED', 'FINISHED')) OR
    (OLD.auction_state = 'CHARACTER_REVEALED' AND NEW.auction_state IN ('BIDDING', 'PASSED', 'FINISHED')) OR
    (OLD.auction_state = 'BIDDING'            AND NEW.auction_state IN ('PAUSED', 'SOLD', 'PASSED', 'FINISHED')) OR
    (OLD.auction_state = 'PAUSED'             AND NEW.auction_state IN ('BIDDING', 'SOLD', 'PASSED', 'FINISHED')) OR
    (OLD.auction_state = 'SOLD'               AND NEW.auction_state IN ('WAITING', 'CHARACTER_REVEALED', 'FINISHED')) OR
    (OLD.auction_state = 'PASSED'             AND NEW.auction_state IN ('WAITING', 'CHARACTER_REVEALED', 'FINISHED'))
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: % -> % is not a legal auction transition',
      OLD.auction_state, NEW.auction_state;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER games_enforce_transition
  BEFORE UPDATE OF auction_state ON games
  FOR EACH ROW EXECUTE FUNCTION enforce_auction_transition();

-- 4. Keep spent + budget consistent with the roster whenever a purchase lands.
CREATE OR REPLACE FUNCTION apply_purchase_to_budget() RETURNS trigger AS $$
BEGIN
  UPDATE game_players
     SET budget = budget - NEW.price,
         spent  = spent  + NEW.price
   WHERE id = NEW.player_id;

  IF (SELECT budget FROM game_players WHERE id = NEW.player_id) < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: purchase would overdraw player %', NEW.player_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_characters_apply_budget
  AFTER INSERT ON team_characters
  FOR EACH ROW EXECUTE FUNCTION apply_purchase_to_budget();

-- =====================================================================
-- Row Level Security
--
-- The application connects as an authenticated role and sets
--   SET LOCAL app.user_id = '<uuid>';
-- Host-only mutations remain the server's responsibility; these policies stop a
-- compromised client from reading or writing another player's row directly.
-- =====================================================================

ALTER TABLE game_players    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids            ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;

-- Everyone in a game can see everyone's public standing (budgets and rosters are
-- deliberately public — the leaderboard depends on it).
CREATE POLICY game_players_read ON game_players
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players
       WHERE user_id = current_setting('app.user_id', true)::uuid
    )
  );

-- But you may only modify your own row.
CREATE POLICY game_players_write ON game_players
  FOR UPDATE USING (user_id = current_setting('app.user_id', true)::uuid);

CREATE POLICY bids_read ON bids
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players
       WHERE user_id = current_setting('app.user_id', true)::uuid
    )
  );

CREATE POLICY bids_insert ON bids
  FOR INSERT WITH CHECK (
    player_id IN (
      SELECT id FROM game_players
       WHERE user_id = current_setting('app.user_id', true)::uuid
    )
  );

CREATE POLICY team_characters_read ON team_characters
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players
       WHERE user_id = current_setting('app.user_id', true)::uuid
    )
  );

CREATE POLICY notifications_own ON notifications
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- =====================================================================
-- Reporting helpers
-- =====================================================================

CREATE VIEW auction_history AS
SELECT
  g.code            AS game_code,
  r.round_number    AS round,
  c.name            AS character_name,
  c.universe        AS universe,
  gp.team_name      AS team,
  p.price           AS winning_bid,
  c.base_price      AS base_price,
  p.price - c.base_price AS overpay,
  p.bid_count       AS bids,
  p.passed          AS passed,
  p.created_at      AS sold_at
FROM purchases p
JOIN auction_rounds r ON r.id = p.round_id
JOIN games g          ON g.id = p.game_id
JOIN characters c     ON c.id = p.character_id
LEFT JOIN game_players gp ON gp.id = p.player_id;

CREATE VIEW player_career AS
SELECT
  u.id                                              AS user_id,
  u.display_name                                    AS player,
  count(DISTINCT gp.game_id)                        AS games_played,
  count(DISTINCT ts.game_id) FILTER (WHERE ts.rank = 1) AS wins,
  coalesce(sum(gp.spent), 0)                        AS credits_spent,
  count(tc.id)                                      AS characters_won,
  coalesce(max(tc.price), 0)                        AS highest_purchase
FROM users u
LEFT JOIN game_players    gp ON gp.user_id  = u.id
LEFT JOIN team_characters tc ON tc.player_id = gp.id
LEFT JOIN team_scores     ts ON ts.player_id = gp.id
GROUP BY u.id, u.display_name;

COMMIT;
