import { DEFAULT_SCORING, normalizeWeights } from './config';
import { SYNERGY_RULES } from './data/synergy-rules';
import type {
  BalanceDetail,
  Character,
  CharacterScore,
  PenaltyDetail,
  PillarCoverage,
  Player,
  RankedTeam,
  Role,
  ScoringConfig,
  StatKey,
  SynergyHit,
  SynergyRule,
  TeamScore,
} from './types';
import { STAT_KEYS } from './types';

/**
 * Role pillars describe what a *complete* roster looks like. Balance is measured as
 * weighted coverage of these pillars rather than as raw role counts, so a team of
 * seven damage dealers scores worse than a team that can actually hold a line.
 */
export const ROLE_PILLARS: { id: string; label: string; roles: Role[]; weight: number }[] = [
  { id: 'frontline', label: 'Frontline', roles: ['TANK'], weight: 1 },
  { id: 'damage', label: 'Damage', roles: ['DAMAGE', 'ASSASSIN'], weight: 1 },
  { id: 'support', label: 'Support', roles: ['SUPPORT'], weight: 1 },
  { id: 'command', label: 'Command', roles: ['LEADER', 'STRATEGIST'], weight: 1 },
  { id: 'mobility', label: 'Mobility', roles: ['SPEEDSTER'], weight: 0.8 },
  { id: 'ranged', label: 'Ranged', roles: ['RANGED'], weight: 0.8 },
  { id: 'esoteric', label: 'Esoteric', roles: ['MAGICAL', 'COSMIC'], weight: 0.9 },
  { id: 'tech', label: 'Tech', roles: ['TECH', 'MUTANT'], weight: 0.7 },
];

const PILLAR_WEIGHT_TOTAL = ROLE_PILLARS.reduce((sum, pillar) => sum + pillar.weight, 0);

/* ------------------------------------------------------------------ */
/* Character power                                                     */
/* ------------------------------------------------------------------ */

/** Per-stat contribution to a character's score, kept for the transparency panel. */
export function statContributions(
  character: Character,
  config: ScoringConfig = DEFAULT_SCORING,
): Record<StatKey, number> {
  const weights = normalizeWeights(config.weights);
  const contributions = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) {
    contributions[key] = character.stats[key] * weights[key] * config.powerScale;
  }
  return contributions;
}

/** Scaled character power. With the default powerScale of 10 this lands in 0-1000. */
export function characterPower(
  character: Character,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  const weights = normalizeWeights(config.weights);
  let total = 0;
  for (const key of STAT_KEYS) total += character.stats[key] * weights[key];
  return Math.round(total * config.powerScale);
}

/** The 0-100 figure shown on auction cards. */
export function characterRating(
  character: Character,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  return Math.round(characterPower(character, config) / config.powerScale);
}

export function scoreCharacter(
  character: Character,
  config: ScoringConfig = DEFAULT_SCORING,
): CharacterScore {
  return {
    characterId: character.id,
    power: characterPower(character, config),
    contributions: statContributions(character, config),
  };
}

/* ------------------------------------------------------------------ */
/* Synergy                                                             */
/* ------------------------------------------------------------------ */

export function evaluateSynergies(
  characters: Character[],
  rules: SynergyRule[] = SYNERGY_RULES,
): SynergyHit[] {
  const hits: SynergyHit[] = [];
  for (const rule of rules) {
    const members = characters.filter((character) => character.synergyTags.includes(rule.tag));
    if (members.length < rule.minCount) continue;
    const raw = rule.flatBonus + (members.length - rule.minCount) * rule.perExtraMember;
    const points = rule.cap ? Math.min(raw, rule.cap) : raw;
    hits.push({
      ruleId: rule.id,
      name: rule.name,
      description: rule.description,
      members: members.map((member) => member.id),
      points: Math.round(points),
    });
  }
  return hits.sort((a, b) => b.points - a.points);
}

/* ------------------------------------------------------------------ */
/* Balance                                                             */
/* ------------------------------------------------------------------ */

export function evaluateBalance(
  characters: Character[],
  config: ScoringConfig,
  characterPowerTotal: number,
): BalanceDetail {
  const pillars: PillarCoverage[] = ROLE_PILLARS.map((pillar) => {
    const memberIds = characters
      .filter((character) => character.roles.some((role) => pillar.roles.includes(role)))
      .map((character) => character.id);
    return { ...pillar, covered: memberIds.length > 0, memberIds };
  });

  const coveredWeight = pillars
    .filter((pillar) => pillar.covered)
    .reduce((sum, pillar) => sum + pillar.weight, 0);
  const coverageRatio = PILLAR_WEIGHT_TOTAL > 0 ? coveredWeight / PILLAR_WEIGHT_TOTAL : 0;

  // Stacking one role beyond the tolerance erodes the balance payout.
  const roleCounts = new Map<Role, number>();
  for (const character of characters) {
    const primary = character.roles[0];
    if (primary) roleCounts.set(primary, (roleCounts.get(primary) ?? 0) + 1);
  }
  let excess = 0;
  for (const count of roleCounts.values()) {
    if (count > config.redundancyThreshold) excess += count - config.redundancyThreshold;
  }
  const concentrationPenalty = Math.min(0.4, excess * 0.12);

  const effective = coverageRatio * (1 - concentrationPenalty);
  const points = Math.round(effective * config.maxBalancePct * characterPowerTotal);

  const rolesCovered = Array.from(new Set(characters.flatMap((character) => character.roles)));
  const rolesMissing = pillars
    .filter((pillar) => !pillar.covered)
    .flatMap((pillar) => pillar.roles)
    .filter((role) => !rolesCovered.includes(role));

  return {
    pillars,
    rolesCovered,
    rolesMissing: Array.from(new Set(rolesMissing)),
    coverageRatio,
    concentrationPenalty,
    points,
  };
}

/* ------------------------------------------------------------------ */
/* Team score                                                          */
/* ------------------------------------------------------------------ */

export function scoreTeam(
  playerId: string,
  characters: Character[],
  config: ScoringConfig = DEFAULT_SCORING,
  rules: SynergyRule[] = SYNERGY_RULES,
): TeamScore {
  const characterScores = characters.map((character) => scoreCharacter(character, config));
  const characterPowerTotal = characterScores.reduce((sum, score) => sum + score.power, 0);

  /* --- synergy, clamped so it can never outweigh the characters themselves --- */
  const synergies = evaluateSynergies(characters, rules);
  const synergyCap = Math.round(config.maxSynergyPct * characterPowerTotal);
  const synergyRaw = synergies.reduce((sum, hit) => sum + hit.points, 0);
  const synergyBonus = Math.min(synergyRaw, synergyCap);

  /* --- balance --- */
  const balance = evaluateBalance(characters, config, characterPowerTotal);
  const balanceCap = Math.round(config.maxBalancePct * characterPowerTotal);
  const balanceBonus = Math.min(balance.points, balanceCap);

  /* --- leadership --- */
  const leadershipValues = characters.map((character) => character.stats.leadership);
  const topLeadership = leadershipValues.length ? Math.max(...leadershipValues) : 0;
  const averageLeadership = leadershipValues.length
    ? leadershipValues.reduce((sum, value) => sum + value, 0) / leadershipValues.length
    : 0;
  const leadershipFactor = (0.6 * topLeadership + 0.4 * averageLeadership) / 100;
  const leadershipCap = Math.round(config.maxLeadershipPct * characterPowerTotal);
  const leadershipBonus = Math.min(
    Math.round(leadershipFactor * config.maxLeadershipPct * characterPowerTotal),
    leadershipCap,
  );
  const topLeader =
    characters.length > 0
      ? characters.reduce((best, character) =>
          character.stats.leadership > best.stats.leadership ? character : best,
        ).id
      : null;

  /* --- penalties --- */
  const penalties: PenaltyDetail[] = [];
  const roleCounts = new Map<Role, number>();
  for (const character of characters) {
    const primary = character.roles[0];
    if (primary) roleCounts.set(primary, (roleCounts.get(primary) ?? 0) + 1);
  }
  for (const [role, count] of roleCounts) {
    if (count > config.redundancyThreshold) {
      const excess = count - config.redundancyThreshold;
      penalties.push({
        reason: `${count} ${titleCase(role)} specialists — ${excess} beyond the redundancy tolerance`,
        points: Math.round(excess * config.redundancyPenaltyPerExcess),
      });
    }
  }
  const penaltyCap = Math.round(config.maxPenaltyPct * characterPowerTotal);
  const penaltyRaw = penalties.reduce((sum, entry) => sum + entry.points, 0);
  const penalty = Math.min(penaltyRaw, penaltyCap);

  const total = Math.max(
    0,
    characterPowerTotal + synergyBonus + balanceBonus + leadershipBonus - penalty,
  );

  const strongest = characterScores.reduce<CharacterScore | null>(
    (best, score) => (!best || score.power > best.power ? score : best),
    null,
  );

  return {
    playerId,
    characterPower: characterPowerTotal,
    synergyBonus,
    balanceBonus,
    leadershipBonus,
    penalty,
    total,
    caps: {
      synergy: synergyCap,
      balance: balanceCap,
      leadership: leadershipCap,
      penalty: penaltyCap,
    },
    characters: characterScores,
    synergies,
    balance: { ...balance, points: balanceBonus },
    leadership: {
      topLeader,
      averageLeadership: Math.round(averageLeadership * 10) / 10,
      points: leadershipBonus,
    },
    penalties,
    averagePower: characterScores.length
      ? Math.round(characterPowerTotal / characterScores.length)
      : 0,
    strongestCharacterId: strongest?.characterId ?? null,
    strongestCharacterPower: strongest?.power ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Ranking + tie-breaking                                              */
/* ------------------------------------------------------------------ */

const TIE_BREAK_LABELS = [
  'Higher synergy score',
  'Higher average character power',
  'Higher remaining budget',
  'Higher strongest-character score',
] as const;

/**
 * Deterministic ordering. Every comparison is published in the results screen so a
 * shared first place is always explainable rather than arbitrary.
 */
export function rankTeams(scores: TeamScore[], players: Player[]): RankedTeam[] {
  const playerMap = new Map(players.map((player) => [player.id, player]));

  const comparisons: ((a: TeamScore, b: TeamScore) => number)[] = [
    (a, b) => b.total - a.total,
    (a, b) => b.synergyBonus - a.synergyBonus,
    (a, b) => b.averagePower - a.averagePower,
    (a, b) =>
      (playerMap.get(b.playerId)?.budget ?? 0) - (playerMap.get(a.playerId)?.budget ?? 0),
    (a, b) => b.strongestCharacterPower - a.strongestCharacterPower,
  ];

  const sorted = [...scores].sort((a, b) => {
    for (const compare of comparisons) {
      const delta = compare(a, b);
      if (delta !== 0) return delta;
    }
    // Fully tied: stabilise on player id so repeated renders never reshuffle.
    return a.playerId.localeCompare(b.playerId);
  });

  const ranked: RankedTeam[] = [];
  let rank = 0;
  let previous: TeamScore | null = null;
  let previousRank = 0;

  sorted.forEach((score, index) => {
    const player = playerMap.get(score.playerId);
    if (!player) return;

    let tieBreak: string | null = null;
    let shared = false;

    if (previous) {
      if (previous.total === score.total) {
        // Identify which criterion actually separated them (if any).
        let separated = false;
        for (let i = 1; i < comparisons.length; i += 1) {
          if (comparisons[i](previous, score) !== 0) {
            tieBreak = TIE_BREAK_LABELS[i - 1];
            separated = true;
            break;
          }
        }
        if (!separated) {
          shared = true;
          rank = previousRank;
        } else {
          rank = index + 1;
        }
      } else {
        rank = index + 1;
      }
    } else {
      rank = 1;
    }

    if (shared && ranked.length) {
      ranked[ranked.length - 1].sharedRank = true;
    }

    ranked.push({ ...score, rank, player, sharedRank: shared, tieBreak });
    previous = score;
    previousRank = rank;
  });

  return ranked;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
