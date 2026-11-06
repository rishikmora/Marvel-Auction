import { COUNTER_RELATIONSHIPS } from './data/counters';
import { seededRandom, pick } from './rng';
import { scoreTeam } from './scoring';
import type { Character, CounterRelationship, ScoringConfig, StatKey } from './types';

export interface BattleSide {
  playerId: string;
  teamName: string;
  characters: Character[];
}

export interface BattleRound {
  index: number;
  title: string;
  focus: string;
  aScore: number;
  bScore: number;
  winner: 'A' | 'B' | 'DRAW';
  narrative: string[];
  standoutA: string | null;
  standoutB: string | null;
}

export interface CounterNote {
  reason: string;
  favours: 'A' | 'B';
  multiplier: number;
}

export interface BattleResult {
  seed: string;
  a: { playerId: string; teamName: string };
  b: { playerId: string; teamName: string };
  rounds: BattleRound[];
  aRoundsWon: number;
  bRoundsWon: number;
  aTotal: number;
  bTotal: number;
  winnerPlayerId: string | null;
  margin: number;
  counters: CounterNote[];
  summary: string;
}

/** Each round emphasises different stats, so a one-dimensional roster loses somewhere. */
const ROUND_DEFINITIONS: {
  title: string;
  focus: string;
  weights: Partial<Record<StatKey, number>>;
}[] = [
  {
    title: 'ROUND 1 — FIRST CONTACT',
    focus: 'Speed and technique decide the opening exchange.',
    weights: { speed: 0.4, combat: 0.4, versatility: 0.2 },
  },
  {
    title: 'ROUND 2 — ESCALATION',
    focus: 'Raw output. Whoever can hit hardest starts dictating terms.',
    weights: { strength: 0.4, energy: 0.4, specialAbility: 0.2 },
  },
  {
    title: 'ROUND 3 — THE PLAN',
    focus: 'Command and adaptability reshape the battlefield.',
    weights: { intelligence: 0.35, leadership: 0.35, versatility: 0.3 },
  },
  {
    title: 'ROUND 4 — ATTRITION',
    focus: 'The fight goes long. Durability and staying power take over.',
    weights: { durability: 0.5, specialAbility: 0.3, strength: 0.2 },
  },
  {
    title: 'FINAL ROUND — DECISION',
    focus: 'Everything on the board at once.',
    weights: {
      strength: 0.15,
      speed: 0.12,
      durability: 0.15,
      intelligence: 0.12,
      combat: 0.15,
      energy: 0.15,
      leadership: 0.08,
      specialAbility: 0.08,
    },
  },
];

const OPENING_LINES = [
  '{name} opens the engagement and immediately forces a reaction.',
  '{name} sets the tempo before the other side has settled.',
  '{name} takes the centre of the field and refuses to give it back.',
];

const POWER_LINES = [
  '{name} escalates hard — the exchange stops being survivable for anyone nearby.',
  '{name} lands the kind of hit that ends conversations.',
  '{name} unloads everything and the terrain changes shape.',
];

const STRATEGY_LINES = [
  '{name} reads the formation and calls the counter-move.',
  '{name} rewrites the engagement mid-fight.',
  '{name} finds the seam in the other side’s coordination.',
];

const ATTRITION_LINES = [
  '{name} absorbs punishment that should have ended the fight and keeps advancing.',
  '{name} simply outlasts what is being thrown at them.',
  '{name} is still standing, and that is starting to matter more than anything else.',
];

const FINAL_LINES = [
  '{name} makes the decisive play with the whole team behind it.',
  '{name} closes the distance one last time.',
  '{name} turns the final exchange into a formality.',
];

const LINE_SETS = [OPENING_LINES, POWER_LINES, STRATEGY_LINES, ATTRITION_LINES, FINAL_LINES];

function roundStatScore(character: Character, weights: Partial<Record<StatKey, number>>): number {
  let total = 0;
  for (const [key, weight] of Object.entries(weights) as [StatKey, number][]) {
    total += character.stats[key] * weight;
  }
  return total;
}

/**
 * Tag-to-tag matchup bonus. Dampened by how many characters on each side are actually
 * involved, so a single niche counter cannot swing an entire battle.
 */
function counterAdvantage(
  attackers: Character[],
  defenders: Character[],
  relationships: CounterRelationship[],
): { multiplier: number; notes: { reason: string; multiplier: number }[] } {
  let multiplier = 1;
  const notes: { reason: string; multiplier: number }[] = [];

  for (const relationship of relationships) {
    const sources = attackers.filter(
      (character) =>
        character.synergyTags.includes(relationship.sourceTag) ||
        character.roles.some((role) => role.toLowerCase() === relationship.sourceTag),
    ).length;
    if (!sources) continue;
    const targets = defenders.filter(
      (character) =>
        character.synergyTags.includes(relationship.targetTag) ||
        character.roles.some((role) => role.toLowerCase() === relationship.targetTag),
    ).length;
    if (!targets) continue;

    const involvement = Math.min(1, (sources * targets) / 4);
    const effective = 1 + (relationship.advantageMultiplier - 1) * involvement;
    multiplier *= effective;
    notes.push({ reason: relationship.reason, multiplier: effective });
  }

  // Keep the total counter swing sane even when many relationships stack.
  const capped = Math.min(multiplier, 1.45);
  return { multiplier: capped, notes: notes.sort((a, b) => b.multiplier - a.multiplier).slice(0, 4) };
}

/**
 * Exhibition battle between two rosters.
 *
 * This is entertainment layered on top of the auction result, not a claim about canon —
 * and it deliberately does not feed the auction ranking.
 */
export function simulateBattle(
  a: BattleSide,
  b: BattleSide,
  config: ScoringConfig,
  seedInput: string,
): BattleResult {
  const seed = `${seedInput}:${a.playerId}:${b.playerId}`;
  const random = seededRandom(seed);

  const aScore = scoreTeam(a.playerId, a.characters, config);
  const bScore = scoreTeam(b.playerId, b.characters, config);

  const aCounter = counterAdvantage(a.characters, b.characters, COUNTER_RELATIONSHIPS);
  const bCounter = counterAdvantage(b.characters, a.characters, COUNTER_RELATIONSHIPS);

  // Synergy and role coverage carry into the fight as a small standing multiplier.
  const aCohesion =
    1 + (aScore.synergyBonus + aScore.balanceBonus) / Math.max(1, aScore.characterPower) * 0.6;
  const bCohesion =
    1 + (bScore.synergyBonus + bScore.balanceBonus) / Math.max(1, bScore.characterPower) * 0.6;

  const rounds: BattleRound[] = [];
  let aRoundsWon = 0;
  let bRoundsWon = 0;
  let aTotal = 0;
  let bTotal = 0;
  let momentum = 0; // positive favours A

  ROUND_DEFINITIONS.forEach((definition, index) => {
    const rate = (characters: Character[]) =>
      characters
        .map((character) => ({ character, value: roundStatScore(character, definition.weights) }))
        .sort((x, y) => y.value - x.value);

    const aRated = rate(a.characters);
    const bRated = rate(b.characters);

    // The best three contributors carry the round; depth still counts, but less.
    const contribution = (rated: { value: number }[]) =>
      rated.reduce((sum, entry, position) => sum + entry.value * (position < 3 ? 1 : 0.45), 0);

    const aVariance = 0.96 + random() * 0.08;
    const bVariance = 0.96 + random() * 0.08;

    const aRound =
      contribution(aRated) * aCounter.multiplier * aCohesion * aVariance * (1 + momentum * 0.05);
    const bRound =
      contribution(bRated) * bCounter.multiplier * bCohesion * bVariance * (1 - momentum * 0.05);

    const aRounded = Math.round(aRound);
    const bRounded = Math.round(bRound);
    aTotal += aRounded;
    bTotal += bRounded;

    let winner: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (Math.abs(aRounded - bRounded) < Math.max(aRounded, bRounded) * 0.015) {
      winner = 'DRAW';
    } else if (aRounded > bRounded) {
      winner = 'A';
      aRoundsWon += 1;
      momentum = Math.min(2, momentum + 1);
    } else {
      winner = 'B';
      bRoundsWon += 1;
      momentum = Math.max(-2, momentum - 1);
    }

    const standoutA = aRated[0]?.character ?? null;
    const standoutB = bRated[0]?.character ?? null;
    const lines = LINE_SETS[index] ?? FINAL_LINES;

    const narrative: string[] = [];
    if (standoutA) narrative.push(pick(random, lines).replace('{name}', standoutA.name));
    if (standoutB) {
      const alternate = lines.filter((line) => line !== narrative[0]);
      narrative.push(
        pick(random, alternate.length ? alternate : lines).replace('{name}', standoutB.name),
      );
    }
    if (winner === 'A') {
      narrative.push(`${a.teamName} takes the round.`);
    } else if (winner === 'B') {
      narrative.push(`${b.teamName} takes the round.`);
    } else {
      narrative.push('Neither side gives ground. The round is a wash.');
    }

    rounds.push({
      index: index + 1,
      title: definition.title,
      focus: definition.focus,
      aScore: aRounded,
      bScore: bRounded,
      winner,
      narrative,
      standoutA: standoutA?.id ?? null,
      standoutB: standoutB?.id ?? null,
    });
  });

  let winnerPlayerId: string | null = null;
  if (aRoundsWon !== bRoundsWon) {
    winnerPlayerId = aRoundsWon > bRoundsWon ? a.playerId : b.playerId;
  } else if (aTotal !== bTotal) {
    winnerPlayerId = aTotal > bTotal ? a.playerId : b.playerId;
  }

  const winnerName =
    winnerPlayerId === a.playerId ? a.teamName : winnerPlayerId === b.playerId ? b.teamName : null;

  const counters: CounterNote[] = [
    ...aCounter.notes.map((note) => ({ ...note, favours: 'A' as const })),
    ...bCounter.notes.map((note) => ({ ...note, favours: 'B' as const })),
  ]
    .sort((x, y) => y.multiplier - x.multiplier)
    .slice(0, 5);

  const summary = winnerName
    ? `${winnerName} wins ${Math.max(aRoundsWon, bRoundsWon)}–${Math.min(aRoundsWon, bRoundsWon)}. ${
        Math.abs(aTotal - bTotal) < (aTotal + bTotal) * 0.03
          ? 'It was close enough that a different opening exchange might have flipped it.'
          : 'The margin was never really in doubt after the middle rounds.'
      }`
    : 'A genuine stalemate — both sides walk away intact.';

  return {
    seed,
    a: { playerId: a.playerId, teamName: a.teamName },
    b: { playerId: b.playerId, teamName: b.teamName },
    rounds,
    aRoundsWon,
    bRoundsWon,
    aTotal,
    bTotal,
    winnerPlayerId,
    margin: Math.abs(aTotal - bTotal),
    counters,
    summary,
  };
}
