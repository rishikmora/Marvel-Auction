import { SEED_CHARACTERS } from '@/game/data';
import type { Character } from '@/game/types';
import { singleton } from './singleton';
import { store } from './store';

/**
 * The live character registry: the shipped seed dataset with admin edits layered on top.
 *
 * Everything downstream (auction pool, scoring, admin panel, API) reads through here, so
 * the seed files stay a pure dataset and admin edits survive restarts.
 */
class CharacterRegistry {
  private merged: Character[] | null = null;

  private async build(): Promise<Character[]> {
    if (this.merged) return this.merged;
    const admin = await store.getAdmin();
    const removed = new Set(admin.removedCharacterIds);
    const overrides = admin.characterOverrides ?? {};

    const result: Character[] = [];
    for (const character of SEED_CHARACTERS) {
      if (removed.has(character.id)) continue;
      result.push(overrides[character.id] ?? character);
    }
    // Characters created in the admin panel have no seed counterpart.
    const seedIds = new Set(SEED_CHARACTERS.map((character) => character.id));
    for (const [id, character] of Object.entries(overrides)) {
      if (!seedIds.has(id) && !removed.has(id)) result.push(character);
    }

    this.merged = result;
    return result;
  }

  invalidate(): void {
    this.merged = null;
  }

  async all(): Promise<Character[]> {
    return this.build();
  }

  async byId(id: string): Promise<Character | undefined> {
    const all = await this.build();
    return all.find((character) => character.id === id);
  }

  async map(): Promise<Map<string, Character>> {
    const all = await this.build();
    return new Map(all.map((character) => [character.id, character]));
  }

  async upsert(character: Character): Promise<Character> {
    const admin = await store.getAdmin();
    await store.saveAdmin({
      characterOverrides: { ...admin.characterOverrides, [character.id]: character },
      removedCharacterIds: admin.removedCharacterIds.filter((id) => id !== character.id),
    });
    this.invalidate();
    return character;
  }

  async remove(id: string): Promise<void> {
    const admin = await store.getAdmin();
    const overrides = { ...admin.characterOverrides };
    delete overrides[id];
    await store.saveAdmin({
      characterOverrides: overrides,
      removedCharacterIds: Array.from(new Set([...admin.removedCharacterIds, id])),
    });
    this.invalidate();
  }

  /** Drops every admin edit and returns to the shipped dataset. */
  async reset(): Promise<void> {
    await store.saveAdmin({ characterOverrides: {}, removedCharacterIds: [] });
    this.invalidate();
  }
}

// One registry, so an admin edit is visible to new rooms immediately.
export const characterRegistry = singleton('characterRegistry', () => new CharacterRegistry());
