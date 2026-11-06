import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING } from '@/game/config';
import { simulateBattle, type BattleSide } from '@/game/battle';
import { COUNTER_RELATIONSHIPS } from '@/game/data/counters';
import { seededRandom } from '@/game/rng';
import { pick } from './helpers';

const teamA: BattleSide = {
  playerId: 'a',
  teamName: 'Team Alpha',
  characters: pick('thor', 'captain-america', 'iron-man', 'doctor-strange', 'wolverine'),
};

const teamB: BattleSide = {
  playerId: 'b',
  teamName: 'Team Omega',
  characters: pick('thanos', 'magneto', 'hela', 'ultron', 'venom'),
};

describe('battle simulation', () => {
  it('is deterministic for the same rosters and seed', () => {
    const first = simulateBattle(teamA, teamB, DEFAULT_SCORING, 'game-1');
    const second = simulateBattle(teamA, teamB, DEFAULT_SCORING, 'game-1');
    expect(second).toEqual(first);
  });

  it('produces a different fight for a different seed', () => {
    const first = simulateBattle(teamA, teamB, DEFAULT_SCORING, 'game-1');
    const second = simulateBattle(teamA, teamB, DEFAULT_SCORING, 'game-2');
    expect(second.seed).not.toBe(first.seed);
    // Round scores are seeded, so at least one round should differ.
    const identical = first.rounds.every(
      (round, index) =>
        round.aScore === second.rounds[index].aScore &&
        round.bScore === second.rounds[index].bScore,
    );
    expect(identical).toBe(false);
  });

  it('runs five rounds and always names a result', () => {
    const result = simulateBattle(teamA, teamB, DEFAULT_SCORING, 'game-1');
    expect(result.rounds).toHaveLength(5);
    expect(result.aRoundsWon + result.bRoundsWon).toBeLessThanOrEqual(5);
    expect(result.summary.length).toBeGreaterThan(10);
    for (const round of result.rounds) {
      expect(round.narrative.length).toBeGreaterThan(0);
      expect(round.aScore).toBeGreaterThan(0);
      expect(round.bScore).toBeGreaterThan(0);
    }
  });

  it('is not a coin flip — a far stronger roster wins', () => {
    const strong: BattleSide = {
      playerId: 'strong',
      teamName: 'Titans',
      characters: pick('thanos', 'galactus', 'eternity', 'silver-surfer', 'apocalypse'),
    };
    const weak: BattleSide = {
      playerId: 'weak',
      teamName: 'Rookies',
      characters: pick('hawkeye', 'rhino', 'bullseye', 'jubilee', 'echo'),
    };

    // Across many seeds the stronger side should win essentially every time.
    let strongWins = 0;
    for (let seed = 0; seed < 25; seed += 1) {
      const result = simulateBattle(strong, weak, DEFAULT_SCORING, `seed-${seed}`);
      if (result.winnerPlayerId === 'strong') strongWins += 1;
    }
    expect(strongWins).toBe(25);
  });

  it('caps the total counter swing so no single matchup decides everything', () => {
    const result = simulateBattle(teamA, teamB, DEFAULT_SCORING, 'game-1');
    for (const counter of result.counters) {
      expect(counter.multiplier).toBeGreaterThan(1);
      expect(counter.multiplier).toBeLessThanOrEqual(1.45);
    }
  });

  it('handles an empty roster without throwing', () => {
    const empty: BattleSide = { playerId: 'empty', teamName: 'Nobody', characters: [] };
    const result = simulateBattle(teamA, empty, DEFAULT_SCORING, 'game-1');
    expect(result.winnerPlayerId).toBe('a');
  });
});

describe('counter data', () => {
  it('has unique ids and sane multipliers', () => {
    const ids = COUNTER_RELATIONSHIPS.map((counter) => counter.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const counter of COUNTER_RELATIONSHIPS) {
      expect(counter.advantageMultiplier).toBeGreaterThan(1);
      expect(counter.advantageMultiplier).toBeLessThan(2);
      expect(counter.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('seeded rng', () => {
  it('replays the same sequence for the same seed', () => {
    const a = seededRandom('abc');
    const b = seededRandom('abc');
    const first = Array.from({ length: 8 }, () => a());
    const second = Array.from({ length: 8 }, () => b());
    expect(second).toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
