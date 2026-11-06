import { characterPower } from './scoring';
import type { Character, GameState, ScoringConfig } from './types';

export interface PurchaseAnalytic {
  characterId: string;
  characterName: string;
  playerId: string;
  teamName: string;
  price: number;
  basePrice: number;
  power: number;
  /** Power bought per credit — the "smart purchase" metric. */
  valueScore: number;
  overpay: number;
  bidCount: number;
  round: number;
}

export interface PlayerAnalytic {
  playerId: string;
  teamName: string;
  name: string;
  spent: number;
  remaining: number;
  characters: number;
  averagePrice: number;
  highestPurchase: number;
  bidsPlaced: number;
  /** Bids placed per character actually won — high means aggressive. */
  aggression: number;
  /** Average price paid relative to base price — under 1 means disciplined. */
  discipline: number;
  powerPerCredit: number;
  totalPower: number;
}

export interface AuctionAnalytics {
  totalLots: number;
  soldLots: number;
  passedLots: number;
  totalCreditsSpent: number;
  averagePrice: number;
  averageBid: number;
  highestBid: number;
  lowestWinningBid: number;
  mostExpensive: PurchaseAnalytic | null;
  bestValue: PurchaseAnalytic | null;
  worstValue: PurchaseAnalytic | null;
  largestOverpay: PurchaseAnalytic | null;
  mostContested: PurchaseAnalytic | null;
  fastestPurchase: PurchaseAnalytic | null;
  biggestSurprise: PurchaseAnalytic | null;
  strongestCharacter: { characterId: string; characterName: string; power: number; teamName: string } | null;
  purchases: PurchaseAnalytic[];
  players: PlayerAnalytic[];
  mostAggressive: PlayerAnalytic | null;
  mostDisciplined: PlayerAnalytic | null;
  bestValueTeam: PlayerAnalytic | null;
  highestSpendingTeam: PlayerAnalytic | null;
}

/**
 * Post-auction analysis. Pure and deterministic so the War Room, the results screen and
 * the archive API all derive identical numbers from the same stored game state.
 */
export function computeAnalytics(
  state: GameState,
  characters: Map<string, Character>,
  config: ScoringConfig = state.settings.scoring,
): AuctionAnalytics {
  const playerMap = new Map(state.players.map((player) => [player.id, player]));

  const purchases: PurchaseAnalytic[] = [];
  for (const record of state.purchases) {
    if (record.passed || !record.playerId) continue;
    const character = characters.get(record.characterId);
    const player = playerMap.get(record.playerId);
    if (!character || !player) continue;
    const power = characterPower(character, config);
    purchases.push({
      characterId: character.id,
      characterName: character.name,
      playerId: player.id,
      teamName: player.teamName,
      price: record.price,
      basePrice: character.basePrice,
      power,
      valueScore: record.price > 0 ? Math.round((power / record.price) * 100) / 100 : 0,
      overpay: record.price - character.basePrice,
      bidCount: record.bidCount,
      round: record.round,
    });
  }

  const soldLots = purchases.length;
  const passedLots = state.purchases.filter((record) => record.passed).length;
  const totalCreditsSpent = purchases.reduce((sum, entry) => sum + entry.price, 0);
  const bidAmounts = state.bids.map((bid) => bid.amount);

  const pick = (
    compare: (a: PurchaseAnalytic, b: PurchaseAnalytic) => number,
  ): PurchaseAnalytic | null =>
    purchases.length ? [...purchases].sort(compare)[0] : null;

  const players: PlayerAnalytic[] = state.players
    .filter((player) => !player.isSpectator)
    .map((player) => {
      const own = purchases.filter((entry) => entry.playerId === player.id);
      const bidsPlaced = state.bids.filter((bid) => bid.playerId === player.id).length;
      const spent = player.spent;
      const totalPower = own.reduce((sum, entry) => sum + entry.power, 0);
      const baseTotal = own.reduce((sum, entry) => sum + entry.basePrice, 0);
      return {
        playerId: player.id,
        teamName: player.teamName,
        name: player.name,
        spent,
        remaining: player.budget,
        characters: own.length,
        averagePrice: own.length ? Math.round(spent / own.length) : 0,
        highestPurchase: own.reduce((max, entry) => Math.max(max, entry.price), 0),
        bidsPlaced,
        aggression: own.length ? Math.round((bidsPlaced / own.length) * 100) / 100 : bidsPlaced,
        discipline: baseTotal > 0 ? Math.round((spent / baseTotal) * 100) / 100 : 0,
        powerPerCredit: spent > 0 ? Math.round((totalPower / spent) * 100) / 100 : 0,
        totalPower,
      };
    });

  const bestPlayer = (
    compare: (a: PlayerAnalytic, b: PlayerAnalytic) => number,
  ): PlayerAnalytic | null => {
    const withPurchases = players.filter((player) => player.characters > 0);
    return withPurchases.length ? [...withPurchases].sort(compare)[0] : null;
  };

  const strongest = purchases.length
    ? [...purchases].sort((a, b) => b.power - a.power)[0]
    : null;

  // "Surprise" = the lot whose final price diverged most from its recommended value,
  // weighted by how many bids it took to get there.
  const biggestSurprise = pick(
    (a, b) =>
      Math.abs(b.overpay) * (1 + b.bidCount / 10) - Math.abs(a.overpay) * (1 + a.bidCount / 10),
  );

  return {
    totalLots: state.purchases.length,
    soldLots,
    passedLots,
    totalCreditsSpent,
    averagePrice: soldLots ? Math.round(totalCreditsSpent / soldLots) : 0,
    averageBid: bidAmounts.length
      ? Math.round(bidAmounts.reduce((sum, value) => sum + value, 0) / bidAmounts.length)
      : 0,
    highestBid: bidAmounts.length ? Math.max(...bidAmounts) : 0,
    lowestWinningBid: soldLots ? Math.min(...purchases.map((entry) => entry.price)) : 0,
    mostExpensive: pick((a, b) => b.price - a.price),
    bestValue: pick((a, b) => b.valueScore - a.valueScore),
    worstValue: pick((a, b) => a.valueScore - b.valueScore),
    largestOverpay: pick((a, b) => b.overpay - a.overpay),
    mostContested: pick((a, b) => b.bidCount - a.bidCount),
    fastestPurchase: pick((a, b) => a.bidCount - b.bidCount),
    biggestSurprise,
    strongestCharacter: strongest
      ? {
          characterId: strongest.characterId,
          characterName: strongest.characterName,
          power: strongest.power,
          teamName: strongest.teamName,
        }
      : null,
    purchases,
    players,
    mostAggressive: bestPlayer((a, b) => b.aggression - a.aggression),
    mostDisciplined: bestPlayer((a, b) => a.discipline - b.discipline),
    bestValueTeam: bestPlayer((a, b) => b.powerPerCredit - a.powerPerCredit),
    highestSpendingTeam: bestPlayer((a, b) => b.spent - a.spent),
  };
}
