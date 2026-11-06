'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { buildReplay } from '@/game/replay';
import type { BidRecord, Character, Player, PurchaseRecord } from '@/game/types';
import { cn } from '@/lib/cn';
import { clock, credits } from '@/lib/format';
import { Button } from './ui/Button';
import { EmptyState } from './ui/Primitives';

const SPEEDS = [1, 2, 4, 8] as const;

/**
 * Auction replay.
 *
 * Rebuilt from the stored bid log rather than from a recording, so the timeline is exact:
 * every bid keeps the offset it was placed at within its round.
 */
export function ReplayTimeline({
  bids,
  purchases,
  players,
  characters,
  auctionSeconds,
  className,
}: {
  bids: BidRecord[];
  purchases: PurchaseRecord[];
  players: Player[];
  characters: Map<string, Character>;
  /** The game's configured clock, used to place lots that drew no bids. */
  auctionSeconds: number;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [cursor, setCursor] = useState(0);
  const raf = useRef<number | null>(null);
  const lastFrame = useRef<number>(0);

  const { events, durationMs: duration } = useMemo(
    () => buildReplay({ bids, purchases, players, characters, auctionSeconds }),
    [bids, purchases, players, characters, auctionSeconds],
  );

  useEffect(() => {
    if (!playing) {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    lastFrame.current = performance.now();
    const step = (now: number) => {
      const delta = now - lastFrame.current;
      lastFrame.current = now;
      setCursor((current) => {
        const next = current + delta * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, duration]);

  const visible = useMemo(
    () => events.filter((event) => event.offset <= cursor).slice(-40).reverse(),
    [events, cursor],
  );

  const rounds = useMemo(
    () => Array.from(new Set(events.map((event) => event.round))).sort((a, b) => a - b),
    [events],
  );

  if (!events.length) {
    return (
      <EmptyState
        title="Nothing to replay"
        description="This auction has no recorded bids."
        className={className}
      />
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={playing ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => {
            if (cursor >= duration) setCursor(0);
            setPlaying((value) => !value);
          }}
        >
          {playing ? 'Pause' : cursor >= duration ? 'Replay' : 'Play'}
        </Button>

        <div className="flex gap-1" role="group" aria-label="Playback speed">
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={speed === option}
              onClick={() => setSpeed(option)}
              className={cn(
                'no-tap-highlight rounded-md border px-2 py-1 text-[10px] font-bold transition-colors',
                speed === option
                  ? 'border-accent/50 bg-accent/15 text-white'
                  : 'border-white/10 bg-white/[0.03] text-[var(--text-low)] hover:text-white',
              )}
            >
              {option}×
            </button>
          ))}
        </div>

        <select
          onChange={(event) => {
            const round = Number(event.target.value);
            const target = events.find((entry) => entry.round === round);
            if (target) setCursor(target.offset);
          }}
          aria-label="Jump to round"
          className="rounded-md border border-white/12 bg-black/40 px-2 py-1 text-[11px] text-white"
          defaultValue=""
        >
          <option value="" disabled>
            Jump to round…
          </option>
          {rounds.map((round) => (
            <option key={round} value={round}>
              Round {round}
            </option>
          ))}
        </select>

        <span className="tabular ml-auto text-[11px] text-[var(--text-low)]">
          {clock(cursor)} / {clock(duration)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(1, duration)}
        value={cursor}
        onChange={(event) => setCursor(Number(event.target.value))}
        aria-label="Replay position"
        className="w-full accent-accent"
      />

      <ul className="scroll-thin max-h-96 space-y-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {visible.map((event) => (
            <motion.li
              key={event.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]',
                event.type === 'SOLD'
                  ? 'border-gold/25 bg-gold/[0.06] text-gold'
                  : event.type === 'REVEAL'
                    ? 'border-violet/25 bg-violet/[0.06] text-white'
                    : event.type === 'PASSED'
                      ? 'border-white/10 bg-white/[0.02] text-[var(--text-low)]'
                      : 'border-white/8 bg-white/[0.02] text-[var(--text-mid)]',
              )}
            >
              <span className="tabular w-12 shrink-0 text-[10px] text-[var(--text-low)]">
                {clock(event.offset)}
              </span>
              <span className="tabular w-8 shrink-0 text-[10px] text-[var(--text-low)]">
                R{event.round}
              </span>
              <span className="min-w-0 flex-1 truncate">{event.label}</span>
              {event.antiSnipe ? (
                <span className="shrink-0 rounded bg-gold/20 px-1 text-[9px] font-bold text-gold">
                  +TIME
                </span>
              ) : null}
              {event.amount !== undefined ? (
                <span className="tabular shrink-0 font-bold">{credits(event.amount)}</span>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
