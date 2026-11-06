'use client';

import type { Player } from '@/game/types';
import { cn } from '@/lib/cn';
import { credits } from '@/lib/format';
import { Meter } from './ui/Primitives';

export function BudgetWidget({
  player,
  startingBudget,
  maxBid,
  className,
}: {
  player: Player;
  startingBudget: number;
  /** The server-computed ceiling, which can be lower than the raw balance. */
  maxBid?: number;
  className?: string;
}) {
  const prices = player.roster.map((entry) => entry.price);
  const highest = prices.length ? Math.max(...prices) : 0;
  const average = prices.length
    ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length)
    : 0;
  const spentPct = startingBudget > 0 ? (player.spent / startingBudget) * 100 : 0;
  const low = player.budget <= startingBudget * 0.15;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Remaining</p>
          <p
            className={cn(
              'tabular display text-3xl leading-none',
              low ? 'text-accent-soft' : 'text-gold',
            )}
          >
            {credits(player.budget)}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Spent</p>
          <p className="tabular display text-xl leading-none text-[var(--text-mid)]">
            {credits(player.spent)}
          </p>
        </div>
      </div>

      <Meter
        value={spentPct}
        tone={low ? 'crimson' : 'gold'}
        label={`${Math.round(spentPct)}% of budget spent`}
      />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <div className="flex justify-between">
          <dt className="text-[var(--text-low)]">Starting</dt>
          <dd className="tabular font-bold text-[var(--text-mid)]">{credits(startingBudget)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--text-low)]">Characters</dt>
          <dd className="tabular font-bold text-[var(--text-mid)]">{player.roster.length}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--text-low)]">Highest buy</dt>
          <dd className="tabular font-bold text-[var(--text-mid)]">{credits(highest)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--text-low)]">Average</dt>
          <dd className="tabular font-bold text-[var(--text-mid)]">{credits(average)}</dd>
        </div>
      </dl>

      {maxBid !== undefined && maxBid < player.budget ? (
        <p className="rounded-lg border border-gold/25 bg-gold/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-gold">
          Bid ceiling {credits(maxBid)} — the rest is reserved so you can still fill your remaining
          slots.
        </p>
      ) : null}
    </div>
  );
}
