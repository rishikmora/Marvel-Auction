import { describe, expect, it } from 'vitest';
import { computeAnalytics } from '@/game/analytics';
import { buildAchievements } from '@/game/achievements';
import { projectState, viewerFor } from '@/server/socket';
import { makeRoom, pick, characterById } from './helpers';

/**
 * End-to-end flow through the authoritative engine: create, join, auction several
 * characters, fill rosters, finish, and derive the winner.
 */
describe('a complete auction', () => {
  function playFullGame() {
    const lots = pick(
      'iron-man',
      'thor',
      'captain-america',
      'hulk',
      'doctor-strange',
      'black-widow',
      'spider-man',
      'wolverine',
      'storm',
      'hawkeye',
      'luke-cage',
      'mantis',
    );

    const { room, clock } = makeRoom({
      settings: {
        startingBudget: 1200,
        maxRoster: 3,
        auctionSeconds: 30,
        reserveBudgetForSlots: false,
        hostPlays: false,
      },
      players: [
        { id: 'alpha', name: 'Alpha' },
        { id: 'omega', name: 'Omega' },
      ],
      characters: lots,
    });

    expect(room.start('host').ok).toBe(true);

    // Alternate winners so both rosters fill and prices differ.
    const script: { id: string; winner: 'alpha' | 'omega'; price: number }[] = [
      { id: 'iron-man', winner: 'alpha', price: 200 },
      { id: 'thor', winner: 'omega', price: 260 },
      { id: 'captain-america', winner: 'alpha', price: 150 },
      { id: 'hulk', winner: 'omega', price: 180 },
      { id: 'doctor-strange', winner: 'alpha', price: 210 },
      { id: 'black-widow', winner: 'omega', price: 90 },
    ];

    for (const lot of script) {
      expect(room.revealCharacter('host', lot.id).ok).toBe(true);
      expect(room.startBidding('host').ok).toBe(true);

      const other = lot.winner === 'alpha' ? 'omega' : 'alpha';
      const character = characterById.get(lot.id)!;

      // A genuine contest where possible: the loser opens, the winner takes it.
      // Once a rival's roster is full they are legitimately barred from bidding.
      if (room.canBid(other).ok) {
        expect(room.placeBid(other, character.basePrice).ok).toBe(true);
      }
      expect(room.placeBid(lot.winner, lot.price).ok).toBe(true);

      clock.advance(30_000); // clock expires, auto-sale
      expect(room.state.auction.state).toBe('SOLD');
      if (room.state.status === 'ACTIVE') room.nextCharacter('host');
    }

    return { room, clock };
  }

  it('fills both rosters and finishes on its own', () => {
    const { room } = playFullGame();

    expect(room.state.status).toBe('FINISHED');
    expect(room.player('alpha')!.roster).toHaveLength(3);
    expect(room.player('omega')!.roster).toHaveLength(3);
  });

  it('keeps the credit ledger exact', () => {
    const { room } = playFullGame();

    for (const id of ['alpha', 'omega']) {
      const player = room.player(id)!;
      const spent = player.roster.reduce((sum, entry) => sum + entry.price, 0);
      expect(player.spent).toBe(spent);
      expect(player.budget).toBe(1200 - spent);
      expect(player.budget).toBeGreaterThanOrEqual(0);
    }
  });

  it('never sells one character to two teams', () => {
    const { room } = playFullGame();
    const owned = room.state.players.flatMap((player) =>
      player.roster.map((entry) => entry.characterId),
    );
    expect(new Set(owned).size).toBe(owned.length);
  });

  it('declares a winner with a fully explained score', () => {
    const { room } = playFullGame();
    const rankings = room.leaderboard();

    expect(rankings).toHaveLength(2);
    expect(rankings[0].rank).toBe(1);
    expect(rankings[0].total).toBeGreaterThanOrEqual(rankings[1].total);

    const champion = rankings[0];
    expect(champion.total).toBe(
      champion.characterPower +
        champion.synergyBonus +
        champion.balanceBonus +
        champion.leadershipBonus -
        champion.penalty,
    );
    expect(champion.characters).toHaveLength(3);
    expect(champion.balance.pillars.length).toBeGreaterThan(0);
  });

  it('produces analytics consistent with the ledger', () => {
    const { room } = playFullGame();
    const analytics = computeAnalytics(
      room.snapshot(),
      new Map(room.state.remainingPool.concat(room.state.soldCharacterIds).map((id) => [id, room.character(id)!])),
      room.state.settings.scoring,
    );

    expect(analytics.soldLots).toBe(6);
    expect(analytics.totalCreditsSpent).toBe(
      room.contenders.reduce((sum, player) => sum + player.spent, 0),
    );
    expect(analytics.highestBid).toBeGreaterThan(0);
    expect(analytics.bestValue).not.toBeNull();
    expect(analytics.mostExpensive!.price).toBeGreaterThanOrEqual(analytics.lowestWinningBid);
  });

  it('awards achievements from the finished game', () => {
    const { room } = playFullGame();
    const rankings = room.leaderboard();
    const characters = new Map(
      room.state.soldCharacterIds.map((id) => [id, room.character(id)!]),
    );
    const achievements = buildAchievements(room.snapshot(), rankings, characters);

    const championName = rankings[0].player.name;
    expect(achievements[championName]).toContain('CHAMPION');
    expect(achievements[championName]).toContain('FULL_HOUSE');
  });
});

describe('wire projections', () => {
  it('trims the bid log to the live round and reports the true total', () => {
    const { room } = makeRoom({ settings: { reserveBudgetForSlots: false } });
    room.start('host');

    room.revealCharacter('host', 'iron-man');
    room.startBidding('host');
    room.placeBid('p1', 200);
    room.placeBid('p2', 250);
    room.sellNow('host');
    room.nextCharacter('host');

    room.revealCharacter('host', 'thor');
    room.startBidding('host');
    room.placeBid('p1', 300);

    const projected = projectState(room);
    expect(projected.totalBids).toBe(3);
    expect(projected.bids).toHaveLength(1);
    expect(projected.bids[0].round).toBe(2);
  });

  it('computes per-viewer limits server-side', () => {
    const { room } = makeRoom({
      settings: { startingBudget: 400, maxRoster: 2, reserveBudgetForSlots: true },
      characters: pick('iron-man', 'thor', 'hawkeye'),
    });
    room.start('host');
    room.revealCharacter('host', 'iron-man');
    room.startBidding('host');

    const viewer = viewerFor(room, 'p1');
    expect(viewer.canBid).toBe(true);
    expect(viewer.maxBid).toBeLessThan(400);
    expect(viewer.slotsRemaining).toBe(2);
    // Every offered quick bid must be legal.
    for (const amount of viewer.quickBids) {
      expect(amount).toBeGreaterThanOrEqual(viewer.nextMinimumBid);
      expect(amount).toBeLessThanOrEqual(viewer.maxBid);
    }
  });

  it('explains why a viewer cannot bid', () => {
    const { room } = makeRoom({
      settings: { maxRoster: 1, reserveBudgetForSlots: false },
    });
    room.start('host');
    room.revealCharacter('host', 'iron-man');
    room.startBidding('host');
    room.placeBid('p1', 200);
    room.sellNow('host');
    room.nextCharacter('host');
    room.revealCharacter('host', 'thor');
    room.startBidding('host');

    const viewer = viewerFor(room, 'p1');
    expect(viewer.canBid).toBe(false);
    expect(viewer.rosterFull).toBe(true);
    expect(viewer.blockedReason).toMatch(/complete/i);
    expect(viewer.quickBids).toHaveLength(0);
  });
});

describe('room isolation', () => {
  it('runs concurrent auctions without shared state', () => {
    const a = makeRoom({ settings: { reserveBudgetForSlots: false } });
    const b = makeRoom({ settings: { startingBudget: 300, reserveBudgetForSlots: false } });

    a.room.start('host');
    a.room.revealCharacter('host', 'iron-man');
    a.room.startBidding('host');
    a.room.placeBid('p1', 400);
    a.room.sellNow('host');

    // Room B is untouched: same character still available, budgets intact.
    expect(b.room.state.remainingPool).toContain('iron-man');
    expect(b.room.state.soldCharacterIds).toHaveLength(0);
    expect(b.room.player('p1')!.budget).toBe(300);
    expect(a.room.player('p1')!.budget).toBe(600);
    expect(a.room.state.id).not.toBe(b.room.state.id);
  });

  it('advances each room’s clock independently', () => {
    const a = makeRoom({ settings: { auctionSeconds: 30 } });
    const b = makeRoom({ settings: { auctionSeconds: 30 } });

    a.room.start('host');
    a.room.revealCharacter('host', 'iron-man');
    a.room.startBidding('host');

    b.room.start('host');
    b.room.revealCharacter('host', 'iron-man');
    b.room.startBidding('host');
    b.room.placeBid('p1', 200);

    a.clock.advance(30_000);
    expect(a.room.state.auction.state).toBe('PASSED');
    expect(b.room.state.auction.state).toBe('BIDDING');

    b.clock.advance(30_000);
    expect(b.room.state.auction.state).toBe('SOLD');
  });
});
