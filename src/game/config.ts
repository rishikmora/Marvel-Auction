import type {
  GameMode,
  GameModeId,
  GameSettings,
  ScoringConfig,
  StatWeights,
  Universe,
} from './types';
import { STAT_KEYS } from './types';

/**
 * Default weighted scoring model. Weights are the tuning surface admins and hosts
 * touch most, so they live in configuration rather than in the scoring code.
 */
export const DEFAULT_WEIGHTS: StatWeights = {
  strength: 0.15,
  speed: 0.1,
  durability: 0.15,
  intelligence: 0.1,
  combat: 0.15,
  energy: 0.15,
  versatility: 0.1,
  leadership: 0.05,
  specialAbility: 0.05,
};

export const DEFAULT_SCORING: ScoringConfig = {
  weights: { ...DEFAULT_WEIGHTS },
  powerScale: 10,
  maxSynergyPct: 0.15,
  maxBalancePct: 0.1,
  maxLeadershipPct: 0.05,
  maxPenaltyPct: 0.08,
  redundancyThreshold: 3,
  redundancyPenaltyPerExcess: 45,
};

/**
 * Weights are user-editable, so never trust them to sum to 1.
 * Normalising keeps character power on a stable 0-100 scale whatever the host types.
 */
export function normalizeWeights(weights: Partial<StatWeights>): StatWeights {
  const filled = {} as StatWeights;
  let total = 0;
  for (const key of STAT_KEYS) {
    const raw = Number(weights[key]);
    const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
    filled[key] = value;
    total += value;
  }
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  for (const key of STAT_KEYS) filled[key] = filled[key] / total;
  return filled;
}

export const ALL_UNIVERSES: Universe[] = [
  'AVENGERS',
  'X_MEN',
  'FANTASTIC_FOUR',
  'GUARDIANS',
  'SPIDER_VERSE',
  'COSMIC',
  'VILLAINS',
  'STREET',
  'MYSTIC',
];

export const UNIVERSE_LABELS: Record<Universe, string> = {
  AVENGERS: 'Avengers',
  X_MEN: 'X-Men',
  FANTASTIC_FOUR: 'Fantastic Four',
  GUARDIANS: 'Guardians',
  SPIDER_VERSE: 'Spider-Verse',
  COSMIC: 'Cosmic',
  VILLAINS: 'Villains',
  STREET: 'Street Level',
  MYSTIC: 'Mystic',
};

export const DEFAULT_SETTINGS: GameSettings = {
  name: 'Marvel Auction Battle',
  mode: 'CLASSIC',
  startingBudget: 1000,
  maxRoster: 7,
  minPlayers: 2,
  maxPlayers: 10,
  auctionSeconds: 30,
  minIncrement: 10,
  antiSnipeEnabled: true,
  antiSnipeThresholdSeconds: 5,
  antiSnipeExtensionSeconds: 5,
  manualSaleConfirmation: false,
  reserveBudgetForSlots: true,
  categories: [],
  characterPool: null,
  isPrivate: false,
  password: null,
  hostPlays: true,
  allowReconnectBidding: true,
  passVoteEnabled: true,
  scoring: DEFAULT_SCORING,
};

/**
 * Modes are declarative setting overlays. Adding a mode means adding a row here —
 * no engine changes required.
 */
export const GAME_MODES: GameMode[] = [
  {
    id: 'CLASSIC',
    name: 'Classic Auction',
    tagline: '7 heroes. Fixed budget. Highest team power rules the universe.',
    overrides: {},
  },
  {
    id: 'FAST',
    name: 'Fast Auction',
    tagline: '15-second clocks. Think fast or lose the hero.',
    overrides: { auctionSeconds: 15, antiSnipeExtensionSeconds: 4 },
  },
  {
    id: 'HARDCORE',
    name: 'Hardcore',
    tagline: 'Thin budget, steep increments, and no anti-snipe mercy.',
    overrides: {
      startingBudget: 700,
      minIncrement: 25,
      antiSnipeEnabled: false,
      auctionSeconds: 20,
      passVoteEnabled: false,
    },
  },
  {
    id: 'RANDOM_UNIVERSE',
    name: 'Random Universe',
    tagline: 'A shuffled pool drawn from every corner of the multiverse.',
    overrides: { categories: [] },
  },
  {
    id: 'AVENGERS_ONLY',
    name: 'Avengers Only',
    tagline: 'Earth’s mightiest, and nothing else.',
    overrides: { categories: ['AVENGERS'] },
  },
  {
    id: 'XMEN_ONLY',
    name: 'X-Men Only',
    tagline: 'Mutants take the floor.',
    overrides: { categories: ['X_MEN'] },
  },
  {
    id: 'FF_ONLY',
    name: 'Fantastic Four',
    tagline: 'The first family and their rogues.',
    overrides: { categories: ['FANTASTIC_FOUR'] },
  },
  {
    id: 'VILLAINS_ONLY',
    name: 'Villains Only',
    tagline: 'No heroes. No mercy. Build the syndicate.',
    overrides: { categories: ['VILLAINS'] },
  },
  {
    id: 'COSMIC_BATTLE',
    name: 'Cosmic Battle',
    tagline: 'Reality-warpers and world-eaters. Budgets get heavy.',
    overrides: { categories: ['COSMIC'], startingBudget: 1400, minIncrement: 20 },
  },
  {
    id: 'CUSTOM',
    name: 'Custom Universe',
    tagline: 'Hand-pick every character that enters the vault.',
    overrides: {},
  },
];

export const GAME_MODE_MAP: Record<GameModeId, GameMode> = GAME_MODES.reduce(
  (acc, mode) => {
    acc[mode.id] = mode;
    return acc;
  },
  {} as Record<GameModeId, GameMode>,
);

export function applyMode(base: GameSettings, mode: GameModeId): GameSettings {
  const definition = GAME_MODE_MAP[mode];
  if (!definition) return base;
  return { ...base, ...definition.overrides, mode };
}

export const AVATARS = [
  'shield',
  'hammer',
  'arc',
  'claw',
  'web',
  'star',
  'flame',
  'gem',
  'bolt',
  'skull',
  'eye',
  'crown',
] as const;

export type AvatarId = (typeof AVATARS)[number];
