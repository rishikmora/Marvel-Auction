# MARVEL: THE AUCTION

A real-time multiplayer fantasy auction battle. Every player gets the same budget, bids
live against their rivals for a roster of superheroes and villains, and the strongest
**team** — not the biggest spender — wins.

```bash
npm install
npm run dev          # http://localhost:3000
```

Open the app, hit **Create auction**, share the `MARVEL-XXXXXX` code, and play.

---

## What it does

- **Live auction over WebSockets.** The host reveals a character, opens the floor, and
  every bid lands on every screen instantly.
- **Server-authoritative.** The client never decides who won, whether a bid is legal, how
  much money remains, or what a team scores. It renders what the server sends.
- **Transparent scoring.** Team power is `Character Power + Synergy + Balance + Leadership
  − Penalties`, every term is capped, and any player can open *"How was this calculated?"*
  and see the exact numbers.
- **A finale worth staying for.** Staged rankings reveal, champion banner, superlatives,
  and an optional deterministic battle simulation between the top two rosters.
- **Afterwards.** The War Room (analytics), a full auction replay rebuilt from the bid log,
  career profiles and achievements.

## The core loop

```
HOST REVEALS → FLOOR OPENS → PLAYERS BID → SERVER VALIDATES → HIGHEST BID WINS
   → CREDITS DEDUCTED → CHARACTER JOINS ROSTER → LEADERBOARD UPDATES → NEXT LOT
   → ROSTERS FILL → HOST ENDS AUCTION → TEAM POWER CALCULATED → WINNER DECLARED
```

## Default rules (all host-configurable)

| Rule | Default |
| --- | --- |
| Starting budget | 1000 credits |
| Roster size | 7 characters |
| Auction timer | 30s per lot |
| Minimum increment | 10 credits |
| Anti-snipe | A bid in the last 5s extends the clock by 5s |
| Sale | Automatic on expiry (host confirmation optional) |
| Budget reserve | On — you cannot spend so hard you can't fill your roster |

---

## Architecture

```
server/index.ts          Custom HTTP server: Next.js + Socket.IO on one port
src/game/                Isomorphic domain — no Node, no browser APIs
  types.ts               The shared vocabulary
  config.ts              Default settings, scoring model, game modes
  scoring.ts             Character power, synergy, balance, leadership, ranking
  battle.ts              Deterministic exhibition battle simulation
  analytics.ts           Post-auction analysis
  replay.ts              Rebuilds an auction timeline from the stored bid log
  achievements.ts
  data/                  The seed dataset (110 characters) + synergy & counter rules
src/server/              Authoritative, server-only
  engine.ts              AuctionRoom — the state machine and single source of truth
  rooms.ts               Concurrent room manager, archiving, idle reclamation
  socket.ts              Socket handlers, per-viewer projections, pulses
  events.ts              zod schemas — every inbound payload is parsed
  store.ts               Persistence (JSON driver; Postgres schema in db/schema.sql)
  ratelimit.ts, auth.ts, singleton.ts
src/components/          Presentation only — no game rules live here
src/app/                 Routes + REST API
tests/                   88 unit/integration tests + a live end-to-end script
db/schema.sql            Production PostgreSQL schema with the invariants as constraints
```

### Why the engine is a separate, pure class

`AuctionRoom` takes an injectable clock and scheduler, so the entire game — timers,
anti-snipe, auto-sale, race resolution — is tested deterministically without sleeping or
spinning up a server. Every mutation returns a `Result<T>`; invalid transitions are
rejected, never clamped.

### What the server refuses to trust

Every bid is re-checked against: game is active · auction is open · you are in this game ·
you are not a spectator · your roster has room · you are not already the highest bidder ·
the amount beats the minimum · you can afford it · you keep enough back for your remaining
slots · the clock has not expired. Rate limiting sits in front of all of it.

### Scoring

Character power is a weighted sum of nine 0–100 stats, scaled ×10 (so a strong character
is ~800–950 and a full roster is ~6,000+). On top of that:

| Term | Cap (share of raw character power) |
| --- | --- |
| Synergy | 15% |
| Team balance | 10% |
| Leadership | 5% |
| Penalties | 8% |

The caps are the point: **no combination of bonuses can outweigh the characters you
actually bought.** Weights and caps are configurable per game and globally in the admin
panel. Synergy rules and counter relationships are data (`src/game/data/`), not code.

Ties break deterministically: synergy → average character power → remaining budget →
strongest character → shared victory. Whichever rule separated two teams is shown on the
results screen.

---

## Data

**110 characters** across Avengers, X-Men, Fantastic Four, Guardians, Spider-Verse,
Cosmic, Villains, Street Level and Mystic. Characters can belong to several categories.
Stats are invented for gameplay balance — they are not official.

Adding or editing characters means editing one file in `src/game/data/`, or using the
admin panel at `/admin`, which layers edits on top of the shipped dataset.

### Character art

Portraits are **generated locally as deterministic SVG** — no external requests, no broken
images, no licensing question. The image layer is one function (`src/lib/character-art.ts`)
with two override points:

- per-character `imageUrl` in the dataset, or
- `NEXT_PUBLIC_CHARACTER_IMAGE_BASE=https://cdn.example.com/characters` to point the whole
  roster at a CDN (`{base}/{id}.jpg`).

---

## Persistence

Ships with a **JSON driver** (`data/store.json`) so the app runs anywhere Node runs with no
provisioning. It writes to a temp file and renames, so a crash cannot truncate it.

`db/schema.sql` is the production PostgreSQL target. The store interface was written
against it, and the invariants that matter are constraints rather than conventions:

- `UNIQUE (game_id, character_id)` on `team_characters` — a character cannot be owned twice
- roster-size, bid-legality and budget triggers
- an auction state-transition trigger mirroring the engine
- row-level security so a client cannot read or write another player's row

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP + WebSocket port |
| `MARVEL_ADMIN_TOKEN` | dev: `marvel-admin` | Admin API auth. **Unset in production disables admin writes entirely** rather than falling back to a known default. |
| `MARVEL_DATA_DIR` | `./data` | Where the JSON store lives |
| `NEXT_PUBLIC_CHARACTER_IMAGE_BASE` | — | CDN base for character art |

---

## Testing

```bash
npm test          # 88 unit + integration tests
npm run typecheck
npm run build
```

Covers bid validation (including negative, fractional, over-budget, self-outbid and
simultaneous bids), budget reserve, roster limits, timer expiry, anti-snipe, manual sale
confirmation, pause/resume, disconnect/reconnect, host authorisation, scoring caps,
tie-breaking, battle determinism, replay reconstruction, wire projections and
concurrent room isolation.

### Live end-to-end

Drives three real socket clients through a complete auction against a running server:

```bash
npm run build
PORT=3111 MARVEL_ADMIN_TOKEN=secret npm start   # in one terminal
MARVEL_ADMIN_TOKEN=secret node tests/e2e-live.mjs 3111
```

51 checks: room creation, joining, duplicate-name rejection, host authorisation, the full
bid/anti-snipe/sale cycle, exact credit ledgers, roster limits, token-authenticated
reconnection (and rejection of a forged token), auto-finish, archive and profile writes,
admin authorisation, and rate limiting.

---

## Accessibility & responsiveness

Keyboard navigable with visible focus rings, ARIA labels on meters, timers and controls,
live regions for the feed and countdown. Three user toggles in the header: **sound**
(off by default — nothing autoplays), **reduce motion** (respects the OS setting and
replaces every cinematic with its static equivalent), and **high contrast**.

Desktop gets the full three-column arena. Mobile gets a purpose-built layout with a bottom
tab bar (Arena / My Team / Ranks / Feed) — not a shrunken desktop.

## Sound

Every cue is synthesised with the Web Audio API — no audio assets, no autoplay. The context
is only created after a user gesture.

---

## Notes and limitations

- Rooms live in process memory, so a restart ends games in progress; finished games are
  archived to disk. Running multiple instances needs a shared adapter (Redis) for the
  Socket.IO layer and rooms moved into Postgres.
- Auth is lightweight: players are identified by a server-issued id plus a secret token
  held in `localStorage`. There are no passwords for players by design — the room code and
  optional room password are the access control. `db/schema.sql` includes the `users`
  table for a real auth provider.
- Character stats, synergies and counters are invented for gameplay balance. The battle
  simulation is entertainment, not a claim about canon.

This is a fan-made project and is not affiliated with or endorsed by Marvel.
