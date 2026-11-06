'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { JudgeVerdict } from '@/game/judge';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { Button } from './ui/Button';
import { Badge } from './ui/Primitives';

/**
 * The Judge panel.
 *
 * The published power score still decides the official champion and is shown above this.
 * The Judge is a second opinion weighing depth, value and star power, and it is allowed
 * to disagree — the disagreement is the interesting part, so it is surfaced, not hidden.
 */
export function AIJudge({
  code,
  officialChampionId,
  className,
}: {
  code: string;
  officialChampionId: string | null;
  className?: string;
}) {
  const { cue, reduceMotion } = useSettings();
  const [verdict, setVerdict] = useState<JudgeVerdict | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);

  const summon = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/judge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as {
        verdict?: JudgeVerdict;
        fallbackReason?: string | null;
        error?: string;
      };
      if (!response.ok || !data.verdict) {
        setError(data.error ?? 'The Judge could not reach a verdict.');
        return;
      }
      setVerdict(data.verdict);
      setNote(data.fallbackReason ?? null);
      cue('victory');

      // Reveal the argument a line at a time so it reads like a ruling.
      if (reduceMotion) {
        setRevealed(data.verdict.reasoning.length);
      } else {
        setRevealed(0);
        data.verdict.reasoning.forEach((_, index) => {
          window.setTimeout(() => setRevealed(index + 1), 600 + index * 900);
        });
      }
    } catch {
      setError('Could not reach the Judge.');
    } finally {
      setLoading(false);
    }
  };

  const disagrees = Boolean(
    verdict?.winnerPlayerId && officialChampionId && verdict.winnerPlayerId !== officialChampionId,
  );

  return (
    <div className={cn('rounded-card border border-violet/25 bg-violet/[0.05] p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="display text-lg text-cream">The Judge</h3>
            {verdict ? (
              <Badge tone={verdict.source === 'claude' ? 'violet' : 'neutral'}>
                {verdict.source === 'claude' ? 'Claude' : 'Local'}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
            A second opinion on the same rosters, weighing what the power score leaves out:
            depth, value, star power and whether the team reads as a team. It is allowed to
            disagree — the championship above is still decided by the published formula.
          </p>
        </div>

        {!verdict ? (
          <Button variant="primary" loading={loading} disabled={loading} onClick={() => void summon()}>
            {loading ? 'Deliberating' : 'Call the Judge'}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setVerdict(null);
              setRevealed(0);
              setNote(null);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
          {error}
        </p>
      ) : null}

      <AnimatePresence>
        {verdict ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 space-y-4"
          >
            {/* verdict headline */}
            <div
              className={cn(
                'rounded-xl border px-4 py-4',
                disagrees
                  ? 'border-accent/35 bg-accent/[0.08]'
                  : 'border-gold/30 bg-gold/[0.07]',
              )}
            >
              <p className="eyebrow">{disagrees ? 'Dissenting verdict' : 'Verdict'}</p>
              <p className="display mt-1 text-2xl text-cream">{verdict.headline}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-subtle">
                  Confidence {Math.round(verdict.confidence * 100)}%
                </span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${verdict.confidence * 100}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={cn('block h-full', disagrees ? 'bg-accent' : 'bg-gold')}
                  />
                </span>
              </div>
              {verdict.dissent ? (
                <p className="mt-2.5 text-xs leading-relaxed text-accent">{verdict.dissent}</p>
              ) : null}
            </div>

            {/* the argument */}
            <ol className="space-y-2">
              <AnimatePresence initial={false}>
                {verdict.reasoning.slice(0, revealed).map((line, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3 rounded-lg border border-white/8 bg-panel px-3 py-2.5"
                  >
                    <span className="tabular shrink-0 text-xs font-bold text-violet">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-subtle">{line}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>

            {/* how it weighed things */}
            <div>
              <p className="eyebrow mb-2">What it weighed</p>
              <div className="space-y-1.5">
                {verdict.criteria.map((criterion) => (
                  <div key={criterion.id} className="rounded-lg border border-white/8 bg-panel px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-bold text-cream">{criterion.label}</span>
                      <span className="tabular text-[10px] text-muted">
                        {Math.round(criterion.weight * 100)}% weight
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {criterion.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* per-team notes */}
            <div>
              <p className="eyebrow mb-2">Team by team</p>
              <ul className="space-y-2">
                {verdict.teams.map((team) => (
                  <li key={team.playerId} className="rounded-lg border border-white/8 bg-panel px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 truncate">
                        <span className="tabular display w-4 text-sm text-muted">{team.rank}</span>
                        <span className="truncate text-sm font-bold text-cream">{team.teamName}</span>
                        {team.playerId === verdict.winnerPlayerId ? (
                          <Badge tone="gold">Judge&rsquo;s pick</Badge>
                        ) : null}
                      </span>
                      <span className="tabular shrink-0 text-xs text-violet">{team.score}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-mint">
                      + {team.strengths.join(', ')}
                    </p>
                    {team.weaknesses.length ? (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        − {team.weaknesses.join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            {note ? <p className="text-[11px] text-muted">{note}</p> : null}
            <p className="text-[11px] leading-relaxed text-muted">
              An opinion for entertainment, not the official result. The championship above is
              decided by the published formula, which you can audit in full.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
