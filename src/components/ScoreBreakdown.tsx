'use client';

import { motion } from 'framer-motion';
import type { Character, RankedTeam, ScoringConfig, TeamScore } from '@/game/types';
import { STAT_LABELS } from '@/game/types';
import { cn } from '@/lib/cn';
import { credits, ROLE_NAME } from '@/lib/format';
import { Meter } from './ui/Primitives';

function Line({
  label,
  value,
  cap,
  tone,
  detail,
}: {
  label: string;
  value: number;
  cap?: number;
  tone: 'white' | 'toxic' | 'plasma' | 'gold' | 'crimson';
  detail?: string;
}) {
  const tones = {
    white: 'text-white',
    toxic: 'text-mint',
    plasma: 'text-sky',
    gold: 'text-gold',
    crimson: 'text-accent-soft',
  } as const;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/6 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white">{label}</p>
        {detail ? <p className="mt-0.5 text-[10px] text-[var(--text-low)]">{detail}</p> : null}
        {cap !== undefined && cap > 0 ? (
          <p className="mt-0.5 text-[10px] text-[var(--text-low)]">
            Capped at {credits(cap)} ({Math.round((value / cap) * 100)}% used)
          </p>
        ) : null}
      </div>
      <span className={cn('tabular shrink-0 text-sm font-bold', tones[tone])}>
        {value >= 0 && tone !== 'crimson' ? '+' : ''}
        {tone === 'crimson' ? '-' : ''}
        {credits(Math.abs(value))}
      </span>
    </div>
  );
}

/**
 * "How was my score calculated?"
 *
 * The formula is never hidden: every term, every cap and every penalty is shown with the
 * exact numbers that produced the final figure.
 */
export function ScoreBreakdown({
  score,
  characters,
  scoring,
  teamName,
  className,
}: {
  score: TeamScore | RankedTeam;
  characters: Map<string, Character>;
  scoring: ScoringConfig;
  teamName: string;
  className?: string;
}) {
  const weights = scoring.weights;

  return (
    <div className={cn('space-y-5', className)}>
      <div>
        <p className="eyebrow">Total power — {teamName}</p>
        <p className="tabular display text-4xl text-white">{credits(score.total)}</p>
      </div>

      <div>
        <h4 className="eyebrow mb-1">The formula</h4>
        <p className="rounded-lg border border-white/8 bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-[var(--text-mid)]">
          Character Power + Synergy + Team Balance + Leadership − Penalties. Each bonus is capped
          as a share of raw character power, so no combination of bonuses can outweigh the
          characters you actually bought.
        </p>
      </div>

      <div className="rounded-lg border border-white/8 bg-black/30 px-3">
        <Line
          label="Character strength"
          value={score.characterPower}
          tone="white"
          detail={`${score.characters.length} characters · ${credits(score.averagePower)} average`}
        />
        <Line
          label="Synergy bonus"
          value={score.synergyBonus}
          cap={score.caps.synergy}
          tone="toxic"
          detail={score.synergies.length ? `${score.synergies.length} rules matched` : 'No synergies matched'}
        />
        <Line
          label="Team balance"
          value={score.balanceBonus}
          cap={score.caps.balance}
          tone="plasma"
          detail={`${Math.round(score.balance.coverageRatio * 100)}% role coverage${
            score.balance.concentrationPenalty > 0
              ? ` · −${Math.round(score.balance.concentrationPenalty * 100)}% for stacking roles`
              : ''
          }`}
        />
        <Line
          label="Leadership"
          value={score.leadershipBonus}
          cap={score.caps.leadership}
          tone="gold"
          detail={
            score.leadership.topLeader
              ? `Led by ${characters.get(score.leadership.topLeader)?.name ?? 'unknown'} · avg ${score.leadership.averageLeadership}`
              : undefined
          }
        />
        {score.penalty > 0 ? (
          <Line
            label="Penalties"
            value={score.penalty}
            tone="crimson"
            detail={score.penalties.map((entry) => entry.reason).join(' · ')}
          />
        ) : null}
        <div className="flex items-center justify-between border-t border-white/12 py-2.5">
          <span className="display text-sm text-white">Final score</span>
          <span className="tabular display text-xl text-gold">{credits(score.total)}</span>
        </div>
      </div>

      {/* --- synergies --- */}
      {score.synergies.length ? (
        <div>
          <h4 className="eyebrow mb-2">Synergies matched</h4>
          <ul className="space-y-1.5">
            {score.synergies.map((hit) => (
              <li
                key={hit.ruleId}
                className="rounded-lg border border-mint/20 bg-mint/[0.05] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-mint">{hit.name}</span>
                  <span className="tabular text-xs font-bold text-mint">+{hit.points}</span>
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-low)]">
                  {hit.description}
                </p>
                <p className="mt-1 text-[10px] text-[var(--text-mid)]">
                  {hit.members
                    .map((memberId) => characters.get(memberId)?.name ?? memberId)
                    .join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* --- balance pillars --- */}
      <div>
        <h4 className="eyebrow mb-2">Role coverage</h4>
        <div className="grid grid-cols-2 gap-1.5">
          {score.balance.pillars.map((pillar) => (
            <div
              key={pillar.id}
              className={cn(
                'rounded-lg border px-2.5 py-1.5',
                pillar.covered
                  ? 'border-sky/25 bg-sky/[0.06]'
                  : 'border-white/8 bg-white/[0.02]',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-[0.1em]',
                    pillar.covered ? 'text-sky' : 'text-[var(--text-low)]',
                  )}
                >
                  {pillar.label}
                </span>
                <span className="tabular text-[10px] text-[var(--text-low)]">
                  {pillar.memberIds.length}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[9px] text-[var(--text-low)]">
                {pillar.roles.map((role) => ROLE_NAME[role]).join(' / ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* --- per character --- */}
      <div>
        <h4 className="eyebrow mb-2">Character scores</h4>
        <ul className="space-y-1">
          {[...score.characters]
            .sort((a, b) => b.power - a.power)
            .map((entry) => {
              const character = characters.get(entry.characterId);
              const max = score.characters[0]?.power ?? 1;
              return (
                <li key={entry.characterId} className="rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-white">
                      {character?.name ?? entry.characterId}
                    </span>
                    <span className="tabular text-xs font-bold text-gold">{credits(entry.power)}</span>
                  </div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1">
                    <Meter value={entry.power} max={Math.max(max, entry.power)} tone="gold" />
                  </motion.div>
                </li>
              );
            })}
        </ul>
      </div>

      {/* --- weights --- */}
      <div>
        <h4 className="eyebrow mb-2">Weights in force</h4>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(weights).map(([key, weight]) => (
            <span
              key={key}
              className="rounded border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] text-[var(--text-mid)]"
            >
              {STAT_LABELS[key as keyof typeof STAT_LABELS]}{' '}
              <span className="tabular font-bold text-white">{Math.round(weight * 100)}%</span>
            </span>
          ))}
        </div>
      </div>

      {'tieBreak' in score && score.tieBreak ? (
        <p className="rounded-lg border border-gold/25 bg-gold/[0.07] px-3 py-2 text-[11px] text-gold">
          Tie separated by: {score.tieBreak}.
        </p>
      ) : null}
    </div>
  );
}
