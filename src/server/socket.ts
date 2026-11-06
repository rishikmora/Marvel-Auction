import { randomBytes } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { FeedEvent, GameError, GameErrorCode, Result } from '@/game/types';
import type {
  Ack,
  ClientToServerEvents,
  Pulse,
  PublicGameState,
  ServerToClientEvents,
  ViewerState,
} from '@/lib/protocol';
import { AuctionRoom } from './engine';
import {
  bidSchema,
  createRoomSchema,
  passVoteSchema,
  extendSchema,
  joinRoomSchema,
  kickSchema,
  profileSchema,
  readySchema,
  resumeSchema,
  revealSchema,
  settingsPatchSchema,
} from './events';
import { id, normalizeRoomCode } from './ids';
import { rateLimiter } from './ratelimit';
import { roomManager } from './rooms';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface Session {
  code: string;
  playerId: string;
}

/** playerId -> secret. Presented on resume so a known playerId alone cannot be hijacked. */
const tokens = new Map<string, string>();
const sessions = new Map<string, Session>();

/** Cached per-room values used to detect what changed between broadcasts. */
const roomCursors = new Map<string, { lastFeedId: string | null; lastLeaderId: string | null; lastTopTeam: string | null }>();
const wiredRooms = new Set<string>();

const tokenKey = (code: string, playerId: string) => `${code}:${playerId}`;

function fail(error: GameError): Ack<never> {
  return { ok: false, error };
}

function ok<T>(data: T): Ack<T> {
  return { ok: true, data };
}

function errResult(code: GameErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

/* ------------------------------------------------------------------ */
/* Projections                                                         */
/* ------------------------------------------------------------------ */

/** Trims the wire payload: only the live round's bids travel on the realtime channel. */
export function projectState(room: AuctionRoom): PublicGameState {
  const snapshot = room.snapshot();
  const round = snapshot.auction.round;
  const { bids, ...rest } = snapshot;
  return {
    ...rest,
    bids: bids.filter((bid) => bid.round === round).slice(-40),
    totalBids: bids.length,
  };
}

export function viewerFor(room: AuctionRoom, playerId: string): ViewerState {
  const player = room.player(playerId);
  const settings = room.state.settings;
  const auction = room.state.auction;

  if (!player) {
    return {
      playerId,
      isHost: false,
      isSpectator: true,
      canBid: false,
      blockedReason: 'You are watching this auction.',
      maxBid: 0,
      nextMinimumBid: auction.nextMinimumBid,
      quickBids: [],
      rosterFull: false,
      slotsRemaining: 0,
      canVotePass: false,
      hasVotedPass: false,
      passVotes: auction.passVotes.length,
      passVotesNeeded: auction.passVotesNeeded,
    };
  }

  const eligibility = room.canBid(playerId);
  const maxBid = room.maxBidFor(playerId);
  const slotsRemaining = settings.maxRoster - player.roster.length;

  const character = room.currentCharacter;
  const anchor = auction.currentBid > 0 ? auction.currentBid : (character?.basePrice ?? 0) - settings.minIncrement;
  const quickBids = Array.from(
    new Set([settings.minIncrement, 20, 50, 100].map((step) => anchor + step)),
  )
    .filter((amount) => amount >= auction.nextMinimumBid && amount <= maxBid)
    .sort((a, b) => a - b)
    .slice(0, 4);

  return {
    playerId,
    isHost: player.isHost,
    isSpectator: player.isSpectator,
    canBid: eligibility.ok,
    blockedReason: eligibility.ok ? null : eligibility.error.message,
    maxBid,
    nextMinimumBid: auction.nextMinimumBid,
    quickBids,
    rosterFull: player.roster.length >= settings.maxRoster,
    slotsRemaining: Math.max(0, slotsRemaining),
    canVotePass: room.canVotePass(playerId).ok,
    hasVotedPass: auction.passVotes.includes(playerId),
    passVotes: auction.passVotes.length,
    passVotesNeeded: auction.passVotesNeeded,
  };
}

/* ------------------------------------------------------------------ */
/* Broadcasting                                                        */
/* ------------------------------------------------------------------ */

function pulseFromFeed(event: FeedEvent): Pulse | null {
  const map: Partial<Record<FeedEvent['kind'], Pulse['type']>> = {
    REVEAL: 'REVEAL',
    BID: 'BID',
    SOLD: 'SOLD',
    PASSED: 'PASSED',
    ANTI_SNIPE: 'ANTI_SNIPE',
    ROSTER_FULL: 'ROSTER_FULL',
    PASS_VOTE: 'PASS_VOTE',
  };
  const type = map[event.kind];
  if (!type) return null;
  return {
    id: event.id,
    type,
    message: event.message,
    at: event.at,
    characterId: event.characterId,
    playerId: event.playerId,
    amount: event.amount,
  };
}

function broadcast(io: Server, room: AuctionRoom): void {
  const code = room.state.code;
  const state = projectState(room);
  const leaderboard = room.leaderboard();
  const cursor = roomCursors.get(code) ?? { lastFeedId: null, lastLeaderId: null, lastTopTeam: null };

  // Everything added to the feed since the previous broadcast becomes a pulse.
  const fresh: FeedEvent[] = [];
  for (const event of room.state.feed) {
    if (event.id === cursor.lastFeedId) break;
    fresh.push(event);
  }
  fresh.reverse();

  const previousLeader = cursor.lastLeaderId;
  const currentLeader = room.state.auction.highestBidderId;
  const topTeam = leaderboard[0]?.playerId ?? null;

  for (const socket of io.sockets.sockets.values()) {
    const session = sessions.get(socket.id);
    if (!session || session.code !== code) continue;

    socket.emit('state', {
      state,
      viewer: viewerFor(room, session.playerId),
      leaderboard,
    });

    for (const event of fresh) {
      const pulse = pulseFromFeed(event);
      if (pulse) socket.emit('pulse', pulse);
    }

    // Personalised: you specifically just lost the top bid.
    if (
      previousLeader &&
      currentLeader &&
      previousLeader !== currentLeader &&
      session.playerId === previousLeader
    ) {
      socket.emit('pulse', {
        id: id('pl'),
        type: 'OUTBID',
        message: 'You have been outbid.',
        at: Date.now(),
        characterId: room.state.auction.characterId ?? undefined,
        amount: room.state.auction.currentBid,
      });
    }

    if (topTeam && topTeam !== cursor.lastTopTeam && session.playerId === topTeam) {
      socket.emit('pulse', {
        id: id('pl'),
        type: 'FIRST_PLACE',
        message: 'Your team just took the #1 spot.',
        at: Date.now(),
      });
    }

    if (room.state.status === 'FINISHED' && cursor.lastFeedId !== room.state.feed[0]?.id) {
      socket.emit('pulse', {
        id: id('pl'),
        type: 'GAME_OVER',
        message: 'The auction is complete.',
        at: Date.now(),
      });
    }
  }

  roomCursors.set(code, {
    lastFeedId: room.state.feed[0]?.id ?? null,
    lastLeaderId: currentLeader,
    lastTopTeam: topTeam,
  });
}

/** Subscribes once per room so a room created in one socket still pushes to all. */
function wireRoom(io: Server, room: AuctionRoom): void {
  if (wiredRooms.has(room.state.code)) return;
  wiredRooms.add(room.state.code);
  room.subscribe((updated) => broadcast(io, updated));
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

export function attachSocketServer(io: Server): void {
  io.on('connection', (socket: GameSocket) => {
    const limitKey = socket.id;

    const requireSession = (): { room: AuctionRoom; session: Session } | null => {
      const session = sessions.get(socket.id);
      if (!session) return null;
      const room = roomManager.byCode(session.code);
      if (!room) return null;
      return { room, session };
    };

    const guard = <T,>(
      action: string,
      ackFn: ((response: Ack<T>) => void) | undefined,
      run: (context: { room: AuctionRoom; session: Session }) => void,
    ) => {
      const ack = typeof ackFn === 'function' ? ackFn : () => {};
      if (!rateLimiter.take(limitKey, action)) {
        ack(fail({ code: 'RATE_LIMITED', message: 'Slow down — too many actions.' }));
        return;
      }
      const context = requireSession();
      if (!context) {
        ack(fail({ code: 'NOT_IN_GAME', message: 'You are not connected to an auction.' }));
        return;
      }
      run(context);
    };

    /* ---------------------- room lifecycle ---------------------- */

    socket.on('room:create', async (payload, ackFn) => {
      const ack = typeof ackFn === 'function' ? ackFn : () => {};
      if (!rateLimiter.take(limitKey, 'connect')) {
        ack(fail({ code: 'RATE_LIMITED', message: 'Too many rooms created. Wait a moment.' }));
        return;
      }
      const parsed = createRoomSchema.safeParse(payload);
      if (!parsed.success) {
        ack(fail({ code: 'VALIDATION', message: 'Check the auction settings and try again.' }));
        return;
      }

      const playerId = id('p');
      const token = randomBytes(24).toString('hex');
      const host = {
        id: playerId,
        name: parsed.data.host.name,
        teamName: parsed.data.host.teamName || `${parsed.data.host.name}'s Team`,
        avatar: parsed.data.host.avatar || 'shield',
      };

      const room = await roomManager.create({ settings: parsed.data.settings, host });
      wireRoom(io, room);

      tokens.set(tokenKey(room.state.code, playerId), token);
      sessions.set(socket.id, { code: room.state.code, playerId });
      await socket.join(room.state.code);

      ack(
        ok({
          code: room.state.code,
          playerId,
          token,
          state: projectState(room),
          viewer: viewerFor(room, playerId),
        }),
      );
      broadcast(io, room);
    });

    socket.on('room:join', async (payload, ackFn) => {
      const ack = typeof ackFn === 'function' ? ackFn : () => {};
      if (!rateLimiter.take(limitKey, 'connect')) {
        ack(fail({ code: 'RATE_LIMITED', message: 'Too many attempts. Wait a moment.' }));
        return;
      }
      const parsed = joinRoomSchema.safeParse(payload);
      if (!parsed.success) {
        ack(fail({ code: 'VALIDATION', message: 'Check your details and try again.' }));
        return;
      }

      const code = normalizeRoomCode(parsed.data.code);
      const room = roomManager.byCode(code);
      if (!room) {
        ack(fail({ code: 'ROOM_NOT_FOUND', message: 'No auction found with that code.' }));
        return;
      }
      wireRoom(io, room);

      const playerId = id('p');
      const result = room.join({
        playerId,
        name: parsed.data.name,
        teamName: parsed.data.teamName || `${parsed.data.name}'s Team`,
        avatar: parsed.data.avatar || 'shield',
        password: parsed.data.password ?? null,
      });
      if (!result.ok) {
        ack(fail(result.error));
        return;
      }

      const token = randomBytes(24).toString('hex');
      tokens.set(tokenKey(code, playerId), token);
      sessions.set(socket.id, { code, playerId });
      await socket.join(code);

      ack(
        ok({
          code,
          playerId,
          token,
          state: projectState(room),
          viewer: viewerFor(room, playerId),
        }),
      );
      broadcast(io, room);
    });

    socket.on('room:resume', async (payload, ackFn) => {
      const ack = typeof ackFn === 'function' ? ackFn : () => {};
      const parsed = resumeSchema.safeParse(payload);
      if (!parsed.success) {
        ack(fail({ code: 'VALIDATION', message: 'Could not restore that session.' }));
        return;
      }
      const code = normalizeRoomCode(parsed.data.code);
      const room = roomManager.byCode(code);
      if (!room) {
        ack(fail({ code: 'ROOM_NOT_FOUND', message: 'That auction is no longer running.' }));
        return;
      }
      const expected = tokens.get(tokenKey(code, parsed.data.playerId));
      if (!expected || expected !== parsed.data.token) {
        ack(fail({ code: 'NOT_IN_GAME', message: 'This session is no longer valid.' }));
        return;
      }
      const result = room.reconnect(parsed.data.playerId);
      if (!result.ok) {
        ack(fail(result.error));
        return;
      }
      wireRoom(io, room);
      sessions.set(socket.id, { code, playerId: parsed.data.playerId });
      await socket.join(code);

      ack(
        ok({
          code,
          playerId: parsed.data.playerId,
          token: parsed.data.token,
          state: projectState(room),
          viewer: viewerFor(room, parsed.data.playerId),
        }),
      );
      broadcast(io, room);
    });

    /* -------------------------- lobby --------------------------- */

    socket.on('player:ready', (payload, ack) =>
      guard('lobby', ack, ({ room, session }) => {
        const parsed = readySchema.safeParse(payload);
        if (!parsed.success) return ack(fail({ code: 'VALIDATION', message: 'Invalid request.' }));
        const result = room.setReady(session.playerId, parsed.data.ready);
        ack(result.ok ? ok(true) : fail(result.error));
      }),
    );

    socket.on('player:profile', (payload, ack) =>
      guard('lobby', ack, ({ room, session }) => {
        const parsed = profileSchema.safeParse(payload);
        if (!parsed.success) return ack(fail({ code: 'VALIDATION', message: 'Invalid request.' }));
        const result = room.updateProfile(session.playerId, parsed.data);
        ack(result.ok ? ok(true) : fail(result.error));
      }),
    );

    /* ------------------------ host controls --------------------- */

    socket.on('host:settings', (payload, ack) =>
      guard('host', ack, ({ room, session }) => {
        const parsed = settingsPatchSchema.safeParse(payload);
        if (!parsed.success) return ack(fail({ code: 'VALIDATION', message: 'Invalid settings.' }));
        const result = room.updateSettings(session.playerId, parsed.data.patch);
        ack(result.ok ? ok(true) : fail(result.error));
      }),
    );

    socket.on('host:kick', (payload, ack) =>
      guard('host', ack, ({ room, session }) => {
        const parsed = kickSchema.safeParse(payload);
        if (!parsed.success) return ack(fail({ code: 'VALIDATION', message: 'Invalid request.' }));
        const result = room.kick(session.playerId, parsed.data.playerId);
        if (result.ok) {
          for (const [socketId, entry] of sessions) {
            if (entry.code === room.state.code && entry.playerId === parsed.data.playerId) {
              io.sockets.sockets.get(socketId)?.emit('kicked', {
                reason: 'The host removed you from this auction.',
              });
              sessions.delete(socketId);
            }
          }
        }
        ack(result.ok ? ok(true) : fail(result.error));
      }),
    );

    /** Every host command shares the same shape: rate limit, session, engine call, ack. */
    const runHost = (
      ack: ((response: Ack<true>) => void) | undefined,
      run: (room: AuctionRoom, playerId: string) => Result<unknown>,
    ) =>
      guard('host', ack, ({ room, session }) => {
        const respond = typeof ack === 'function' ? ack : () => {};
        const result = run(room, session.playerId);
        respond(result.ok ? ok(true) : fail(result.error));
      });

    socket.on('host:start', (_payload, ack) => runHost(ack, (room, playerId) => room.start(playerId)));
    socket.on('host:reveal', (payload, ack) =>
      runHost(ack, (room, playerId) => {
        const parsed = revealSchema.safeParse(payload ?? {});
        if (!parsed.success) return errResult('VALIDATION', 'Invalid request.');
        return room.revealCharacter(playerId, parsed.data.characterId);
      }),
    );
    socket.on('host:open', (_payload, ack) =>
      runHost(ack, (room, playerId) => room.startBidding(playerId)),
    );
    socket.on('host:pause', (_payload, ack) => runHost(ack, (room, playerId) => room.pause(playerId)));
    socket.on('host:resume', (_payload, ack) =>
      runHost(ack, (room, playerId) => room.resume(playerId)),
    );
    socket.on('host:extend', (payload, ack) =>
      runHost(ack, (room, playerId) => {
        const parsed = extendSchema.safeParse(payload ?? { seconds: 10 });
        if (!parsed.success) return errResult('VALIDATION', 'Invalid duration.');
        return room.extendTimer(playerId, parsed.data.seconds);
      }),
    );
    socket.on('host:sell', (_payload, ack) => runHost(ack, (room, playerId) => room.sellNow(playerId)));
    socket.on('host:pass', (_payload, ack) => runHost(ack, (room, playerId) => room.pass(playerId)));
    socket.on('host:next', (_payload, ack) =>
      runHost(ack, (room, playerId) => room.nextCharacter(playerId)),
    );
    socket.on('host:end', (_payload, ack) =>
      runHost(ack, (room, playerId) => room.endAuction(playerId)),
    );
    socket.on('host:cancel', (_payload, ack) =>
      runHost(ack, (room, playerId) => room.cancelGame(playerId)),
    );

    /* --------------------------- bidding ------------------------ */

    socket.on('bid:place', (payload, ack) =>
      guard('bid', ack, ({ room, session }) => {
        const parsed = bidSchema.safeParse(payload);
        if (!parsed.success) {
          return ack(fail({ code: 'VALIDATION', message: 'That is not a valid bid amount.' }));
        }
        const result = room.placeBid(session.playerId, parsed.data.amount);
        ack(result.ok ? ok(result.value) : fail(result.error));
      }),
    );

    socket.on('vote:pass', (payload, ack) =>
      guard('bid', ack, ({ room, session }) => {
        const parsed = passVoteSchema.safeParse(payload ?? {});
        if (!parsed.success) {
          return ack(fail({ code: 'VALIDATION', message: 'Invalid request.' }));
        }
        const result = room.votePass(session.playerId, parsed.data.pass);
        ack(result.ok ? ok(result.value) : fail(result.error));
      }),
    );

    /* ------------------------ disconnection --------------------- */

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      sessions.delete(socket.id);
      rateLimiter.forget(limitKey);
      if (!session) return;
      const room = roomManager.byCode(session.code);
      if (!room) return;

      // Another tab may still be connected for this player.
      const stillConnected = [...sessions.values()].some(
        (entry) => entry.code === session.code && entry.playerId === session.playerId,
      );
      if (!stillConnected) room.setConnection(session.playerId, 'DISCONNECTED');
    });
  });
}
