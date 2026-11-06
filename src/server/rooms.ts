import { DEFAULT_SETTINGS, normalizeWeights } from '@/game/config';
import type { GameSettings, GameSettingsPatch } from '@/game/types';
import { buildAchievements } from '@/game/achievements';
import { characterRegistry } from './characters';
import { AuctionRoom } from './engine';
import { roomCode } from './ids';
import { singleton } from './singleton';
import { store } from './store';

const IDLE_MS = 1000 * 60 * 90; // rooms with no activity for 90 minutes are reclaimed
const SWEEP_MS = 1000 * 60 * 5;

/**
 * Holds every live auction in the process and keeps rooms isolated from one another —
 * many concurrent games run side by side without sharing timers, pools or state.
 */
class RoomManager {
  private readonly rooms = new Map<string, AuctionRoom>();
  private readonly archived = new Set<string>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  private ensureSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), SWEEP_MS);
    this.sweeper.unref?.();
  }

  async create(input: {
    settings: GameSettingsPatch;
    host: { id: string; name: string; teamName: string; avatar: string };
  }): Promise<AuctionRoom> {
    const characters = await characterRegistry.all();
    const scoringPatch = input.settings.scoring ?? {};
    const settings: GameSettings = {
      ...DEFAULT_SETTINGS,
      ...input.settings,
      scoring: {
        ...DEFAULT_SETTINGS.scoring,
        ...scoringPatch,
        weights: normalizeWeights({
          ...DEFAULT_SETTINGS.scoring.weights,
          ...(scoringPatch.weights ?? {}),
        }),
      },
    };

    let code = roomCode();
    while (this.rooms.has(code)) code = roomCode();

    const room = new AuctionRoom({ code, settings, host: input.host, characters });
    this.rooms.set(code, room);
    this.ensureSweeper();

    // Archive automatically the moment a game finishes, whoever triggered it.
    room.subscribe((updated) => {
      if (updated.state.status === 'FINISHED' && !this.archived.has(updated.state.id)) {
        this.archived.add(updated.state.id);
        void this.archive(updated);
      }
    });

    return room;
  }

  byCode(code: string): AuctionRoom | undefined {
    return this.rooms.get(code);
  }

  all(): AuctionRoom[] {
    return [...this.rooms.values()];
  }

  listPublic(): {
    code: string;
    name: string;
    mode: string;
    players: number;
    maxPlayers: number;
    status: string;
    hostName: string;
  }[] {
    return this.all()
      .filter((room) => !room.state.settings.isPrivate && room.state.status === 'LOBBY')
      .map((room) => ({
        code: room.state.code,
        name: room.state.settings.name,
        mode: room.state.settings.mode,
        players: room.state.players.length,
        maxPlayers: room.state.settings.maxPlayers,
        status: room.state.status,
        hostName: room.host?.name ?? 'Host',
      }));
  }

  remove(code: string): void {
    const room = this.rooms.get(code);
    room?.destroy();
    this.rooms.delete(code);
  }

  private async archive(room: AuctionRoom): Promise<void> {
    try {
      const rankings = room.leaderboard();
      const characters = await characterRegistry.map();
      const winners = rankings.filter((team) => team.rank === 1);

      await store.archiveGame({
        id: room.state.id,
        code: room.state.code,
        name: room.state.settings.name,
        mode: room.state.settings.mode,
        hostName: room.host?.name ?? 'Host',
        finishedAt: room.state.finishedAt ?? Date.now(),
        startedAt: room.state.startedAt,
        playerCount: room.contenders.length,
        winnerNames: winners.map((team) => team.player.name),
        winnerPower: winners[0]?.total ?? 0,
        state: room.snapshot(),
        rankings,
      });

      const achievements = buildAchievements(room.snapshot(), rankings, characters);
      await store.recordResults({
        players: room.contenders.map((player) => ({
          name: player.name,
          avatar: player.avatar,
          spent: player.spent,
          characters: player.roster.length,
          highest: player.roster.reduce((max, entry) => Math.max(max, entry.price), 0),
        })),
        winnerNames: winners.map((team) => team.player.name),
        achievements,
      });
    } catch (error) {
      // Archiving must never take down a live process.
      console.error('[rooms] failed to archive game', error);
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const lastActivity = Math.max(
        room.state.createdAt,
        room.state.finishedAt ?? 0,
        ...room.state.players.map((player) => player.lastSeen),
      );
      const stale = now - lastActivity > IDLE_MS;
      const abandoned = room.state.players.every(
        (player) => player.connection === 'DISCONNECTED',
      );
      if (stale || (abandoned && now - lastActivity > IDLE_MS / 3)) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
  }
}

// Live rooms must be visible to the REST API as well as the socket layer.
export const roomManager = singleton('roomManager', () => new RoomManager());
