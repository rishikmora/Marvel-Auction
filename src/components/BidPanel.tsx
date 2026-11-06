'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ViewerState } from '@/lib/protocol';
import { cn } from '@/lib/cn';
import { credits } from '@/lib/format';
import { request } from '@/lib/socket-client';
import { useSettings } from '@/lib/settings';
import { Button } from './ui/Button';

/**
 * Bid controls.
 *
 * Everything shown here is derived from the server's ViewerState — the quick-bid amounts,
 * the ceiling and the eligibility all arrive pre-computed, and the server re-validates the
 * bid anyway. The client is a keyboard, not a referee.
 */
export function BidPanel({
  viewer,
  live,
  className,
}: {
  viewer: ViewerState | null;
  live: boolean;
  className?: string;
}) {
  const { cue } = useSettings();
  const [custom, setCustom] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const canBid = Boolean(viewer?.canBid) && live;
  const minimum = viewer?.nextMinimumBid ?? 0;
  const ceiling = viewer?.maxBid ?? 0;

  useEffect(() => {
    setError(null);
  }, [minimum]);

  const quick = useMemo(() => viewer?.quickBids ?? [], [viewer?.quickBids]);

  const submit = async (amount: number) => {
    if (!canBid || pending) return;
    if (!Number.isFinite(amount) || amount < minimum) {
      setError(`Minimum bid is ${credits(minimum)} credits.`);
      cue('error');
      return;
    }
    if (amount > ceiling) {
      setError(`Your ceiling this round is ${credits(ceiling)} credits.`);
      cue('error');
      return;
    }

    setPending(true);
    setError(null);
    const response = await request('bid:place', { amount });
    setPending(false);

    if (!response.ok) {
      setError(response.error?.message ?? 'That bid was rejected.');
      cue('error');
      return;
    }
    cue('bid');
    setCustom('');
    setFlash(`Bid ${credits(amount)} accepted`);
    window.setTimeout(() => setFlash(null), 1600);
  };

  if (!viewer) return null;

  if (viewer.isSpectator) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center', className)}>
        <p className="eyebrow">Spectating</p>
        <p className="mt-1 text-sm text-[var(--text-mid)]">
          You are watching this auction. Bidding is closed to spectators.
        </p>
      </div>
    );
  }

  if (viewer.rosterFull) {
    return (
      <div
        className={cn(
          'rounded-xl border border-mint/30 bg-mint/[0.07] p-4 text-center',
          className,
        )}
      >
        <p className="display text-base text-mint">Team complete</p>
        <p className="mt-1 text-xs text-[var(--text-mid)]">
          Every roster slot is filled. Sit back and watch the rest of the board fight it out.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Your ceiling</p>
          <p className="tabular display text-lg text-gold">{credits(ceiling)}</p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Min bid</p>
          <p className="tabular display text-lg text-white">{credits(minimum)}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {quick.length ? (
          quick.map((amount) => (
            <Button
              key={amount}
              variant="secondary"
              size="md"
              silent
              disabled={!canBid || pending}
              onClick={() => submit(amount)}
              className="tabular"
            >
              {credits(amount)}
            </Button>
          ))
        ) : (
          <p className="col-span-4 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-center text-[11px] text-[var(--text-low)]">
            No quick bid fits inside your remaining budget.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={custom}
          min={minimum}
          max={ceiling}
          disabled={!canBid || pending}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit(Number(custom));
          }}
          placeholder={`Custom (${credits(minimum)}+)`}
          aria-label="Custom bid amount"
          className="tabular w-full rounded-lg border border-white/12 bg-black/50 px-3 text-sm text-white placeholder:text-[var(--text-low)] focus:border-sky/60 disabled:opacity-50"
        />
        <Button
          variant="outline"
          size="md"
          silent
          disabled={!canBid || pending || !custom}
          onClick={() => void submit(Number(custom))}
        >
          Bid
        </Button>
      </div>

      <Button
        variant="primary"
        size="xl"
        loading={pending}
        silent
        disabled={!canBid || pending || quick.length === 0}
        onClick={() => void submit(quick[0] ?? minimum)}
        className="w-full"
      >
        {canBid ? `Bid ${credits(quick[0] ?? minimum)}` : 'Bidding closed'}
      </Button>

      <div className="min-h-[18px] text-center" aria-live="polite">
        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key={error}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[11px] font-semibold text-accent-soft"
            >
              {error}
            </motion.p>
          ) : flash ? (
            <motion.p
              key={flash}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[11px] font-semibold text-mint"
            >
              {flash}
            </motion.p>
          ) : !canBid && viewer.blockedReason ? (
            <p className="text-[11px] text-[var(--text-low)]">{viewer.blockedReason}</p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
