'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { characterRating } from '@/game/scoring';
import type { Character, ScoringConfig } from '@/game/types';
import { characterImage } from '@/lib/character-art';
import { credits, UNIVERSE_NAME } from '@/lib/format';
import { useSettings } from '@/lib/settings';

type Stage = 'charge' | 'name' | 'power' | 'price' | 'open' | 'done';

const SEQUENCE: { stage: Stage; ms: number }[] = [
  { stage: 'charge', ms: 700 },
  { stage: 'name', ms: 1100 },
  { stage: 'power', ms: 900 },
  { stage: 'price', ms: 900 },
  { stage: 'open', ms: 800 },
];

/**
 * Full-screen cinematic reveal.
 *
 * Staged rather than a single transition so the moment lands: charge, name, power,
 * starting bid, floor open. With reduced motion enabled the same information appears
 * immediately as a static card instead of being animated.
 */
export function CharacterReveal({
  character,
  scoring,
  onComplete,
}: {
  character: Character | null;
  scoring?: ScoringConfig;
  onComplete?: () => void;
}) {
  const { reduceMotion, cue } = useSettings();
  const [stage, setStage] = useState<Stage>('charge');

  useEffect(() => {
    if (!character) return;
    cue('reveal');

    if (reduceMotion) {
      setStage('open');
      const timer = window.setTimeout(() => {
        setStage('done');
        onComplete?.();
      }, 1400);
      return () => window.clearTimeout(timer);
    }

    setStage('charge');
    const timers: number[] = [];
    let elapsed = 0;
    for (const step of SEQUENCE) {
      elapsed += step.ms;
      const next = SEQUENCE[SEQUENCE.indexOf(step) + 1];
      timers.push(
        window.setTimeout(() => {
          if (next) setStage(next.stage);
          else {
            setStage('done');
            onComplete?.();
          }
        }, elapsed),
      );
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id, reduceMotion]);

  if (!character || stage === 'done') return null;

  const rating = characterRating(character, scoring);

  return (
    <AnimatePresence>
      <motion.div
        key={character.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/96 px-6"
        role="dialog"
        aria-live="assertive"
        aria-label={`${character.name} enters the auction`}
      >
        {/* Energy field */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(600px 600px at 50% 45%, ${character.palette[0]}44, transparent 65%),
                         radial-gradient(900px 500px at 50% 50%, ${character.palette[1]}22, transparent 70%)`,
          }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-30" />

        {!reduceMotion ? (
          <>
            {[0, 1, 2].map((index) => (
              <motion.span
                key={index}
                className="pointer-events-none absolute rounded-full border"
                style={{ borderColor: `${character.palette[0]}66` }}
                initial={{ width: 40, height: 40, opacity: 0.9 }}
                animate={{ width: 900, height: 900, opacity: 0 }}
                transition={{ duration: 1.6, delay: index * 0.28, ease: 'easeOut', repeat: Infinity }}
              />
            ))}
          </>
        ) : null}

        <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
          <AnimatePresence mode="wait">
            {stage === 'charge' ? (
              <motion.p
                key="charge"
                initial={{ opacity: 0, letterSpacing: '0.6em' }}
                animate={{ opacity: 1, letterSpacing: '0.3em' }}
                exit={{ opacity: 0 }}
                className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--text-mid)]"
              >
                Next lot incoming
              </motion.p>
            ) : null}
          </AnimatePresence>

          {stage !== 'charge' ? (
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
              className="mb-5 h-40 w-32 overflow-hidden rounded-xl border border-white/15 shadow-panel sm:h-52 sm:w-40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={characterImage(character)} alt="" aria-hidden className="h-full w-full object-cover" />
            </motion.div>
          ) : null}

          {stage !== 'charge' ? (
            <motion.h2
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              className="display text-4xl text-white sm:text-6xl"
            >
              {character.name}
            </motion.h2>
          ) : null}

          {stage !== 'charge' ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="mt-2 text-xs uppercase tracking-[0.24em] text-[var(--text-mid)]"
            >
              {character.alias || UNIVERSE_NAME[character.universe]}
            </motion.p>
          ) : null}

          <div className="mt-7 grid w-full grid-cols-2 gap-3">
            <AnimatePresence>
              {['power', 'price', 'open'].includes(stage) ? (
                <motion.div
                  key="power"
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="rounded-xl border border-white/12 bg-black/50 px-4 py-3"
                >
                  <p className="eyebrow">Power</p>
                  <p className="tabular display text-3xl text-white">{rating}</p>
                </motion.div>
              ) : null}
              {['price', 'open'].includes(stage) ? (
                <motion.div
                  key="price"
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="rounded-xl border border-gold/30 bg-gold/[0.08] px-4 py-3"
                >
                  <p className="eyebrow">Starting bid</p>
                  <p className="tabular display text-3xl text-gold">{credits(character.basePrice)}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {stage === 'open' ? (
              <motion.p
                key="open"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="display mt-8 text-2xl text-accent-soft sm:text-3xl"
              >
                Auction open
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
