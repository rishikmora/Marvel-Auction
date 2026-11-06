import type { Character, GameState, RankedTeam } from './types';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Profile achievements are awarded from lifetime totals rather than a single game. */
  scope: 'game' | 'profile';
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'MASTER_AUCTIONEER',
    name: 'Master Auctioneer',
    description: 'Win 10 auctions.',
    icon: '👑',
    scope: 'profile',
  },
  {
    id: 'BIG_SPENDER',
    name: 'Big Spender',
    description: 'Buy a single character for 500 credits or more.',
    icon: '💰',
    scope: 'game',
  },
  {
    id: 'PERFECT_BALANCE',
    name: 'Perfect Balance',
    description: 'Finish an auction with the best team-balance score on the board.',
    icon: '⚖️',
    scope: 'game',
  },
  {
    id: 'COSMIC_TYCOON',
    name: 'Cosmic Tycoon',
    description: 'Add a cosmic-tier character to your roster.',
    icon: '🌌',
    scope: 'game',
  },
  {
    id: 'LAST_SECOND_KING',
    name: 'Last Second King',
    description: 'Win a character with a bid that triggered the anti-snipe clock.',
    icon: '⏱️',
    scope: 'game',
  },
  {
    id: 'CHAMPION',
    name: 'Champion',
    description: 'Finish first in an auction battle.',
    icon: '🏆',
    scope: 'game',
  },
  {
    id: 'FULL_HOUSE',
    name: 'Full House',
    description: 'Fill every roster slot before the auction ends.',
    icon: '🎴',
    scope: 'game',
  },
  {
    id: 'BARGAIN_HUNTER',
    name: 'Bargain Hunter',
    description: 'Record the best value purchase of the auction.',
    icon: '🎯',
    scope: 'game',
  },
];

export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((entry) => [entry.id, entry]));

/**
 * Awards the per-game achievements. Keyed by player *name* because profiles are
 * name-scoped and survive across rooms.
 */
export function buildAchievements(
  state: GameState,
  rankings: RankedTeam[],
  characters: Map<string, Character>,
): Record<string, string[]> {
  const earned: Record<string, Set<string>> = {};
  const award = (playerId: string, achievement: string) => {
    const player = state.players.find((entry) => entry.id === playerId);
    if (!player) return;
    (earned[player.name] ??= new Set()).add(achievement);
  };

  for (const purchase of state.purchases) {
    if (purchase.passed || !purchase.playerId) continue;
    if (purchase.price >= 500) award(purchase.playerId, 'BIG_SPENDER');
    const character = characters.get(purchase.characterId);
    if (character && (character.tier === 'COSMIC' || character.tier === 'OMEGA')) {
      award(purchase.playerId, 'COSMIC_TYCOON');
    }
  }

  // A winning bid that triggered the anti-snipe extension.
  for (const purchase of state.purchases) {
    if (purchase.passed || !purchase.playerId) continue;
    const winningBid = state.bids
      .filter((bid) => bid.round === purchase.round && bid.playerId === purchase.playerId)
      .sort((a, b) => b.amount - a.amount)[0];
    if (winningBid?.triggeredAntiSnipe) award(purchase.playerId, 'LAST_SECOND_KING');
  }

  for (const player of state.players) {
    if (player.isSpectator) continue;
    if (player.roster.length >= state.settings.maxRoster) award(player.id, 'FULL_HOUSE');
  }

  for (const team of rankings) {
    if (team.rank === 1) award(team.playerId, 'CHAMPION');
  }

  const bestBalance = rankings.reduce<RankedTeam | null>(
    (best, team) => (!best || team.balanceBonus > best.balanceBonus ? team : best),
    null,
  );
  if (bestBalance && bestBalance.balanceBonus > 0) award(bestBalance.playerId, 'PERFECT_BALANCE');

  // Best value = most power per credit spent.
  let bestValue: { playerId: string; ratio: number } | null = null;
  for (const purchase of state.purchases) {
    if (purchase.passed || !purchase.playerId || purchase.price <= 0) continue;
    const team = rankings.find((entry) => entry.playerId === purchase.playerId);
    const score = team?.characters.find((entry) => entry.characterId === purchase.characterId);
    if (!score) continue;
    const ratio = score.power / purchase.price;
    if (!bestValue || ratio > bestValue.ratio) bestValue = { playerId: purchase.playerId, ratio };
  }
  if (bestValue) award(bestValue.playerId, 'BARGAIN_HUNTER');

  return Object.fromEntries(
    Object.entries(earned).map(([name, set]) => [name, Array.from(set)]),
  );
}
