import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Character, GameState, RankedTeam, ScoringConfig } from '@/game/types';
import { singleton } from './singleton';

/**
 * Durable state lives behind this interface so the JSON driver below can be swapped
 * for the PostgreSQL schema in db/schema.sql without touching callers. The JSON driver
 * is the zero-config default: it runs anywhere Node runs and needs no provisioning.
 */
export interface ArchivedGame {
  id: string;
  code: string;
  name: string;
  mode: string;
  hostName: string;
  finishedAt: number;
  startedAt: number | null;
  playerCount: number;
  winnerNames: string[];
  winnerPower: number;
  /** Everything the replay, history and war-room screens need to reconstruct the game. */
  state: GameState;
  rankings: RankedTeam[];
}

export interface PlayerProfile {
  name: string;
  avatar: string;
  gamesPlayed: number;
  wins: number;
  charactersWon: number;
  creditsSpent: number;
  highestPurchase: number;
  achievements: string[];
  updatedAt: number;
}

export interface AdminState {
  /** Characters added or edited through the admin panel, keyed by id. */
  characterOverrides: Record<string, Character>;
  /** Ids of seed characters the admin removed. */
  removedCharacterIds: string[];
  scoring: ScoringConfig | null;
}

interface StoreShape {
  archives: ArchivedGame[];
  profiles: Record<string, PlayerProfile>;
  admin: AdminState;
}

const EMPTY: StoreShape = {
  archives: [],
  profiles: {},
  admin: { characterOverrides: {}, removedCharacterIds: [], scoring: null },
};

const DATA_DIR = process.env.MARVEL_DATA_DIR
  ? path.resolve(process.env.MARVEL_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const MAX_ARCHIVES = 200;

class JsonStore {
  private cache: StoreShape | null = null;
  private writing: Promise<void> = Promise.resolve();

  private async load(): Promise<StoreShape> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreShape>;
      this.cache = {
        archives: parsed.archives ?? [],
        profiles: parsed.profiles ?? {},
        admin: { ...EMPTY.admin, ...(parsed.admin ?? {}) },
      };
    } catch {
      // A missing or corrupt file is not fatal — the game is playable without history.
      this.cache = structuredClone(EMPTY);
    }
    return this.cache;
  }

  /** Serialised, write-to-temp-then-rename so a crash mid-write cannot truncate the file. */
  private async persist(): Promise<void> {
    const snapshot = this.cache;
    if (!snapshot) return;
    this.writing = this.writing.then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const temp = `${DATA_FILE}.${process.pid}.tmp`;
      await fs.writeFile(temp, JSON.stringify(snapshot), 'utf8');
      await fs.rename(temp, DATA_FILE);
    });
    await this.writing;
  }

  /* --------------------------- archives --------------------------- */

  async archiveGame(entry: ArchivedGame): Promise<void> {
    const store = await this.load();
    store.archives = [entry, ...store.archives.filter((game) => game.id !== entry.id)].slice(
      0,
      MAX_ARCHIVES,
    );
    await this.persist();
  }

  async listArchives(limit = 25): Promise<ArchivedGame[]> {
    const store = await this.load();
    return store.archives.slice(0, limit);
  }

  async getArchive(idOrCode: string): Promise<ArchivedGame | null> {
    const store = await this.load();
    const needle = idOrCode.toUpperCase();
    return (
      store.archives.find((game) => game.id === idOrCode || game.code.toUpperCase() === needle) ??
      null
    );
  }

  /* --------------------------- profiles --------------------------- */

  async recordResults(input: {
    players: { name: string; avatar: string; spent: number; characters: number; highest: number }[];
    winnerNames: string[];
    achievements: Record<string, string[]>;
  }): Promise<void> {
    const store = await this.load();
    for (const player of input.players) {
      const key = player.name.toLowerCase();
      const existing: PlayerProfile = store.profiles[key] ?? {
        name: player.name,
        avatar: player.avatar,
        gamesPlayed: 0,
        wins: 0,
        charactersWon: 0,
        creditsSpent: 0,
        highestPurchase: 0,
        achievements: [],
        updatedAt: 0,
      };
      existing.name = player.name;
      existing.avatar = player.avatar;
      existing.gamesPlayed += 1;
      if (input.winnerNames.includes(player.name)) existing.wins += 1;
      existing.charactersWon += player.characters;
      existing.creditsSpent += player.spent;
      existing.highestPurchase = Math.max(existing.highestPurchase, player.highest);
      const earned = input.achievements[player.name] ?? [];
      existing.achievements = Array.from(new Set([...existing.achievements, ...earned]));
      existing.updatedAt = Date.now();
      store.profiles[key] = existing;
    }
    await this.persist();
  }

  async getProfile(name: string): Promise<PlayerProfile | null> {
    const store = await this.load();
    return store.profiles[name.toLowerCase()] ?? null;
  }

  async listProfiles(limit = 50): Promise<PlayerProfile[]> {
    const store = await this.load();
    return Object.values(store.profiles)
      .sort((a, b) => b.wins - a.wins || b.charactersWon - a.charactersWon)
      .slice(0, limit);
  }

  /* ----------------------------- admin ---------------------------- */

  async getAdmin(): Promise<AdminState> {
    const store = await this.load();
    return store.admin;
  }

  async saveAdmin(patch: Partial<AdminState>): Promise<AdminState> {
    const store = await this.load();
    store.admin = { ...store.admin, ...patch };
    await this.persist();
    return store.admin;
  }

  /* ---------------------------- metrics --------------------------- */

  async globalStats(): Promise<{
    gamesPlayed: number;
    charactersAuctioned: number;
    creditsSpent: number;
    topCharacter: { characterId: string; count: number } | null;
  }> {
    const store = await this.load();
    let charactersAuctioned = 0;
    let creditsSpent = 0;
    const counts = new Map<string, number>();
    for (const game of store.archives) {
      for (const purchase of game.state.purchases) {
        if (purchase.passed) continue;
        charactersAuctioned += 1;
        creditsSpent += purchase.price;
        counts.set(purchase.characterId, (counts.get(purchase.characterId) ?? 0) + 1);
      }
    }
    let topCharacter: { characterId: string; count: number } | null = null;
    for (const [characterId, count] of counts) {
      if (!topCharacter || count > topCharacter.count) topCharacter = { characterId, count };
    }
    return {
      gamesPlayed: store.archives.length,
      charactersAuctioned,
      creditsSpent,
      topCharacter,
    };
  }
}

// Shared across the socket layer and Next's route handlers — see singleton.ts.
export const store = singleton('store', () => new JsonStore());
