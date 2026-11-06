import { z } from 'zod';
import type { StatKey, Universe } from '@/game/types';

/**
 * Every inbound socket payload is parsed through these schemas before it reaches the
 * engine. Nothing from a client is trusted: strings are length-bounded, numbers are
 * bounded and integral, and unknown keys are stripped rather than passed through.
 */

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // Drop control characters and angle brackets so nothing can smuggle markup into the feed.
    .transform((value) =>
      Array.from(value)
        .filter((ch) => {
          const code = ch.codePointAt(0) ?? 0;
          return code > 31 && code !== 127 && ch !== '<' && ch !== '>';
        })
        .join('')
        .trim(),
    )
    .refine((value) => value.length > 0, 'Required');

/**
 * Declared as const tuples rather than cast from the runtime arrays, so zod infers the
 * literal unions and the parsed output is assignable to the domain types directly.
 */
const UNIVERSE_VALUES = [
  'AVENGERS',
  'X_MEN',
  'FANTASTIC_FOUR',
  'GUARDIANS',
  'SPIDER_VERSE',
  'COSMIC',
  'VILLAINS',
  'STREET',
  'MYSTIC',
] as const;

const STAT_VALUES = [
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

// Fails to compile if the schema list and the domain ever drift apart.
const _universeParity: Universe[] = [...UNIVERSE_VALUES];
const _statParity: StatKey[] = [...STAT_VALUES];
void _universeParity;
void _statParity;

export const universeSchema = z.enum(UNIVERSE_VALUES);

export const scoringSchema = z
  .object({
    weights: z.record(z.enum(STAT_VALUES), z.number().min(0).max(1)),
    powerScale: z.number().min(1).max(100),
    maxSynergyPct: z.number().min(0).max(0.5),
    maxBalancePct: z.number().min(0).max(0.5),
    maxLeadershipPct: z.number().min(0).max(0.5),
    maxPenaltyPct: z.number().min(0).max(0.5),
    redundancyThreshold: z.number().int().min(1).max(7),
    redundancyPenaltyPerExcess: z.number().min(0).max(500),
  })
  .partial();

export const settingsSchema = z
  .object({
    name: safeText(40),
    mode: z.enum([
      'CLASSIC',
      'FAST',
      'HARDCORE',
      'RANDOM_UNIVERSE',
      'AVENGERS_ONLY',
      'XMEN_ONLY',
      'FF_ONLY',
      'VILLAINS_ONLY',
      'COSMIC_BATTLE',
      'CUSTOM',
    ]),
    startingBudget: z.number().int().min(100).max(100000),
    maxRoster: z.number().int().min(1).max(12),
    minPlayers: z.number().int().min(1).max(24),
    maxPlayers: z.number().int().min(2).max(24),
    auctionSeconds: z.number().int().min(5).max(300),
    minIncrement: z.number().int().min(1).max(500),
    antiSnipeEnabled: z.boolean(),
    antiSnipeThresholdSeconds: z.number().int().min(1).max(60),
    antiSnipeExtensionSeconds: z.number().int().min(1).max(60),
    manualSaleConfirmation: z.boolean(),
    reserveBudgetForSlots: z.boolean(),
    categories: z.array(universeSchema).max(12),
    characterPool: z.array(z.string().max(60)).max(400).nullable(),
    isPrivate: z.boolean(),
    password: z.string().max(40).nullable(),
    hostPlays: z.boolean(),
    allowReconnectBidding: z.boolean(),
    passVoteEnabled: z.boolean(),
    scoring: scoringSchema,
  })
  .partial();

const identity = {
  name: safeText(20),
  teamName: z.string().trim().max(28).default(''),
  avatar: z.string().trim().max(24).default('shield'),
};

export const createRoomSchema = z.object({
  settings: settingsSchema.default({}),
  host: z.object(identity),
});

export const joinRoomSchema = z.object({
  code: z.string().trim().min(3).max(20),
  ...identity,
  password: z.string().max(40).optional(),
});

export const resumeSchema = z.object({
  code: z.string().trim().min(3).max(20),
  playerId: z.string().min(4).max(64),
  token: z.string().min(8).max(128),
});

export const readySchema = z.object({ ready: z.boolean() });

export const profileSchema = z.object({
  teamName: z.string().trim().max(28).optional(),
  avatar: z.string().trim().max(24).optional(),
});

export const settingsPatchSchema = z.object({ patch: settingsSchema });

export const kickSchema = z.object({ playerId: z.string().min(4).max(64) });

export const revealSchema = z.object({ characterId: z.string().max(60).optional() });

export const extendSchema = z.object({ seconds: z.number().int().min(1).max(120) });

export const bidSchema = z.object({
  amount: z.number().int().positive().max(1_000_000),
});

export const passVoteSchema = z.object({ pass: z.boolean().default(true) });

export const emptySchema = z.object({}).passthrough().default({});

/** Admin REST payloads. */
export const characterSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens'),
  name: safeText(48),
  alias: z.string().trim().max(48).default(''),
  universe: universeSchema,
  categories: z.array(universeSchema).min(1).max(9),
  roles: z
    .array(
      z.enum([
        'TANK',
        'DAMAGE',
        'SUPPORT',
        'LEADER',
        'STRATEGIST',
        'SPEEDSTER',
        'RANGED',
        'MAGICAL',
        'COSMIC',
        'TECH',
        'MUTANT',
        'ASSASSIN',
      ]),
    )
    .min(1)
    .max(6),
  stats: z.object(
    Object.fromEntries(STAT_VALUES.map((key) => [key, z.number().min(0).max(100)])) as Record<
      StatKey,
      z.ZodNumber
    >,
  ),
  tier: z.enum(['STREET', 'ENHANCED', 'ELITE', 'COSMIC', 'OMEGA']),
  rarity: z.enum(['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']),
  basePrice: z.number().int().min(1).max(5000),
  description: z.string().trim().max(280).default(''),
  specialAbilities: z.array(z.string().trim().max(80)).max(8).default([]),
  synergyTags: z.array(z.string().trim().max(40)).max(16).default([]),
  imageUrl: z.string().trim().max(500).optional(),
  palette: z.tuple([z.string().max(20), z.string().max(20)]),
  glyph: z.string().trim().max(4).default('??'),
});
