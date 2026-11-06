/**
 * MARVEL: THE AUCTION — domain types.
 *
 * This module is isomorphic: it must stay free of Node and browser APIs so the
 * authoritative server engine and the presentation layer share one vocabulary.
 */

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

export type Universe =
  | 'AVENGERS'
  | 'X_MEN'
  | 'FANTASTIC_FOUR'
  | 'GUARDIANS'
  | 'SPIDER_VERSE'
  | 'COSMIC'
  | 'VILLAINS'
  | 'STREET'
  | 'MYSTIC';

export type Role =
  | 'TANK'
  | 'DAMAGE'
  | 'SUPPORT'
  | 'LEADER'
  | 'STRATEGIST'
  | 'SPEEDSTER'
  | 'RANGED'
  | 'MAGICAL'
  | 'COSMIC'
  | 'TECH'
  | 'MUTANT'
  | 'ASSASSIN';

export type Tier = 'STREET' | 'ENHANCED' | 'ELITE' | 'COSMIC' | 'OMEGA';
export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

/** Every stat is on a 0-100 scale so weights stay comparable. */
export interface CharacterStats {
  strength: number;
  speed: number;
  durability: number;
  intelligence: number;
  combat: number;
  energy: number;
  versatility: number;
  leadership: number;
  specialAbility: number;
}

export const STAT_KEYS = [
  'strength',
  'speed',
  'durability',
  'intelligence',
  'combat',
  'energy',
  'versatility',
  'leadership',
  'specialAbility',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  strength: 'Strength',
  speed: 'Speed',
  durability: 'Durability',
  intelligence: 'Intelligence',
  combat: 'Combat',
  energy: 'Energy',
  versatility: 'Versatility',
  leadership: 'Leadership',
  specialAbility: 'Special Ability',
};

export interface Character {
  id: string;
  name: string;
  alias: string;
  /** Primary universe used for grouping and mode filters. */
  universe: Universe;
  /** A character may belong to several categories (Loki: Avengers + Villains + Mystic). */
  categories: Universe[];
  roles: Role[];
  stats: CharacterStats;
  tier: Tier;
  rarity: Rarity;
  /** Recommended minimum auction value. */
  basePrice: number;
  description: string;
  specialAbilities: string[];
  synergyTags: string[];
  /** Optional override; when absent the image layer generates local vector art. */
  imageUrl?: string;
  /** Palette drives generated art + card treatment. */
  palette: [string, string];
  glyph: string;
}

/* ------------------------------------------------------------------ */
/* Scoring configuration                                               */
/* ------------------------------------------------------------------ */

export type StatWeights = Record<StatKey, number>;

export interface ScoringConfig {
  /** Weights must sum to 1. Enforced by normalizeWeights(). */
  weights: StatWeights;
  /** Character score is 0-100 before this multiplier; 10 yields a familiar 0-1000 range. */
  powerScale: number;
  /** Bonus ceilings, expressed as a fraction of raw character power. */
  maxSynergyPct: number;
  maxBalancePct: number;
  maxLeadershipPct: number;
  maxPenaltyPct: number;
  /** How many same-role characters are tolerated before redundancy is penalised. */
  redundancyThreshold: number;
  redundancyPenaltyPerExcess: number;
}

/* ------------------------------------------------------------------ */
/* Synergy + counters (data driven)                                    */
/* ------------------------------------------------------------------ */

export interface SynergyRule {
  id: string;
  name: string;
  description: string;
  /** Matches Character.synergyTags. */
  tag: string;
  minCount: number;
  flatBonus: number;
  perExtraMember: number;
  /** Optional hard cap on this single rule's contribution. */
  cap?: number;
}

export interface CounterRelationship {
  id: string;
  /** Synergy tag or role of the attacker. */
  sourceTag: string;
  /** Synergy tag or role that is disadvantaged. */
  targetTag: string;
  advantageMultiplier: number;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Game configuration                                                  */
/* ------------------------------------------------------------------ */

export type GameModeId =
  | 'CLASSIC'
  | 'FAST'
  | 'HARDCORE'
  | 'RANDOM_UNIVERSE'
  | 'AVENGERS_ONLY'
  | 'XMEN_ONLY'
  | 'FF_ONLY'
  | 'VILLAINS_ONLY'
  | 'COSMIC_BATTLE'
  | 'CUSTOM';

export interface GameSettings {
  name: string;
  mode: GameModeId;
  startingBudget: number;
  maxRoster: number;
  minPlayers: number;
  maxPlayers: number;
  auctionSeconds: number;
  minIncrement: number;
  /** Anti-snipe: a bid inside this window pushes the clock out. */
  antiSnipeEnabled: boolean;
  antiSnipeThresholdSeconds: number;
  antiSnipeExtensionSeconds: number;
  /** When true the timer expiring only arms the sale; the host must confirm. */
  manualSaleConfirmation: boolean;
  /** Blocks bids that would strand a player unable to fill mandatory slots. */
  reserveBudgetForSlots: boolean;
  /** Categories the pool is drawn from. Empty = every universe. */
  categories: Universe[];
  /** CUSTOM mode: explicit character allow-list. */
  characterPool: string[] | null;
  isPrivate: boolean;
  password: string | null;
  hostPlays: boolean;
  allowReconnectBidding: boolean;
  /** Lets players skip a lot nobody wants without waiting for the host. */
  passVoteEnabled: boolean;
  scoring: ScoringConfig;
}

/**
 * What a host may change from the lobby. Scoring is deep-partial: hosts routinely tweak
 * a single weight without restating the whole model.
 */
export type ScoringConfigPatch = Partial<Omit<ScoringConfig, 'weights'>> & {
  weights?: Partial<StatWeights>;
};

export type GameSettingsPatch = Partial<Omit<GameSettings, 'scoring'>> & {
  scoring?: ScoringConfigPatch;
};

export interface GameMode {
  id: GameModeId;
  name: string;
  tagline: string;
  overrides: Partial<Omit<GameSettings, 'scoring' | 'name'>>;
}

/* ------------------------------------------------------------------ */
/* Runtime game state                                                  */
/* ------------------------------------------------------------------ */

export type GameStatus = 'LOBBY' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';

export type AuctionState =
  | 'WAITING'
  | 'CHARACTER_REVEALED'
  | 'BIDDING'
  | 'SOLD'
  | 'PASSED'
  | 'PAUSED'
  | 'FINISHED';

export type ConnectionStatus = 'ONLINE' | 'CONNECTING' | 'DISCONNECTED' | 'RECONNECTED';

export interface PlayerPurchase {
  characterId: string;
  price: number;
  round: number;
  at: number;
}

export interface Player {
  id: string;
  name: string;
  teamName: string;
  avatar: string;
  isHost: boolean;
  isSpectator: boolean;
  ready: boolean;
  budget: number;
  spent: number;
  roster: PlayerPurchase[];
  connection: ConnectionStatus;
  lastSeen: number;
  joinedAt: number;
}

export interface AuctionSnapshot {
  state: AuctionState;
  round: number;
  characterId: string | null;
  currentBid: number;
  /** The next legal bid amount. */
  nextMinimumBid: number;
  highestBidderId: string | null;
  /** Absolute epoch ms; clients render the countdown from this. */
  endsAt: number | null;
  /** Remaining ms captured when the auction was paused. */
  pausedRemainingMs: number | null;
  extensions: number;
  /** Set when the timer expired and the host must confirm the sale. */
  awaitingHostSale: boolean;
  /** Player ids who have voted to skip this lot. Cleared on every reveal and on any bid. */
  passVotes: string[];
  /** How many players must agree before the lot is skipped. */
  passVotesNeeded: number;
}

export type FeedKind =
  | 'JOIN'
  | 'LEAVE'
  | 'REVEAL'
  | 'BID'
  | 'SOLD'
  | 'PASSED'
  | 'SYSTEM'
  | 'ANTI_SNIPE'
  | 'ROSTER_FULL'
  | 'PASS_VOTE';

export interface FeedEvent {
  id: string;
  kind: FeedKind;
  message: string;
  at: number;
  playerId?: string;
  characterId?: string;
  amount?: number;
  round?: number;
}

export interface BidRecord {
  id: string;
  round: number;
  characterId: string;
  playerId: string;
  amount: number;
  at: number;
  /** Elapsed ms since the round's auction opened — powers the replay timeline. */
  offsetMs: number;
  triggeredAntiSnipe: boolean;
}

export interface PurchaseRecord {
  id: string;
  round: number;
  characterId: string;
  playerId: string | null;
  price: number;
  at: number;
  bidCount: number;
  passed: boolean;
}

/** The full authoritative room state. The server owns this; clients receive projections. */
export interface GameState {
  id: string;
  code: string;
  status: GameStatus;
  settings: GameSettings;
  hostId: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  players: Player[];
  auction: AuctionSnapshot;
  /** Ids still eligible to be auctioned. */
  remainingPool: string[];
  soldCharacterIds: string[];
  passedCharacterIds: string[];
  purchases: PurchaseRecord[];
  bids: BidRecord[];
  feed: FeedEvent[];
  /** Server clock, so clients can correct for drift. */
  serverTime: number;
}

/* ------------------------------------------------------------------ */
/* Scoring output                                                      */
/* ------------------------------------------------------------------ */

export interface CharacterScore {
  characterId: string;
  power: number;
  contributions: Record<StatKey, number>;
}

export interface SynergyHit {
  ruleId: string;
  name: string;
  description: string;
  members: string[];
  points: number;
}

export interface PillarCoverage {
  id: string;
  label: string;
  roles: Role[];
  weight: number;
  covered: boolean;
  memberIds: string[];
}

export interface BalanceDetail {
  pillars: PillarCoverage[];
  rolesCovered: Role[];
  rolesMissing: Role[];
  coverageRatio: number;
  /** 0-1 reduction applied for stacking the same role too many times. */
  concentrationPenalty: number;
  points: number;
}

export interface PenaltyDetail {
  reason: string;
  points: number;
}

export interface TeamScore {
  playerId: string;
  characterPower: number;
  synergyBonus: number;
  balanceBonus: number;
  leadershipBonus: number;
  penalty: number;
  total: number;
  /** Caps actually applied, for the "how was my score calculated" panel. */
  caps: { synergy: number; balance: number; leadership: number; penalty: number };
  characters: CharacterScore[];
  synergies: SynergyHit[];
  balance: BalanceDetail;
  leadership: { topLeader: string | null; averageLeadership: number; points: number };
  penalties: PenaltyDetail[];
  averagePower: number;
  strongestCharacterId: string | null;
  strongestCharacterPower: number;
}

export interface RankedTeam extends TeamScore {
  rank: number;
  player: Player;
  sharedRank: boolean;
  tieBreak: string | null;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type GameErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'BAD_PASSWORD'
  | 'NAME_TAKEN'
  | 'NOT_HOST'
  | 'NOT_IN_GAME'
  | 'INVALID_STATE'
  | 'ROSTER_FULL'
  | 'INSUFFICIENT_CREDITS'
  | 'BID_TOO_LOW'
  | 'ALREADY_HIGHEST'
  | 'CHARACTER_SOLD'
  | 'AUCTION_ENDED'
  | 'RECONNECTING'
  | 'RATE_LIMITED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'POOL_EMPTY'
  | 'VALIDATION';

export interface GameError {
  code: GameErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: GameError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(code: GameErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}
