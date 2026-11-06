'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Pulse, PulseType } from '@/lib/protocol';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';

const STYLE: Partial<Record<PulseType, { border: string; text: string; icon: string }>> = {
  OUTBID: { border: 'border-accent/50 bg-accent/12', text: 'text-accent-soft', icon: '!' },
  SOLD: { border: 'border-gold/40 bg-gold/10', text: 'text-gold', icon: '✓' },
  ANTI_SNIPE: { border: 'border-gold/40 bg-gold/10', text: 'text-gold', icon: '⏱' },
  ROSTER_FULL: { border: 'border-mint/40 bg-mint/10', text: 'text-mint', icon: '★' },
  FIRST_PLACE: { border: 'border-sky/40 bg-sky/10', text: 'text-sky', icon: '#1' },
  GAME_OVER: { border: 'border-white/20 bg-white/[0.06]', text: 'text-white', icon: '⏹' },
  LOW_BUDGET: { border: 'border-accent/40 bg-accent/10', text: 'text-accent-soft', icon: '$' },
};

/** Only the pulses worth interrupting someone for are surfaced as toasts. */
const SURFACED: PulseType[] = ['OUTBID', 'ANTI_SNIPE', 'ROSTER_FULL', 'FIRST_PLACE', 'LOW_BUDGET'];

export function NotificationStack({
  pulses,
  onDismiss,
}: {
  pulses: Pulse[];
  onDismiss: (id: string) => void;
}) {
  const { cue } = useSettings();
  const visible = pulses.filter((pulse) => SURFACED.includes(pulse.type)).slice(0, 3);

  useEffect(() => {
    const top = visible[0];
    if (!top) return;
    if (top.type === 'OUTBID') cue('outbid');
    const timer = window.setTimeout(() => onDismiss(top.id), 4200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible[0]?.id]);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {visible.map((pulse) => {
          const style = STYLE[pulse.type] ?? {
            border: 'border-white/15 bg-white/[0.06]',
            text: 'text-white',
            icon: '•',
          };
          return (
            <motion.button
              key={pulse.id}
              type="button"
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              onClick={() => onDismiss(pulse.id)}
              className={cn(
                'pointer-events-auto flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left backdrop-blur-md',
                style.border,
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-black/40 text-[11px] font-bold',
                  style.text,
                )}
                aria-hidden
              >
                {style.icon}
              </span>
              <span className={cn('min-w-0 flex-1 text-[11px] font-semibold leading-snug', style.text)}>
                {pulse.message}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
