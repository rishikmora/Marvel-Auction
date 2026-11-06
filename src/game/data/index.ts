import type { Character, Universe } from '../types';
import { AVENGERS } from './avengers';
import { COSMIC } from './cosmic';
import { FANTASTIC_FOUR } from './fantastic-four';
import { GUARDIANS } from './guardians';
import { MYSTIC } from './mystic';
import { SPIDER_VERSE } from './spider-verse';
import { STREET } from './street';
import { VILLAINS } from './villains';
import { XMEN } from './xmen';

export { SYNERGY_RULES } from './synergy-rules';
export { COUNTER_RELATIONSHIPS } from './counters';
export * from './character-utils';

/**
 * The shipped seed dataset. The live registry (server/characters.ts) layers admin
 * edits on top of this, so replacing or expanding the dataset means editing these
 * files only — nothing downstream is aware of where a character came from.
 */
export const SEED_CHARACTERS: Character[] = [
  ...AVENGERS,
  ...XMEN,
  ...FANTASTIC_FOUR,
  ...GUARDIANS,
  ...SPIDER_VERSE,
  ...COSMIC,
  ...VILLAINS,
  ...STREET,
  ...MYSTIC,
];

export function indexById(characters: Character[]): Map<string, Character> {
  return new Map(characters.map((character) => [character.id, character]));
}

/** A character belongs to a universe if it is listed in any of its categories. */
export function inUniverse(character: Character, universe: Universe): boolean {
  return character.categories.includes(universe);
}

export function filterByCategories(characters: Character[], categories: Universe[]): Character[] {
  if (!categories.length) return [...characters];
  return characters.filter((character) =>
    categories.some((category) => inUniverse(character, category)),
  );
}

export function groupByUniverse(characters: Character[]): Record<Universe, Character[]> {
  const grouped = {} as Record<Universe, Character[]>;
  for (const character of characters) {
    for (const category of character.categories) {
      (grouped[category] ??= []).push(character);
    }
  }
  return grouped;
}
