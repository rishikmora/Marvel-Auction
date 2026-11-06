'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { computeAnalytics } from '@/game/analytics';
import type { Character, GameState, RankedTeam } from '@/game/types';
import type { PublicGameState } from '@/lib/protocol';
import { characterImage } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { credits, ordinal } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { BattleSimulation } from './BattleSimulation';
import { ScoreBreakdown } from './ScoreBreakdown';
import { Button } from './ui/Button';
import { Badge, Panel } from './ui/Primitives';

type Stage = 'intro' | 'runners' | 'champion' | 'full';

/**
 * The closing act.
 *
 * Rankings are revealed from the bottom up before the champion lands, then the full
 * comparison, superlatives and per-team score breakdowns become available.
 */
export function FinalResults({
  state,
  rankings,
  characters,
  youId,
}: {
  state: PublicGameState;
  rankings: RankedTeam[];
  characters: Map<string, Character>;
  youId?: string | null;
}) {
  const { cue, reduceMotion } = useSettings();
  const [stage, setStage] = useState<Stage>(reduceMotion ? 'full' : 'intro');
  const [inspect, setInspect] = useState<string | null>(null);
  const [battleOpen, setBattleOpen] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const timers = [
      window.setTimeout(() => setStage('runners'), 1800),
      window.setTimeout(() => {
        setStage('champion');
        cue('victory');
      }, 4200),
      window.setTimeout(() => setStage('full'), 6600),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analytics = useMemo(
    () => computeAnalytics(state as unknown as GameState, characters, state.settings.scoring),
    [state, characters],
  );

  const champion = rankings[0];
  const runnersUp = rankings.slice(1, 3).reverse();
  const inspected = rankings.find((team) => team.playerId === inspect) ?? null;

  if (!champion) {
    return (
      <Panel className="p-8 text-center">
        <p className="display text-xl text-white">No teams to rank</p>
        <p className="mt-2 text-sm text-[var(--text-low)]">
          The auction ended before anyone bought a character.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {/* ------------------ cinematic sequence ------------------ */}
      <AnimatePresence mode="wait">
        {stage === 'intro' ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            className="flex min-h-[40vh] items-center justify-center"
          >
            <p className="display text-center text-4xl text-white sm:text-6xl">
              Auction
              <br />
              <span className="text-accent">complete</span>
            </p>
          </motion.div>
        ) : null}

        {stage === 'runners' ? (
          <motion.div
            key="runners"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-[40vh] flex-col items-center justify-center gap-4"
          >
            {runnersUp.map((team, index) => (
              <motion.div
                key={team.playerId}
                initial={{ x: index % 2 ? 60 : -60, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.8, type: 'spring', stiffness: 200, damping: 22 }}
                className="w-full max-w-md rounded-xl border border-white/12 bg-white/[0.04] px-5 py-4 text-center"
              >
                <p className="eyebrow">{ordinal(team.rank)} place</p>
                <p className="display mt-1 text-2xl text-white">{team.player.teamName}</p>
                <p className="tabular display mt-1 text-xl text-gold">{credits(team.total)}</p>
              </motion.div>
            ))}
          </motion.div>
        ) : null}

        {stage === 'champion' ? (
          <motion.div
            key="champion"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex min-h-[40vh] flex-col items-center justify-center overflow-hidden"
          >
            <motion.div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(700px 420px at 50% 45%, rgba(242,193,78,.22), transparent 65%)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />
            <p className="eyebrow relative">Champion</p>
            <motion.p
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              className="display relative mt-2 text-center text-5xl text-gold sm:text-7xl"
            >
              🏆 {champion.player.teamName}
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="tabular display relative mt-3 text-3xl text-white"
            >
              {credits(champion.total)}
            </motion.p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {stage === 'full' ? (
        <div className="space-y-6">
          {/* ------------------ champion banner ------------------ */}
          <Panel glow className="relative overflow-hidden p-5 sm:p-6">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  'radial-gradient(600px 300px at 20% 0%, rgba(242,193,78,.18), transparent 60%)',
              }}
            />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <Badge tone="gold">Champion</Badge>
                <h2 className="display mt-2 text-3xl text-white sm:text-4xl">
                  {champion.player.teamName}
                </h2>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-mid)]">
                  {champion.player.name}
                  {champion.sharedRank ? ' · shared victory' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="eyebrow">Final power</p>
                <p className="tabular display text-4xl text-gold sm:text-5xl">
                  {credits(champion.total)}
                </p>
              </div>
            </div>

            <div className="relative mt-4 flex flex-wrap gap-1.5">
              {champion.characters.map((entry) => {
                const character = characters.get(entry.characterId);
                if (!character) return null;
                return (
                  <div
                    key={entry.characterId}
                    className="h-16 w-12 overflow-hidden rounded-md border border-white/12"
                    title={character.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={characterImage(character)} alt={character.name} className="h-full w-full object-cover" />
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* ------------------ comparison ------------------ */}
          <Panel className="p-4 sm:p-5">
            <h3 className="display mb-4 text-lg text-white">Team power comparison</h3>
            <ul className="space-y-2.5">
              {rankings.map((team) => {
                const pct = champion.total > 0 ? (team.total / champion.total) * 100 : 0;
                return (
                  <li key={team.playerId}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 truncate">
                        <span className="tabular display w-5 text-sm text-[var(--text-low)]">
                          {team.rank}
                        </span>
                        <span
                          className={cn(
                            'truncate text-sm font-bold',
                            team.playerId === youId ? 'text-sky' : 'text-white',
                          )}
                        >
                          {team.player.teamName}
                        </span>
                        {team.tieBreak ? <Badge>{team.tieBreak}</Badge> : null}
                      </span>
                      <span className="tabular shrink-0 text-sm font-bold text-gold">
                        {credits(team.total)}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.9, ease: 'easeOut', delay: team.rank * 0.08 }}
                        className={cn(
                          'h-full rounded-full',
                          team.rank === 1 ? 'bg-gold' : team.playerId === youId ? 'bg-sky' : 'bg-accent',
                        )}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-low)]">
                      <span className="tabular">Chars {credits(team.characterPower)}</span>
                      <span className="tabular text-mint">Syn +{team.synergyBonus}</span>
                      <span className="tabular text-sky">Bal +{team.balanceBonus}</span>
                      <span className="tabular text-gold">Lead +{team.leadershipBonus}</span>
                      {team.penalty > 0 ? (
                        <span className="tabular text-accent-soft">Pen −{team.penalty}</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setInspect(team.playerId)}
                        className="font-bold uppercase tracking-[0.1em] text-sky hover:underline"
                      >
                        How was this calculated?
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* ------------------ superlatives ------------------ */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Superlative
              label="Strongest character"
              value={analytics.strongestCharacter?.characterName ?? '—'}
              detail={
                analytics.strongestCharacter
                  ? `${credits(analytics.strongestCharacter.power)} power · ${analytics.strongestCharacter.teamName}`
                  : undefined
              }
              tone="crimson"
            />
            <Superlative
              label="Best value purchase"
              value={analytics.bestValue?.characterName ?? '—'}
              detail={
                analytics.bestValue
                  ? `${analytics.bestValue.valueScore} power per credit · ${credits(analytics.bestValue.price)}`
                  : undefined
              }
              tone="toxic"
            />
            <Superlative
              label="Most expensive"
              value={analytics.mostExpensive?.characterName ?? '—'}
              detail={
                analytics.mostExpensive
                  ? `${credits(analytics.mostExpensive.price)} credits · ${analytics.mostExpensive.teamName}`
                  : undefined
              }
              tone="gold"
            />
            <Superlative
              label="Best balanced team"
              value={
                [...rankings].sort((a, b) => b.balanceBonus - a.balanceBonus)[0]?.player.teamName ??
                '—'
              }
              detail={`+${[...rankings].sort((a, b) => b.balanceBonus - a.balanceBonus)[0]?.balanceBonus ?? 0} balance`}
              tone="plasma"
            />
            <Superlative
              label="Highest spending team"
              value={analytics.highestSpendingTeam?.teamName ?? '—'}
              detail={
                analytics.highestSpendingTeam
                  ? `${credits(analytics.highestSpendingTeam.spent)} credits committed`
                  : undefined
              }
              tone="gold"
            />
            <Superlative
              label="Biggest auction surprise"
              value={analytics.biggestSurprise?.characterName ?? '—'}
              detail={
                analytics.biggestSurprise
                  ? `${analytics.biggestSurprise.overpay >= 0 ? '+' : ''}${analytics.biggestSurprise.overpay} vs base · ${analytics.biggestSurprise.bidCount} bids`
                  : undefined
              }
              tone="vibranium"
            />
          </div>

          {/* ------------------ battle sim ------------------ */}
          <Panel className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="display text-lg text-white">Simulate the final battle</h3>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-low)]">
                  An exhibition match between the top two rosters using stats, synergy, role
                  coverage and counter matchups. Entertainment only — it has no bearing on the
                  auction result above.
                </p>
              </div>
              <Button
                variant="gold"
                disabled={rankings.length < 2}
                onClick={() => setBattleOpen((open) => !open)}
              >
                {battleOpen ? 'Hide battle' : 'Run simulation'}
              </Button>
            </div>
            {battleOpen && rankings.length >= 2 ? (
              <BattleSimulation
                a={rankings[0]}
                b={rankings[1]}
                characters={characters}
                scoring={state.settings.scoring}
                seed={state.id}
                className="mt-5"
              />
            ) : null}
          </Panel>
        </div>
      ) : null}

      {/* ------------------ breakdown drawer ------------------ */}
      <AnimatePresence>
        {inspected ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
            onClick={() => setInspect(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
              className="scroll-thin max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/12 bg-panel p-5 sm:rounded-2xl"
              role="dialog"
              aria-label="Score breakdown"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="display text-lg text-white">Score breakdown</h3>
                <Button size="sm" variant="ghost" onClick={() => setInspect(null)}>
                  Close
                </Button>
              </div>
              <ScoreBreakdown
                score={inspected}
                characters={characters}
                scoring={state.settings.scoring}
                teamName={inspected.player.teamName}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Superlative({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: 'crimson' | 'gold' | 'plasma' | 'toxic' | 'vibranium';
}) {
  const tones = {
    crimson: 'text-accent-soft border-accent/25 bg-accent/[0.06]',
    gold: 'text-gold border-gold/25 bg-gold/[0.06]',
    plasma: 'text-sky border-sky/25 bg-sky/[0.06]',
    toxic: 'text-mint border-mint/25 bg-mint/[0.06]',
    vibranium: 'text-violet border-violet/25 bg-violet/[0.06]',
  } as const;

  return (
    <div className={cn('rounded-xl border px-4 py-3', tones[tone])}>
      <p className="eyebrow">{label}</p>
      <p className="display mt-1 truncate text-lg text-white">{value}</p>
      {detail ? <p className="mt-0.5 truncate text-[11px] opacity-80">{detail}</p> : null}
    </div>
  );
}
