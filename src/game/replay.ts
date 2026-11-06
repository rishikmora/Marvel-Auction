import type { BidRecord, Character, Player, PurchaseRecord } from './types';

export type ReplayEventType = 'REVEAL' | 'BID' | 'SOLD' | 'PASSED';

export interface ReplayEvent {
  id: string;
  /** Milliseconds since the first event of the auction. */
  offset: number;
  type: ReplayEventType;
  round: number;
  label: string;
  amount?: number;
  antiSnipe?: boolean;
}

export interface Replay {
  events: ReplayEvent[];
  durationMs: number;
}

export interface ReplayInput {
  bids: BidRecord[];
  purchases: PurchaseRecord[];
  players: Player[];
  characters: Map<string, Character>;
  /** The game's configured clock, used to place lots that drew no bids. */
  auctionSeconds: number;
}

const TAIL_PADDING_MS = 1500;

/**
 * Rebuilds an auction timeline from the stored bid log.
 *
 * A lot that drew no bids has no recorded opening time, so it has to be inferred
 * backwards from when it resolved. Each round's opening is therefore clamped to the
 * previous round's resolution — without that clamp an unbid lot can be placed before the
 * auction began, which reorders the timeline and inflates its duration.
 */
export function buildReplay({
  bids,
  purchases,
  players,
  characters,
  auctionSeconds,
}: ReplayInput): Replay {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const auctionMs = Math.max(1000, auctionSeconds * 1000);
  const raw: { at: number; event: Omit<ReplayEvent, 'offset'> }[] = [];

  const ordered = [...purchases].sort((a, b) => a.round - b.round);
  let previousResolvedAt = 0;

  for (const purchase of ordered) {
    const roundBids = bids
      .filter((bid) => bid.round === purchase.round)
      .sort((a, b) => a.at - b.at);
    const character = characters.get(purchase.characterId);
    const name = character?.name ?? purchase.characterId;

    const inferredOpen = roundBids.length
      ? roundBids[0].at - roundBids[0].offsetMs
      : purchase.at - auctionMs;
    const openedAt = Math.min(
      purchase.at,
      previousResolvedAt ? Math.max(previousResolvedAt, inferredOpen) : inferredOpen,
    );
    previousResolvedAt = purchase.at;

    raw.push({
      at: openedAt,
      event: {
        id: `reveal-${purchase.id}`,
        type: 'REVEAL',
        round: purchase.round,
        label: `${name} revealed`,
        amount: character?.basePrice,
      },
    });

    for (const bid of roundBids) {
      raw.push({
        at: bid.at,
        event: {
          id: bid.id,
          type: 'BID',
          round: bid.round,
          label: `${playerMap.get(bid.playerId)?.teamName ?? 'A team'} bids`,
          amount: bid.amount,
          antiSnipe: bid.triggeredAntiSnipe,
        },
      });
    }

    raw.push({
      at: purchase.at,
      event: {
        id: `end-${purchase.id}`,
        type: purchase.passed ? 'PASSED' : 'SOLD',
        round: purchase.round,
        label: purchase.passed
          ? `${name} unsold`
          : `${name} SOLD to ${playerMap.get(purchase.playerId ?? '')?.teamName ?? 'a team'}`,
        amount: purchase.passed ? undefined : purchase.price,
      },
    });
  }

  raw.sort((a, b) => a.at - b.at);
  const start = raw[0]?.at ?? 0;
  const events: ReplayEvent[] = raw.map((entry) => ({
    ...entry.event,
    offset: entry.at - start,
  }));

  return {
    events,
    durationMs: events.length ? events[events.length - 1].offset + TAIL_PADDING_MS : 0,
  };
}
