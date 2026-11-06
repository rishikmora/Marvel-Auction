import { describe, expect, it } from 'vitest';
import { makeRoom, openLotFor, pick } from './helpers';

const IRON_MAN = 'iron-man';
const THOR = 'thor';

describe('lobby', () => {
  it('starts in LOBBY with the host seated', () => {
    const { room } = makeRoom();
    expect(room.state.status).toBe('LOBBY');
    expect(room.host?.isHost).toBe(true);
    expect(room.contenders).toHaveLength(3); // host + 2 players
  });

  it('rejects a duplicate display name', () => {
    const { room } = makeRoom();
    const result = room.join({ playerId: 'x', name: 'Alpha', teamName: 'T', avatar: 'star' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NAME_TAKEN');
  });

  it('enforces the room password on private rooms', () => {
    const { room } = makeRoom({ settings: { isPrivate: true, password: 'secret' } });
    const denied = room.join({ playerId: 'x', name: 'Nova', teamName: 'T', avatar: 'star' });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe('BAD_PASSWORD');

    const allowed = room.join({
      playerId: 'x',
      name: 'Nova',
      teamName: 'T',
      avatar: 'star',
      password: 'secret',
    });
    expect(allowed.ok).toBe(true);
  });

  it('refuses to start below the minimum player count', () => {
    const { room } = makeRoom({ settings: { minPlayers: 8 } });
    const result = room.start('host');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('rejects host actions from a normal player', () => {
    const { room } = makeRoom();
    const result = room.start('p1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_HOST');
    expect(room.state.status).toBe('LOBBY');
  });

  it('makes the host a spectator when hostPlays is off', () => {
    const { room } = makeRoom({ settings: { hostPlays: false } });
    expect(room.host?.isSpectator).toBe(true);
    expect(room.contenders.map((player) => player.id)).toEqual(['p1', 'p2']);
  });
});

describe('state machine', () => {
  it('will not open bidding before a character is revealed', () => {
    const { room } = makeRoom();
    room.start('host');
    const result = room.startBidding('host');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE');
  });

  it('will not reveal a second character while one is live', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    const result = room.revealCharacter('host', THOR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE');
  });

  it('walks WAITING -> REVEALED -> BIDDING -> SOLD -> WAITING', () => {
    const { room } = makeRoom();
    room.start('host');
    expect(room.state.auction.state).toBe('WAITING');
    room.revealCharacter('host', IRON_MAN);
    expect(room.state.auction.state).toBe('CHARACTER_REVEALED');
    room.startBidding('host');
    expect(room.state.auction.state).toBe('BIDDING');
    room.placeBid('p1', 200);
    room.sellNow('host');
    expect(room.state.auction.state).toBe('SOLD');
    room.nextCharacter('host');
    expect(room.state.auction.state).toBe('WAITING');
  });

  it('pauses and resumes without losing the remaining time', () => {
    const { room, clock } = makeRoom({ settings: { auctionSeconds: 30 } });
    openLotFor(room, IRON_MAN);
    clock.advance(10_000);
    room.pause('host');
    expect(room.state.auction.state).toBe('PAUSED');
    expect(room.state.auction.pausedRemainingMs).toBe(20_000);

    clock.advance(60_000); // time passes while paused
    room.resume('host');
    expect(room.state.auction.state).toBe('BIDDING');
    expect((room.state.auction.endsAt ?? 0) - clock.now()).toBe(20_000);
  });
});

describe('bid validation', () => {
  it('requires the base price as the opening bid', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    const character = room.character(IRON_MAN)!;

    const low = room.placeBid('p1', character.basePrice - 5);
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.error.code).toBe('BID_TOO_LOW');

    const good = room.placeBid('p1', character.basePrice);
    expect(good.ok).toBe(true);
  });

  it('enforces the minimum increment on subsequent bids', () => {
    const { room } = makeRoom({ settings: { minIncrement: 10 } });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);

    const tooSmall = room.placeBid('p2', 205);
    expect(tooSmall.ok).toBe(false);
    if (!tooSmall.ok) expect(tooSmall.error.code).toBe('BID_TOO_LOW');

    expect(room.placeBid('p2', 210).ok).toBe(true);
  });

  it('stops a player outbidding themselves', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);
    const again = room.placeBid('p1', 400);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('ALREADY_HIGHEST');
  });

  it('never lets a player bid more credits than they hold', () => {
    const { room } = makeRoom({ settings: { startingBudget: 300, reserveBudgetForSlots: false } });
    openLotFor(room, IRON_MAN);
    const result = room.placeBid('p1', 301);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INSUFFICIENT_CREDITS');
  });

  it('rejects negative, zero and fractional bids', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    for (const amount of [-100, 0, -1]) {
      const result = room.placeBid('p1', amount);
      expect(result.ok).toBe(false);
    }
    // A fractional bid is floored, and 0.5 floors to 0, which is invalid.
    expect(room.placeBid('p1', 0.5).ok).toBe(false);
  });

  it('rejects bids when the auction is not open', () => {
    const { room } = makeRoom();
    room.start('host');
    room.revealCharacter('host', IRON_MAN);
    const result = room.placeBid('p1', 500);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE');
  });

  it('rejects bids from someone who is not in the game', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    const result = room.placeBid('ghost', 500);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_IN_GAME');
  });

  it('resolves simultaneous bids in arrival order, rejecting the loser', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    // Two clients race with the same amount; only the first can be accepted.
    const first = room.placeBid('p1', 300);
    const second = room.placeBid('p2', 300);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(room.state.auction.highestBidderId).toBe('p1');
  });
});

describe('budget reserve', () => {
  it('holds back enough credits to fill remaining slots', () => {
    const { room } = makeRoom({
      settings: { startingBudget: 1000, maxRoster: 7, reserveBudgetForSlots: true },
      characters: pick('iron-man', 'thor', 'hulk', 'hawkeye', 'rhino', 'bullseye', 'echo', 'jubilee'),
    });
    openLotFor(room, IRON_MAN);

    const ceiling = room.maxBidFor('p1');
    expect(ceiling).toBeLessThan(1000);

    const overspend = room.placeBid('p1', ceiling + 1);
    expect(overspend.ok).toBe(false);
    if (!overspend.ok) expect(overspend.error.code).toBe('INSUFFICIENT_CREDITS');
    expect(room.placeBid('p1', ceiling).ok).toBe(true);
  });

  it('lets a player spend everything on their last slot', () => {
    const { room } = makeRoom({
      settings: { startingBudget: 1000, maxRoster: 1, reserveBudgetForSlots: true },
    });
    openLotFor(room, IRON_MAN);
    expect(room.maxBidFor('p1')).toBe(1000);
  });

  it('can be switched off entirely', () => {
    const { room } = makeRoom({
      settings: { startingBudget: 1000, maxRoster: 7, reserveBudgetForSlots: false },
    });
    openLotFor(room, IRON_MAN);
    expect(room.maxBidFor('p1')).toBe(1000);
  });
});

describe('roster limits', () => {
  it('blocks bidding once the roster is full', () => {
    const { room } = makeRoom({
      settings: { maxRoster: 1, startingBudget: 2000, reserveBudgetForSlots: false },
    });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);
    room.sellNow('host');
    room.nextCharacter('host');

    room.revealCharacter('host', THOR);
    room.startBidding('host');

    const result = room.placeBid('p1', 300);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ROSTER_FULL');
    expect(room.maxBidFor('p1')).toBe(0);
  });

  it('sells a character to exactly one team and removes it from the pool', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);
    room.sellNow('host');

    expect(room.state.remainingPool).not.toContain(IRON_MAN);
    expect(room.state.soldCharacterIds).toContain(IRON_MAN);
    const owners = room.state.players.filter((player) =>
      player.roster.some((entry) => entry.characterId === IRON_MAN),
    );
    expect(owners).toHaveLength(1);

    room.nextCharacter('host');
    const reReveal = room.revealCharacter('host', IRON_MAN);
    expect(reReveal.ok).toBe(false);
    if (!reReveal.ok) expect(reReveal.error.code).toBe('CHARACTER_SOLD');
  });

  it('deducts credits exactly once on sale', () => {
    const { room } = makeRoom({ settings: { startingBudget: 1000, reserveBudgetForSlots: false } });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 250);
    room.sellNow('host');

    const player = room.player('p1')!;
    expect(player.budget).toBe(750);
    expect(player.spent).toBe(250);
    expect(player.roster).toHaveLength(1);
    expect(player.roster[0].price).toBe(250);
  });
});

describe('timer and anti-snipe', () => {
  it('sells automatically when the clock runs out', () => {
    const { room, clock } = makeRoom({ settings: { auctionSeconds: 30 } });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);

    clock.advance(30_000);
    expect(room.state.auction.state).toBe('SOLD');
    expect(room.player('p1')!.roster).toHaveLength(1);
  });

  it('passes the lot when the clock runs out with no bids', () => {
    const { room, clock } = makeRoom({ settings: { auctionSeconds: 30 } });
    openLotFor(room, IRON_MAN);
    clock.advance(30_000);

    expect(room.state.auction.state).toBe('PASSED');
    expect(room.state.passedCharacterIds).toContain(IRON_MAN);
    expect(room.state.remainingPool).not.toContain(IRON_MAN);
  });

  it('extends the clock for a last-second bid', () => {
    const { room, clock } = makeRoom({
      settings: {
        auctionSeconds: 30,
        antiSnipeEnabled: true,
        antiSnipeThresholdSeconds: 5,
        antiSnipeExtensionSeconds: 5,
      },
    });
    openLotFor(room, IRON_MAN);
    clock.advance(27_000); // 3 seconds left

    const bid = room.placeBid('p1', 200);
    expect(bid.ok).toBe(true);
    if (bid.ok) expect(bid.value.triggeredAntiSnipe).toBe(true);
    expect((room.state.auction.endsAt ?? 0) - clock.now()).toBe(5_000);
    expect(room.state.auction.extensions).toBe(1);
    expect(room.state.auction.state).toBe('BIDDING');
  });

  it('does not extend when anti-snipe is disabled', () => {
    const { room, clock } = makeRoom({
      settings: { auctionSeconds: 30, antiSnipeEnabled: false },
    });
    openLotFor(room, IRON_MAN);
    clock.advance(28_000);
    const bid = room.placeBid('p1', 200);
    expect(bid.ok).toBe(true);
    if (bid.ok) expect(bid.value.triggeredAntiSnipe).toBe(false);
    expect((room.state.auction.endsAt ?? 0) - clock.now()).toBe(2_000);
  });

  it('rejects a bid that arrives after the clock expired', () => {
    const { room, clock } = makeRoom({ settings: { auctionSeconds: 30 } });
    openLotFor(room, IRON_MAN);
    clock.advance(31_000);
    const result = room.placeBid('p1', 200);
    expect(result.ok).toBe(false);
  });

  it('waits for the host when manual sale confirmation is on', () => {
    const { room, clock } = makeRoom({
      settings: { auctionSeconds: 30, manualSaleConfirmation: true },
    });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);
    clock.advance(30_000);

    expect(room.state.auction.state).toBe('BIDDING');
    expect(room.state.auction.awaitingHostSale).toBe(true);
    expect(room.player('p1')!.roster).toHaveLength(0);

    room.sellNow('host');
    expect(room.state.auction.state).toBe('SOLD');
    expect(room.player('p1')!.roster).toHaveLength(1);
  });

  it('lets the host extend a running clock', () => {
    const { room, clock } = makeRoom({ settings: { auctionSeconds: 30 } });
    openLotFor(room, IRON_MAN);
    clock.advance(20_000);
    room.extendTimer('host', 15);
    expect((room.state.auction.endsAt ?? 0) - clock.now()).toBe(25_000);
  });
});

describe('disconnection', () => {
  it('keeps a disconnected player’s roster and budget intact', () => {
    const { room } = makeRoom({ settings: { reserveBudgetForSlots: false } });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 250);
    room.sellNow('host');

    room.setConnection('p1', 'DISCONNECTED');
    const player = room.player('p1')!;
    expect(player.connection).toBe('DISCONNECTED');
    expect(player.roster).toHaveLength(1);
    expect(player.budget).toBe(750);

    const restored = room.reconnect('p1');
    expect(restored.ok).toBe(true);
    expect(room.player('p1')!.connection).toBe('RECONNECTED');
    expect(room.player('p1')!.roster).toHaveLength(1);
  });

  it('blocks bidding for disconnected players when the host disables it', () => {
    const { room } = makeRoom({ settings: { allowReconnectBidding: false } });
    openLotFor(room, IRON_MAN);
    room.setConnection('p1', 'DISCONNECTED');

    const result = room.placeBid('p1', 200);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RECONNECTING');
  });

  it('returns a removed player’s characters to the pool', () => {
    const { room } = makeRoom({ settings: { reserveBudgetForSlots: false } });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 250);
    room.sellNow('host');

    room.kick('host', 'p1');
    expect(room.player('p1')).toBeUndefined();
    expect(room.state.remainingPool).toContain(IRON_MAN);
    expect(room.state.soldCharacterIds).not.toContain(IRON_MAN);
  });

  it('will not let the host remove themselves', () => {
    const { room } = makeRoom();
    const result = room.kick('host', 'host');
    expect(result.ok).toBe(false);
  });
});

describe('finishing', () => {
  it('finishes automatically when the pool empties', () => {
    const { room } = makeRoom({
      settings: { maxRoster: 7, reserveBudgetForSlots: false },
      characters: pick('iron-man'),
    });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);
    room.sellNow('host');
    room.nextCharacter('host');

    expect(room.state.status).toBe('FINISHED');
    expect(room.state.auction.state).toBe('FINISHED');
  });

  it('finishes automatically once every roster is full', () => {
    const { room } = makeRoom({
      settings: { maxRoster: 1, startingBudget: 1000, reserveBudgetForSlots: false },
      players: [{ id: 'p1', name: 'Alpha' }],
      characters: pick('iron-man', 'thor', 'hulk', 'wolverine'),
    });
    room.start('host');

    for (const [characterId, bidder] of [
      [IRON_MAN, 'p1'],
      [THOR, 'host'],
    ] as const) {
      room.revealCharacter('host', characterId);
      room.startBidding('host');
      room.placeBid(bidder, 200);
      room.sellNow('host');
      room.nextCharacter('host');
    }

    expect(room.state.status).toBe('FINISHED');
  });

  it('produces a ranked leaderboard on demand', () => {
    const { room } = makeRoom({ settings: { reserveBudgetForSlots: false } });
    openLotFor(room, THOR);
    room.placeBid('p1', 200);
    room.sellNow('host');

    const leaderboard = room.leaderboard();
    expect(leaderboard[0].playerId).toBe('p1');
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[0].total).toBeGreaterThan(0);
    expect(leaderboard.every((team) => typeof team.player.teamName === 'string')).toBe(true);
  });

  it('rejects everything once the auction has ended', () => {
    const { room } = makeRoom();
    room.start('host');
    room.endAuction('host');

    expect(room.state.status).toBe('FINISHED');
    const bid = room.placeBid('p1', 200);
    expect(bid.ok).toBe(false);
    if (!bid.ok) expect(bid.error.code).toBe('AUCTION_ENDED');

    const reveal = room.revealCharacter('host');
    expect(reveal.ok).toBe(false);
  });
});

describe('settings changes', () => {
  it('applies a new budget to players who have not spent yet', () => {
    const { room } = makeRoom();
    room.updateSettings('host', { startingBudget: 2500 });
    expect(room.player('p1')!.budget).toBe(2500);
  });

  it('locks settings once the auction is running', () => {
    const { room } = makeRoom();
    room.start('host');
    const result = room.updateSettings('host', { startingBudget: 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE');
  });

  it('rebuilds the pool when categories change', () => {
    const { room } = makeRoom();
    room.updateSettings('host', { categories: ['FANTASTIC_FOUR'] });
    const pool = room.state.remainingPool;
    expect(pool.length).toBeGreaterThan(0);
    for (const id of pool) {
      expect(room.character(id)!.categories).toContain('FANTASTIC_FOUR');
    }
  });

  it('merges a partial weight edit without dropping the other weights', () => {
    const { room } = makeRoom();
    room.updateSettings('host', { scoring: { weights: { strength: 0.5 } } });
    const weights = room.state.settings.scoring.weights;
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(Object.keys(weights)).toHaveLength(9);
  });
});
