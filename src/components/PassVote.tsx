'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ViewerState } from '@/lib/protocol';
import { cn } from '@/lib/cn';
import { request } from '@/lib/socket-client';
import { useSettings } from '@/lib/settings';

/**
 * Group skip.
 *
 * Any player who could still bid on this lot gets a vote. When every one of them agrees,
 * the server passes the lot and reveals the next character — nobody has to wait out a
 * clock on a character the whole room is ignoring. A bid cancels the vote, and the server
 * decides when the tally is unanimous; this component only reports what it is told.
 */
export function PassVote({
  viewer,
  className,
}: {
  viewer: ViewerState | null;
  className?: string;
}) {
  const { cue } = useSettings();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!viewer || viewer.isSpectator || viewer.rosterFull) return null;
  if (viewer.passVotesNeeded <= 0) return null;

  const { passVotes, passVotesNeeded, hasVotedPass, canVotePass } = viewer;
  const remaining = Math.max(0, passVotesNeeded - passVotes);

  const toggle = async () => {
    if (!canVotePass || pending) return;
    setPending(true);
    setError(null);
    const response = await request('vote:pass', { pass: !hasVotedPass });
    setPending(false);
    if (!response.ok) {
      setError(response.error?.message ?? 'Could not register that vote.');
      cue('error');
      return;
    }
    cue('click');
  };

  return (
    <div className={cn('rounded-xl border border-white/10 bg-panel-deep p-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-cream">Nobody want this one?</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {passVotes === 0
              ? `All ${passVotesNeeded} players must agree to skip.`
              : remaining === 0
                ? 'Skipping…'
                : `${passVotes} of ${passVotesNeeded} voted — ${remaining} more to skip.`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!canVotePass || pending}
          aria-pressed={hasVotedPass}
          className={cn(
            'no-tap-highlight shrink-0 rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
            hasVotedPass
              ? 'border-violet/50 bg-violet/15 text-violet'
              : 'border-white/15 bg-white/[0.04] text-subtle hover:border-white/30 hover:text-cream',
            (!canVotePass || pending) && 'cursor-not-allowed opacity-40',
          )}
        >
          {hasVotedPass ? 'Voted skip' : 'Vote skip'}
        </button>
      </div>

      {/* tally pips */}
      <div className="mt-2.5 flex gap-1" aria-hidden>
        {Array.from({ length: passVotesNeeded }).map((_, index) => (
          <motion.span
            key={index}
            initial={false}
            animate={{ opacity: index < passVotes ? 1 : 0.18 }}
            className="h-1 flex-1 rounded-full bg-violet"
          />
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {passVotes} of {passVotesNeeded} players have voted to skip this character.
      </p>

      {error ? <p className="mt-2 text-[11px] text-accent">{error}</p> : null}
      {!canVotePass && !hasVotedPass ? (
        <p className="mt-2 text-[11px] text-muted">
          Skipping is closed once a lot has a bid.
        </p>
      ) : null}
    </div>
  );
}
