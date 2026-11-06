'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { FeedEvent, FeedKind } from '@/game/types';
import { cn } from '@/lib/cn';
import { timestamp } from '@/lib/format';
import { EmptyState } from './ui/Primitives';

const KIND_STYLE: Record<FeedKind, { dot: string; text: string }> = {
  JOIN: { dot: 'bg-sky', text: 'text-[var(--text-mid)]' },
  LEAVE: { dot: 'bg-white/30', text: 'text-[var(--text-low)]' },
  REVEAL: { dot: 'bg-violet', text: 'text-white' },
  BID: { dot: 'bg-accent', text: 'text-[var(--text-mid)]' },
  SOLD: { dot: 'bg-gold', text: 'text-cream' },
  PASSED: { dot: 'bg-white/25', text: 'text-[var(--text-low)]' },
  SYSTEM: { dot: 'bg-white/25', text: 'text-[var(--text-low)]' },
  ANTI_SNIPE: { dot: 'bg-gold', text: 'text-gold' },
  ROSTER_FULL: { dot: 'bg-mint', text: 'text-mint' },
  PASS_VOTE: { dot: 'bg-violet', text: 'text-subtle' },
};

export function AuctionFeed({
  feed,
  className,
  limit = 40,
}: {
  feed: FeedEvent[];
  className?: string;
  limit?: number;
}) {
  if (!feed.length) {
    return (
      <EmptyState
        title="The floor is quiet"
        description="Every bid, sale and pass will show up here in real time."
        className={className}
      />
    );
  }

  return (
    <ul className={cn('scroll-thin space-y-0.5 overflow-y-auto', className)} aria-live="polite">
      <AnimatePresence initial={false}>
        {feed.slice(0, limit).map((event) => {
          const style = KIND_STYLE[event.kind];
          return (
            <motion.li
              key={event.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-white/[0.03]"
            >
              <span
                className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', style.dot)}
                aria-hidden
              />
              <span className={cn('min-w-0 flex-1 text-[11px] leading-snug', style.text)}>
                {event.message}
              </span>
              <time
                className="tabular shrink-0 text-[9px] text-white/25"
                dateTime={new Date(event.at).toISOString()}
              >
                {timestamp(event.at)}
              </time>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
