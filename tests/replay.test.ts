import { describe, expect, it } from 'vitest';
import { buildReplay } from '@/game/replay';
import type { BidRecord, Player, PurchaseRecord } from '@/game/types';
import { characterById, makeRoom, openLotFor } from './helpers';

const player = (id: string, teamName: string): Player => ({
  id,
  name: id,
  teamName,
  avatar: 'shield',
  isHost: false,
  isSpectator: false,
  ready: true,
  budget: 500,
  spent: 0,
  roster: [],
  connection: 'ONLINE',
  lastSeen: 0,
  joinedAt: 0,
});

const T0 = 1_700_000_000_000;

describe('replay timeline', () => {
  /**
   * Regression: a lot that drew no bids has no recorded opening time, so it is inferred
   * backwards from when it resolved. Without clamping, that inferred time can land before
   * the auction started, which reorders the timeline and inflates its duration.
   */
  it('never places an unbid lot before the auction started', () => {
    const purchases: PurchaseRecord[] = [
      {
        id: 'p1',
        round: 1,
        characterId: 'iron-man',
        playerId: 'a',
        price: 200,
        at: T0 + 10_000,
        bidCount: 1,
        passed: false,
      },
      // Round 2 is passed almost immediately after round 1 resolved.
      {
        id: 'p2',
        round: 2,
        characterId: 'wolverine',
        playerId: null,
        price: 0,
        at: T0 + 12_000,
        bidCount: 0,
        passed: true,
      },
    ];

    const bids: BidRecord[] = [
      {
        id: 'b1',
        round: 1,
        characterId: 'iron-man',
        playerId: 'a',
        amount: 200,
        at: T0 + 5_000,
        offsetMs: 5_000,
        triggeredAntiSnipe: false,
      },
    ];

    const { events, durationMs } = buildReplay({
      bids,
      purchases,
      players: [player('a', 'Team Alpha')],
      characters: characterById,
      auctionSeconds: 30,
    });

    // Round 1's reveal is the first thing that happened.
    expect(events[0].round).toBe(1);
    expect(events[0].type).toBe('REVEAL');
    expect(events[0].offset).toBe(0);

    // Offsets are monotonic and no event precedes the opening one.
    const offsets = events.map((event) => event.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(Math.min(...offsets)).toBe(0);

    // Round 2's reveal cannot predate round 1's sale.
    const round2Reveal = events.find((event) => event.round === 2 && event.type === 'REVEAL')!;
    const round1Sale = events.find((event) => event.round === 1 && event.type === 'SOLD')!;
    expect(round2Reveal.offset).toBeGreaterThanOrEqual(round1Sale.offset);

    // The whole game spanned 12s, so the replay must not claim a 30s+ runtime.
    expect(durationMs).toBeLessThan(20_000);
  });

  it('uses the game clock rather than a fixed window for the first unbid lot', () => {
    const purchases: PurchaseRecord[] = [
      {
        id: 'p1',
        round: 1,
        characterId: 'iron-man',
        playerId: null,
        price: 0,
        at: T0 + 15_000,
        bidCount: 0,
        passed: true,
      },
    ];

    const fast = buildReplay({
      bids: [],
      purchases,
      players: [],
      characters: characterById,
      auctionSeconds: 15,
    });
    const slow = buildReplay({
      bids: [],
      purchases,
      players: [],
      characters: characterById,
      auctionSeconds: 60,
    });

    expect(fast.durationMs).toBeLessThan(slow.durationMs);
    expect(fast.events[0].type).toBe('REVEAL');
    expect(fast.events[1].type).toBe('PASSED');
  });

  it('orders bids inside a round and flags anti-snipe', () => {
    const purchases: PurchaseRecord[] = [
      {
        id: 'p1',
        round: 1,
        characterId: 'thor',
        playerId: 'a',
        price: 300,
        at: T0 + 30_000,
        bidCount: 2,
        passed: false,
      },
    ];
    const bids: BidRecord[] = [
      {
        id: 'b2',
        round: 1,
        characterId: 'thor',
        playerId: 'b',
        amount: 250,
        at: T0 + 20_000,
        offsetMs: 20_000,
        triggeredAntiSnipe: false,
      },
      {
        id: 'b1',
        round: 1,
        characterId: 'thor',
        playerId: 'a',
        amount: 300,
        at: T0 + 28_000,
        offsetMs: 28_000,
        triggeredAntiSnipe: true,
      },
    ];

    const { events } = buildReplay({
      bids,
      purchases,
      players: [player('a', 'Team Alpha'), player('b', 'Team Omega')],
      characters: characterById,
      auctionSeconds: 30,
    });

    const bidEvents = events.filter((event) => event.type === 'BID');
    expect(bidEvents.map((event) => event.amount)).toEqual([250, 300]);
    expect(bidEvents[1].antiSnipe).toBe(true);
    expect(bidEvents[0].label).toContain('Team Omega');
    expect(events[events.length - 1].type).toBe('SOLD');
  });

  it('returns an empty replay for a game with no lots', () => {
    const replay = buildReplay({
      bids: [],
      purchases: [],
      players: [],
      characters: characterById,
      auctionSeconds: 30,
    });
    expect(replay.events).toHaveLength(0);
    expect(replay.durationMs).toBe(0);
  });

  it('reconstructs a real game driven through the engine', () => {
    const { room, clock } = makeRoom({
      settings: { auctionSeconds: 30, reserveBudgetForSlots: false },
    });
    openLotFor(room, 'iron-man');
    clock.advance(4_000);
    room.placeBid('p1', 200);
    clock.advance(3_000);
    room.placeBid('p2', 240);
    clock.advance(30_000); // clock expires, auto-sale

    room.nextCharacter('host');
    room.revealCharacter('host', 'thor');
    room.startBidding('host');
    clock.advance(30_000); // no bids: passed

    const snapshot = room.snapshot();
    const { events, durationMs } = buildReplay({
      bids: snapshot.bids,
      purchases: snapshot.purchases,
      players: snapshot.players,
      characters: characterById,
      auctionSeconds: 30,
    });

    expect(events.filter((event) => event.type === 'REVEAL')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'BID')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'SOLD')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'PASSED')).toHaveLength(1);

    const offsets = events.map((event) => event.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(durationMs).toBeGreaterThan(0);
  });
});
