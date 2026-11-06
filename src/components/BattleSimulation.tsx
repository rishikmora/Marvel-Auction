'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { simulateBattle } from '@/game/battle';
import type { Character, RankedTeam, ScoringConfig } from '@/game/types';
import { cn } from '@/lib/cn';
import { credits } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { Button } from './ui/Button';

/**
 * Exhibition battle between two finished rosters.
 *
 * Deterministic: the same rosters and game id always produce the same fight, so two
 * players watching separately see identical rounds.
 */
export function BattleSimulation({
  a,
  b,
  characters,
  scoring,
  seed,
  className,
}: {
  a: RankedTeam;
  b: RankedTeam;
  characters: Map<string, Character>;
  scoring: ScoringConfig;
  seed: string;
  className?: string;
}) {
  const { reduceMotion, cue } = useSettings();
  const [revealed, setRevealed] = useState(reduceMotion ? 99 : 0);

  const result = useMemo(() => {
    const roster = (team: RankedTeam) =>
      team.characters
        .map((entry) => characters.get(entry.characterId))
        .filter((character): character is Character => Boolean(character));

    return simulateBattle(
      { playerId: a.playerId, teamName: a.player.teamName, characters: roster(a) },
      { playerId: b.playerId, teamName: b.player.teamName, characters: roster(b) },
      scoring,
      seed,
    );
  }, [a, b, characters, scoring, seed]);

  useEffect(() => {
    if (reduceMotion) {
      setRevealed(99);
      return;
    }
    setRevealed(0);
    const timers = result.rounds.map((_, index) =>
      window.setTimeout(() => setRevealed(index + 1), (index + 1) * 1400),
    );
    const final = window.setTimeout(
      () => {
        setRevealed(99);
        cue('victory');
      },
      (result.rounds.length + 1) * 1400,
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(final);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.seed, reduceMotion]);

  const winnerName =
    result.winnerPlayerId === a.playerId
      ? a.player.teamName
      : result.winnerPlayerId === b.playerId
        ? b.player.teamName
        : null;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
        <div className="min-w-0 text-right">
          <p className="display truncate text-sm text-white sm:text-base">{a.player.teamName}</p>
          <p className="tabular text-xs text-sky">{result.aRoundsWon} rounds</p>
        </div>
        <span className="display text-xs text-[var(--text-low)]">VS</span>
        <div className="min-w-0">
          <p className="display truncate text-sm text-white sm:text-base">{b.player.teamName}</p>
          <p className="tabular text-xs text-accent-soft">{result.bRoundsWon} rounds</p>
        </div>
      </div>

      {result.counters.length ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="eyebrow mb-2">Matchup read</p>
          <ul className="space-y-1">
            {result.counters.map((counter, index) => (
              <li key={index} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded px-1 text-[9px] font-bold uppercase',
                    counter.favours === 'A'
                      ? 'bg-sky/20 text-sky'
                      : 'bg-accent/20 text-accent-soft',
                  )}
                >
                  {counter.favours === 'A' ? a.player.teamName.slice(0, 10) : b.player.teamName.slice(0, 10)}
                </span>
                <span className="text-[var(--text-mid)]">{counter.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol className="space-y-2">
        <AnimatePresence initial={false}>
          {result.rounds.slice(0, revealed).map((round) => (
            <motion.li
              key={round.index}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className={cn(
                'rounded-xl border px-4 py-3',
                round.winner === 'A'
                  ? 'border-sky/30 bg-sky/[0.05]'
                  : round.winner === 'B'
                    ? 'border-accent/30 bg-accent/[0.05]'
                    : 'border-white/10 bg-white/[0.02]',
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="display text-sm text-white">{round.title}</p>
                <p className="tabular text-xs text-[var(--text-low)]">
                  <span className="text-sky">{round.aScore}</span>
                  {' — '}
                  <span className="text-accent-soft">{round.bScore}</span>
                </p>
              </div>
              <p className="mt-1 text-[11px] italic text-[var(--text-low)]">{round.focus}</p>
              <ul className="mt-2 space-y-1">
                {round.narrative.map((line, index) => (
                  <li key={index} className="text-xs leading-relaxed text-[var(--text-mid)]">
                    {line}
                  </li>
                ))}
              </ul>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      <AnimatePresence>
        {revealed > result.rounds.length ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-gold/35 bg-gold/[0.08] px-5 py-5 text-center"
          >
            <p className="eyebrow">Result</p>
            <p className="display mt-1 text-2xl text-gold sm:text-3xl">
              {winnerName ? `${winnerName} wins` : 'Stalemate'}
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--text-mid)]">
              {result.summary}
            </p>
            <p className="tabular mt-3 text-[11px] text-[var(--text-low)]">
              Cumulative: {credits(result.aTotal)} vs {credits(result.bTotal)}
            </p>
            {reduceMotion ? null : (
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => setRevealed(0)}>
                Replay the fight
              </Button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p className="text-center text-[10px] leading-relaxed text-[var(--text-low)]">
        A fan-made simulation for entertainment. It is not a claim about official canon.
      </p>
    </div>
  );
}
