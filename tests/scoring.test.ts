import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING, normalizeWeights } from '@/game/config';
import { SEED_CHARACTERS } from '@/game/data';
import {
  characterPower,
  characterRating,
  evaluateSynergies,
  rankTeams,
  scoreTeam,
} from '@/game/scoring';
import type { Player, ScoringConfig, SynergyRule, TeamScore } from '@/game/types';
import { pick } from './helpers';

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    teamName: `Team ${id}`,
    avatar: 'shield',
    isHost: false,
    isSpectator: false,
    ready: true,
    budget: 500,
    spent: 500,
    roster: [],
    connection: 'ONLINE',
    lastSeen: 0,
    joinedAt: 0,
    ...overrides,
  };
}

describe('character power', () => {
  it('is the weighted sum of stats, scaled', () => {
    const [ironMan] = pick('iron-man');
    const weights = normalizeWeights(DEFAULT_SCORING.weights);
    const expected = Math.round(
      (ironMan.stats.strength * weights.strength +
        ironMan.stats.speed * weights.speed +
        ironMan.stats.durability * weights.durability +
        ironMan.stats.intelligence * weights.intelligence +
        ironMan.stats.combat * weights.combat +
        ironMan.stats.energy * weights.energy +
        ironMan.stats.versatility * weights.versatility +
        ironMan.stats.leadership * weights.leadership +
        ironMan.stats.specialAbility * weights.specialAbility) *
        DEFAULT_SCORING.powerScale,
    );
    expect(characterPower(ironMan)).toBe(expected);
  });

  it('exposes a 0-100 rating for display', () => {
    const [thanos] = pick('thanos');
    expect(characterRating(thanos)).toBe(Math.round(characterPower(thanos) / 10));
    expect(characterRating(thanos)).toBeGreaterThan(85);
  });

  it('responds to reweighting', () => {
    const [hulk] = pick('hulk');
    const strengthHeavy: ScoringConfig = {
      ...DEFAULT_SCORING,
      weights: normalizeWeights({ strength: 1 }),
    };
    const intelligenceHeavy: ScoringConfig = {
      ...DEFAULT_SCORING,
      weights: normalizeWeights({ intelligence: 1 }),
    };
    expect(characterPower(hulk, strengthHeavy)).toBeGreaterThan(
      characterPower(hulk, intelligenceHeavy),
    );
  });

  it('normalises weights that do not sum to one', () => {
    const weights = normalizeWeights({ strength: 5, speed: 5 });
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(weights.strength).toBeCloseTo(0.5, 10);
  });

  it('falls back to defaults when every weight is zero', () => {
    expect(normalizeWeights({})).toEqual(DEFAULT_SCORING.weights);
  });
});

describe('synergy', () => {
  it('only fires once the minimum member count is met', () => {
    const rule: SynergyRule = {
      id: 'test',
      name: 'Test',
      description: '',
      tag: 'avenger',
      minCount: 3,
      flatBonus: 100,
      perExtraMember: 50,
    };
    expect(evaluateSynergies(pick('iron-man', 'thor'), [rule])).toHaveLength(0);
    const hit = evaluateSynergies(pick('iron-man', 'thor', 'hulk'), [rule]);
    expect(hit).toHaveLength(1);
    expect(hit[0].points).toBe(100);
  });

  it('pays per extra member and respects a per-rule cap', () => {
    const rule: SynergyRule = {
      id: 'test',
      name: 'Test',
      description: '',
      tag: 'avenger',
      minCount: 2,
      flatBonus: 100,
      perExtraMember: 50,
      cap: 175,
    };
    const hits = evaluateSynergies(pick('iron-man', 'thor', 'hulk', 'captain-america'), [rule]);
    // 100 + 2 extra * 50 = 200, capped to 175.
    expect(hits[0].points).toBe(175);
  });

  it('never lets synergy outweigh raw character power', () => {
    const generous: SynergyRule[] = [
      {
        id: 'huge',
        name: 'Huge',
        description: '',
        tag: 'avenger',
        minCount: 1,
        flatBonus: 100_000,
        perExtraMember: 0,
      },
    ];
    const score = scoreTeam('p', pick('iron-man', 'thor', 'hulk'), DEFAULT_SCORING, generous);
    expect(score.synergyBonus).toBe(score.caps.synergy);
    expect(score.synergyBonus).toBeLessThanOrEqual(
      Math.round(DEFAULT_SCORING.maxSynergyPct * score.characterPower),
    );
    expect(score.synergyBonus).toBeLessThan(score.characterPower);
  });
});

describe('team balance', () => {
  it('rewards a roster that covers more role pillars', () => {
    const balanced = scoreTeam(
      'balanced',
      pick(
        'captain-america',
        'the-thing',
        'doctor-strange',
        'hawkeye',
        'quicksilver',
        'iron-man',
        'mantis',
      ),
    );
    const lopsided = scoreTeam(
      'lopsided',
      pick('hulk', 'juggernaut', 'abomination', 'rhino', 'sandman', 'drax', 'colossus'),
    );
    expect(balanced.balance.coverageRatio).toBeGreaterThan(lopsided.balance.coverageRatio);
    expect(balanced.balanceBonus).toBeGreaterThan(lopsided.balanceBonus);
  });

  it('penalises stacking the same primary role', () => {
    const stacked = scoreTeam(
      'stacked',
      pick('hulk', 'juggernaut', 'abomination', 'rhino', 'sandman', 'colossus', 'the-thing'),
    );
    expect(stacked.penalty).toBeGreaterThan(0);
    expect(stacked.balance.concentrationPenalty).toBeGreaterThan(0);
  });

  it('caps the penalty', () => {
    const stacked = scoreTeam(
      'stacked',
      pick('hulk', 'juggernaut', 'abomination', 'rhino', 'sandman', 'colossus', 'the-thing'),
      { ...DEFAULT_SCORING, redundancyPenaltyPerExcess: 100_000 },
    );
    expect(stacked.penalty).toBe(stacked.caps.penalty);
  });
});

describe('leadership', () => {
  it('rewards a genuine commander over seven soloists', () => {
    const commanded = scoreTeam('a', pick('captain-america', 'nick-fury', 'cyclops'));
    const leaderless = scoreTeam('b', pick('deadpool', 'carnage', 'rhino'));
    expect(commanded.leadership.points).toBeGreaterThan(leaderless.leadership.points);
    // Nick Fury is the dataset's highest-leadership character (100 to Cap's 99).
    expect(commanded.leadership.topLeader).toBe('nick-fury');
  });
});

describe('total score composition', () => {
  it('equals characters + bonuses - penalties', () => {
    const score = scoreTeam(
      'p',
      pick('captain-america', 'iron-man', 'thor', 'hulk', 'black-widow', 'spider-man', 'doctor-strange'),
    );
    expect(score.total).toBe(
      score.characterPower +
        score.synergyBonus +
        score.balanceBonus +
        score.leadershipBonus -
        score.penalty,
    );
  });

  it('handles an empty roster without dividing by zero', () => {
    const score = scoreTeam('p', []);
    expect(score.total).toBe(0);
    expect(score.averagePower).toBe(0);
    expect(score.strongestCharacterId).toBeNull();
  });
});

describe('ranking and tie-breaking', () => {
  const withTotal = (playerId: string, overrides: Partial<TeamScore>): TeamScore => ({
    ...scoreTeam(playerId, []),
    ...overrides,
    playerId,
  });

  it('orders by total power', () => {
    const ranked = rankTeams(
      [withTotal('a', { total: 100 }), withTotal('b', { total: 300 }), withTotal('c', { total: 200 })],
      [makePlayer('a'), makePlayer('b'), makePlayer('c')],
    );
    expect(ranked.map((team) => team.playerId)).toEqual(['b', 'c', 'a']);
    expect(ranked[0].rank).toBe(1);
  });

  it('breaks a tie on synergy first and reports which rule decided it', () => {
    const ranked = rankTeams(
      [
        withTotal('a', { total: 500, synergyBonus: 10 }),
        withTotal('b', { total: 500, synergyBonus: 90 }),
      ],
      [makePlayer('a'), makePlayer('b')],
    );
    expect(ranked[0].playerId).toBe('b');
    expect(ranked[1].tieBreak).toBe('Higher synergy score');
  });

  it('falls through to remaining budget', () => {
    const ranked = rankTeams(
      [
        withTotal('a', { total: 500, synergyBonus: 50, averagePower: 100 }),
        withTotal('b', { total: 500, synergyBonus: 50, averagePower: 100 }),
      ],
      [makePlayer('a', { budget: 10 }), makePlayer('b', { budget: 200 })],
    );
    expect(ranked[0].playerId).toBe('b');
    expect(ranked[1].tieBreak).toBe('Higher remaining budget');
  });

  it('declares a shared victory when nothing separates two teams', () => {
    const ranked = rankTeams(
      [
        withTotal('a', { total: 500, synergyBonus: 50, averagePower: 100, strongestCharacterPower: 700 }),
        withTotal('b', { total: 500, synergyBonus: 50, averagePower: 100, strongestCharacterPower: 700 }),
      ],
      [makePlayer('a', { budget: 100 }), makePlayer('b', { budget: 100 })],
    );
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked.every((team) => team.sharedRank)).toBe(true);
  });
});

describe('seed dataset integrity', () => {
  it('has unique ids', () => {
    const ids = SEED_CHARACTERS.map((character) => character.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every stat inside 0-100 and every character in at least one category', () => {
    for (const character of SEED_CHARACTERS) {
      expect(character.categories.length).toBeGreaterThan(0);
      expect(character.roles.length).toBeGreaterThan(0);
      expect(character.basePrice).toBeGreaterThan(0);
      for (const value of Object.values(character.stats)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('ships a meaningful roster across every universe', () => {
    expect(SEED_CHARACTERS.length).toBeGreaterThanOrEqual(100);
    const universes = new Set(SEED_CHARACTERS.flatMap((character) => character.categories));
    expect(universes.size).toBe(9);
  });
});
