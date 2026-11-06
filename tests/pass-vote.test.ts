import { describe, expect, it } from 'vitest';
import { makeRoom, openLotFor, pick } from './helpers';

const IRON_MAN = 'iron-man';
const THOR = 'thor';

/**
 * Group skip: when every player who could still bid agrees, the lot is passed and the
 * next character is revealed automatically.
 */
describe('pass voting', () => {
  it('counts every eligible bidder, including the host when the host plays', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    // host + p1 + p2
    expect(room.passVoters.map((player) => player.id).sort()).toEqual(['host', 'p1', 'p2']);
    expect(room.state.auction.passVotesNeeded).toBe(3);
  });

  it('does not skip until everyone has voted', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);

    expect(room.votePass('p1').ok).toBe(true);
    expect(room.state.auction.passVotes).toEqual(['p1']);
    expect(room.state.auction.state).toBe('BIDDING');

    expect(room.votePass('p2').ok).toBe(true);
    expect(room.state.auction.state).toBe('BIDDING');
    expect(room.state.auction.characterId).toBe(IRON_MAN);
  });

  it('passes the lot and reveals the next character once everyone agrees', () => {
    const { room } = makeRoom({ characters: pick('iron-man', 'thor') });
    openLotFor(room, IRON_MAN);

    room.votePass('p1');
    room.votePass('p2');
    room.votePass('host');

    expect(room.state.passedCharacterIds).toContain(IRON_MAN);
    expect(room.state.remainingPool).not.toContain(IRON_MAN);
    // The next lot is on the block, and because the floor was already open it stays open.
    expect(room.state.auction.characterId).toBe(THOR);
    expect(room.state.auction.state).toBe('BIDDING');
    expect(room.state.auction.endsAt).not.toBeNull();
    expect(room.state.auction.round).toBe(2);
    expect(room.state.auction.passVotes).toEqual([]);
  });

  it('records the skip as a passed purchase, not a sale', () => {
    const { room } = makeRoom({ characters: pick('iron-man', 'thor') });
    openLotFor(room, IRON_MAN);
    room.votePass('p1');
    room.votePass('p2');
    room.votePass('host');

    const record = room.state.purchases.find((entry) => entry.characterId === IRON_MAN)!;
    expect(record.passed).toBe(true);
    expect(record.playerId).toBeNull();
    expect(record.price).toBe(0);
    for (const player of room.state.players) expect(player.roster).toHaveLength(0);
  });

  it('can be voted before the floor opens', () => {
    const { room } = makeRoom({ characters: pick('iron-man', 'thor') });
    room.start('host');
    room.revealCharacter('host', IRON_MAN);
    expect(room.state.auction.state).toBe('CHARACTER_REVEALED');

    room.votePass('p1');
    room.votePass('p2');
    room.votePass('host');
    expect(room.state.auction.characterId).toBe(THOR);
    // The floor was never open, so the host still controls when bidding starts.
    expect(room.state.auction.state).toBe('CHARACTER_REVEALED');
    expect(room.state.auction.endsAt).toBeNull();
  });

  it('is a toggle — a withdrawn vote stops the skip', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);

    room.votePass('p1');
    room.votePass('p2');
    expect(room.state.auction.passVotes).toHaveLength(2);

    room.votePass('p1', false);
    expect(room.state.auction.passVotes).toEqual(['p2']);

    room.votePass('host');
    // Still two of three: no skip.
    expect(room.state.auction.characterId).toBe(IRON_MAN);
  });

  it('clears the tally when someone bids, because the lot is clearly wanted', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);

    room.votePass('p1');
    room.votePass('p2');
    expect(room.state.auction.passVotes).toHaveLength(2);

    expect(room.placeBid('host', 200).ok).toBe(true);
    expect(room.state.auction.passVotes).toEqual([]);
  });

  it('refuses votes once a lot has a bid', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);

    const result = room.votePass('p2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE');
    expect(room.state.auction.state).toBe('BIDDING');
  });

  it('excludes a player whose roster is full from the count', () => {
    const { room } = makeRoom({
      settings: { maxRoster: 1, reserveBudgetForSlots: false },
      characters: pick('iron-man', 'thor', 'hulk'),
    });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);
    room.sellNow('host');
    room.nextCharacter('host');

    room.revealCharacter('host', THOR);
    room.startBidding('host');

    // p1 is finished, so only host and p2 have a say.
    expect(room.passVoters.map((player) => player.id).sort()).toEqual(['host', 'p2']);
    expect(room.state.auction.passVotesNeeded).toBe(2);

    room.votePass('p2');
    room.votePass('host');
    expect(room.state.passedCharacterIds).toContain(THOR);
  });

  it('rejects a vote from a player whose roster is full', () => {
    const { room } = makeRoom({
      settings: { maxRoster: 1, reserveBudgetForSlots: false },
      characters: pick('iron-man', 'thor', 'hulk'),
    });
    openLotFor(room, IRON_MAN);
    room.placeBid('p1', 200);
    room.sellNow('host');
    room.nextCharacter('host');
    room.revealCharacter('host', THOR);
    room.startBidding('host');

    const result = room.votePass('p1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ROSTER_FULL');
  });

  it('resolves a standing vote when the last holdout disconnects', () => {
    const { room } = makeRoom({
      settings: { allowReconnectBidding: false },
      characters: pick('iron-man', 'thor'),
    });
    openLotFor(room, IRON_MAN);

    room.votePass('p1');
    room.votePass('host');
    expect(room.state.auction.characterId).toBe(IRON_MAN);

    // p2 drops and can no longer bid, so the remaining votes are unanimous.
    room.setConnection('p2', 'DISCONNECTED');
    expect(room.state.passedCharacterIds).toContain(IRON_MAN);
    expect(room.state.auction.characterId).toBe(THOR);
  });

  it('finishes the auction when the final lot is skipped', () => {
    const { room } = makeRoom({ characters: pick('iron-man') });
    openLotFor(room, IRON_MAN);

    room.votePass('p1');
    room.votePass('p2');
    room.votePass('host');

    expect(room.state.passedCharacterIds).toContain(IRON_MAN);
    expect(room.state.status).toBe('FINISHED');
  });

  it('is refused entirely when the host turns it off', () => {
    const { room } = makeRoom({ settings: { passVoteEnabled: false } });
    openLotFor(room, IRON_MAN);

    const result = room.votePass('p1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_STATE');
    expect(room.state.auction.state).toBe('BIDDING');
  });

  it('rejects votes from spectators and strangers', () => {
    const { room } = makeRoom({ settings: { hostPlays: false } });
    openLotFor(room, IRON_MAN);

    const spectator = room.votePass('host');
    expect(spectator.ok).toBe(false);
    if (!spectator.ok) expect(spectator.error.code).toBe('NOT_IN_GAME');

    const stranger = room.votePass('nobody');
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.error.code).toBe('NOT_IN_GAME');
  });

  it('does not double-count a repeated vote', () => {
    const { room } = makeRoom();
    openLotFor(room, IRON_MAN);

    room.votePass('p1');
    room.votePass('p1');
    room.votePass('p1');
    expect(room.state.auction.passVotes).toEqual(['p1']);
    expect(room.state.auction.state).toBe('BIDDING');
  });

  it('resets the tally for each new lot', () => {
    const { room } = makeRoom({ characters: pick('iron-man', 'thor', 'hulk') });
    openLotFor(room, IRON_MAN);
    room.votePass('p1');
    room.votePass('p2');
    room.votePass('host');

    expect(room.state.auction.characterId).toBe(THOR);
    expect(room.state.auction.passVotes).toEqual([]);
    expect(room.state.auction.passVotesNeeded).toBe(3);
  });
});
