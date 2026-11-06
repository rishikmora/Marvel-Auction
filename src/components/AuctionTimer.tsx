'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useCountdown } from '@/hooks/useCountdown';
import { cn } from '@/lib/cn';
import { clock } from '@/lib/format';
import { useSettings } from '@/lib/settings';

export function AuctionTimer({
  endsAt,
  clockOffset,
  totalSeconds,
  paused,
  awaitingHost,
  extensions,
  className,
}: {
  endsAt: number | null;
  clockOffset: number;
  totalSeconds: number;
  paused?: boolean;
  awaitingHost?: boolean;
  extensions?: number;
  className?: string;
}) {
  const { remainingMs, seconds, urgency, running } = useCountdown(endsAt, clockOffset);
  const { cue, reduceMotion } = useSettings();
  const lastTick = useRef<number | null>(null);

  // One cue per whole second, and only inside the tense final stretch.
  useEffect(() => {
    if (!running || urgency === 'idle' || urgency === 'normal') {
      lastTick.current = null;
      return;
    }
    if (lastTick.current === seconds) return;
    lastTick.current = seconds;
    cue(urgency === 'critical' ? 'urgent' : 'tick');
  }, [seconds, running, urgency, cue]);

  const progress = totalSeconds > 0 ? Math.min(1, remainingMs / (totalSeconds * 1000)) : 0;
  const circumference = 2 * Math.PI * 46;

  const toneRing = {
    idle: 'stroke-white/20',
    normal: 'stroke-sky',
    warning: 'stroke-gold',
    critical: 'stroke-accent',
  }[urgency];

  const toneText = {
    idle: 'text-[var(--text-low)]',
    normal: 'text-white',
    warning: 'text-gold',
    critical: 'text-accent-soft',
  }[urgency];

  const label = paused
    ? 'PAUSED'
    : awaitingHost
      ? 'AWAITING HOST'
      : running
        ? 'AUCTION ENDS IN'
        : endsAt === null
          ? 'CLOCK IDLE'
          : 'TIME';

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="46" className="fill-none stroke-white/8" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r="46"
            className={cn('fill-none transition-[stroke-dashoffset] duration-200', toneRing)}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={
            urgency === 'critical' && running && !reduceMotion
              ? { scale: [1, 1.08, 1] }
              : { scale: 1 }
          }
          transition={{ duration: 0.5, repeat: urgency === 'critical' && running ? Infinity : 0 }}
        >
          <span className={cn('tabular display text-2xl sm:text-3xl', toneText)}>
            {paused
              ? '||'
              : endsAt === null
                ? '--:--'
                : clock(remainingMs)}
          </span>
        </motion.div>
        {urgency === 'critical' && running && !reduceMotion ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent/60 animate-pulse-ring"
            aria-hidden
          />
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p
          className={cn('display mt-1 text-lg sm:text-xl', toneText)}
          role="timer"
          aria-live={urgency === 'critical' ? 'assertive' : 'off'}
        >
          {paused ? 'Host paused' : endsAt === null ? 'Standing by' : `${seconds}s`}
        </p>
        {extensions ? (
          <p className="mt-1 text-[11px] text-gold">
            Anti-snipe extended ×{extensions}
          </p>
        ) : null}
      </div>
    </div>
  );
}
