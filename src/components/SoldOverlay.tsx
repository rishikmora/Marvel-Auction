'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Character, Player } from '@/game/types';
import { characterImage } from '@/lib/character-art';
import { credits } from '@/lib/format';
import { useSettings } from '@/lib/settings';

export interface SaleSummary {
  character: Character;
  winner: Player;
  price: number;
  /** Budget before the deduction, so the overlay can show the swing. */
  previousBudget: number;
}

/** Celebrates a completed sale, then hands the card off to the winner's roster. */
export function SoldOverlay({ sale, onDone }: { sale: SaleSummary | null; onDone: () => void }) {
  const { cue, reduceMotion } = useSettings();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!sale) return;
    setVisible(true);
    cue('sold');
    const timer = window.setTimeout(
      () => {
        setVisible(false);
        onDone();
      },
      reduceMotion ? 1600 : 2900,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.character.id, sale?.price]);

  return (
    <AnimatePresence>
      {sale && visible ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/94 px-6"
          role="status"
          aria-live="polite"
        >
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(700px 500px at 50% 45%, ${sale.character.palette[0]}33, transparent 65%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />

          <div className="relative z-10 w-full max-w-md text-center">
            <motion.p
              initial={{ scale: reduceMotion ? 1 : 2.2, opacity: 0, rotate: reduceMotion ? 0 : -6 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              className="display text-6xl text-accent sm:text-7xl"
            >
              SOLD!
            </motion.p>

            <motion.div
              layoutId={`character-${sale.character.id}`}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mx-auto mt-6 h-44 w-32 overflow-hidden rounded-xl border border-white/15 shadow-panel"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={characterImage(sale.character)}
                alt=""
                aria-hidden
                className="h-full w-full object-cover"
              />
            </motion.div>

            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="display mt-4 text-3xl text-white"
            >
              {sale.character.name}
            </motion.h3>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-1 text-sm uppercase tracking-[0.22em] text-sky"
            >
              {sale.winner.teamName}
            </motion.p>

            <motion.p
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 240 }}
              className="tabular display mt-4 text-4xl text-gold"
            >
              {credits(sale.price)} credits
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mx-auto mt-6 grid max-w-xs grid-cols-3 items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-center"
            >
              <div>
                <p className="eyebrow">Before</p>
                <p className="tabular text-sm font-bold text-[var(--text-mid)]">
                  {credits(sale.previousBudget)}
                </p>
              </div>
              <div>
                <p className="eyebrow">Spent</p>
                <p className="tabular text-sm font-bold text-accent-soft">-{credits(sale.price)}</p>
              </div>
              <div>
                <p className="eyebrow">After</p>
                <p className="tabular text-sm font-bold text-mint">
                  {credits(sale.previousBudget - sale.price)}
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
