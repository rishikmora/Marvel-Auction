import { DEFAULT_WEIGHTS } from '../config';
import type { Character, CharacterStats, Rarity, Role, Tier, Universe } from '../types';

/**
 * Compact authoring format for the seed dataset.
 *
 * Stats are a fixed-order tuple so a 110-character roster stays readable and diffable:
 * [strength, speed, durability, intelligence, combat, energy, versatility, leadership, special]
 */
export type StatTuple = [
  strength: number,
  speed: number,
  durability: number,
  intelligence: number,
  combat: number,
  energy: number,
  versatility: number,
  leadership: number,
  specialAbility: number,
];

export interface CharacterSeed {
  id: string;
  name: string;
  alias: string;
  /** Extra categories beyond the file's primary universe. */
  also?: Universe[];
  roles: Role[];
  stats: StatTuple;
  tags: string[];
  abilities: string[];
  desc: string;
  palette: [string, string];
  glyph: string;
  tier: Tier;
  /** Overrides for the derived values; the admin panel writes these. */
  rarity?: Rarity;
  basePrice?: number;
  imageUrl?: string;
}

export function toStats(tuple: StatTuple): CharacterStats {
  const [strength, speed, durability, intelligence, combat, energy, versatility, leadership, specialAbility] =
    tuple;
  return {
    strength,
    speed,
    durability,
    intelligence,
    combat,
    energy,
    versatility,
    leadership,
    specialAbility,
  };
}

/** Reference power under the default weights, used only to derive rarity + base price. */
function referencePower(stats: CharacterStats): number {
  let total = 0;
  total += stats.strength * DEFAULT_WEIGHTS.strength;
  total += stats.speed * DEFAULT_WEIGHTS.speed;
  total += stats.durability * DEFAULT_WEIGHTS.durability;
  total += stats.intelligence * DEFAULT_WEIGHTS.intelligence;
  total += stats.combat * DEFAULT_WEIGHTS.combat;
  total += stats.energy * DEFAULT_WEIGHTS.energy;
  total += stats.versatility * DEFAULT_WEIGHTS.versatility;
  total += stats.leadership * DEFAULT_WEIGHTS.leadership;
  total += stats.specialAbility * DEFAULT_WEIGHTS.specialAbility;
  return total * 10;
}

function deriveRarity(power: number): Rarity {
  if (power >= 890) return 'MYTHIC';
  if (power >= 810) return 'LEGENDARY';
  if (power >= 720) return 'EPIC';
  if (power >= 620) return 'RARE';
  return 'COMMON';
}

/**
 * Recommended minimum auction value.
 *
 * Deliberately superlinear: a linear curve compressed everyone into a narrow band and
 * removed the interesting decision. With this curve a top-tier buy costs roughly a
 * fifth of the default 1000-credit budget, so committing to one legend is a real
 * trade-off against filling the remaining six slots.
 */
const PRICE_FLOOR_POWER = 380;
const PRICE_CEIL_POWER = 960;

function deriveBasePrice(power: number): number {
  const t = Math.max(0, Math.min(1, (power - PRICE_FLOOR_POWER) / (PRICE_CEIL_POWER - PRICE_FLOOR_POWER)));
  const raw = 25 + Math.pow(t, 1.9) * 190;
  return Math.round(raw / 5) * 5;
}

export function buildCharacters(universe: Universe, seeds: CharacterSeed[]): Character[] {
  return seeds.map((seed) => {
    const stats = toStats(seed.stats);
    const power = referencePower(stats);
    const categories = [universe, ...(seed.also ?? [])];
    return {
      id: seed.id,
      name: seed.name,
      alias: seed.alias,
      universe,
      categories: Array.from(new Set(categories)),
      roles: seed.roles,
      stats,
      tier: seed.tier,
      rarity: seed.rarity ?? deriveRarity(power),
      basePrice: seed.basePrice ?? deriveBasePrice(power),
      description: seed.desc,
      specialAbilities: seed.abilities,
      synergyTags: seed.tags,
      imageUrl: seed.imageUrl,
      palette: seed.palette,
      glyph: seed.glyph,
    } satisfies Character;
  });
}
