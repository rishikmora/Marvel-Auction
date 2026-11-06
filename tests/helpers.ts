import { DEFAULT_SETTINGS } from '@/game/config';
import { SEED_CHARACTERS } from '@/game/data';
import type { Character, GameSettings } from '@/game/types';
import { AuctionRoom, type Scheduler } from '@/server/engine';

/** A clock the tests drive by hand, so timer behaviour is deterministic. */
export class TestClock {
  private current = 1_700_000_000_000;
  private timers: { id: number; at: number; callback: () => void }[] = [];
  private nextId = 1;

  now = (): number => this.current;

  scheduler: Scheduler = {
    set: (callback, ms) => {
      const id = this.nextId++;
      this.timers.push({ id, at: this.current + ms, callback });
      return id;
    },
    clear: (handle) => {
      this.timers = this.timers.filter((timer) => timer.id !== handle);
    },
  };

  /** Advance time, firing any timers that come due along the way. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.timers
        .filter((timer) => timer.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((timer) => timer.id !== due.id);
      this.current = due.at;
      due.callback();
    }
    this.current = target;
  }
}

export const characterById = new Map(SEED_CHARACTERS.map((c) => [c.id, c]));

export function pick(...ids: string[]): Character[] {
  return ids.map((id) => {
    const character = characterById.get(id);
    if (!character) throw new Error(`Unknown test character: ${id}`);
    return character;
  });
}

export interface TestRoomOptions {
  settings?: Partial<GameSettings>;
  characters?: Character[];
  players?: { id: string; name: string }[];
}

export function makeRoom(options: TestRoomOptions = {}) {
  const clock = new TestClock();
  const characters = options.characters ?? SEED_CHARACTERS;

  const room = new AuctionRoom({
    code: 'TEST01',
    settings: { ...DEFAULT_SETTINGS, ...options.settings } as GameSettings,
    host: { id: 'host', name: 'Host', teamName: 'Team Host', avatar: 'shield' },
    characters,
    now: clock.now,
    scheduler: clock.scheduler,
    // Deterministic pool order: no shuffling in tests.
    random: () => 0,
  });

  for (const player of options.players ?? [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Omega' }]) {
    const result = room.join({
      playerId: player.id,
      name: player.name,
      teamName: `Team ${player.name}`,
      avatar: 'star',
      // Seat the default players even when the fixture is a password-protected room.
      password: room.state.settings.password,
    });
    if (!result.ok) throw new Error(`join failed: ${result.error.message}`);
  }

  return { room, clock };
}

/** Drives a room to an open auction on a specific character. */
export function openLotFor(
  room: AuctionRoom,
  characterId: string,
): void {
  const start = room.start('host');
  if (!start.ok && room.state.status !== 'ACTIVE') {
    throw new Error(`start failed: ${start.error.message}`);
  }
  const reveal = room.revealCharacter('host', characterId);
  if (!reveal.ok) throw new Error(`reveal failed: ${reveal.error.message}`);
  const open = room.startBidding('host');
  if (!open.ok) throw new Error(`open failed: ${open.error.message}`);
}
