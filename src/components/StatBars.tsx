'use client';

import type { CharacterStats, StatKey } from '@/game/types';
import { STAT_KEYS, STAT_LABELS } from '@/game/types';
import { cn } from '@/lib/cn';

const TONE: Record<StatKey, string> = {
  strength: 'bg-accent',
  speed: 'bg-sky',
  durability: 'bg-gold',
  intelligence: 'bg-violet',
  combat: 'bg-accent',
  energy: 'bg-sky',
  versatility: 'bg-mint',
  leadership: 'bg-gold-soft',
  specialAbility: 'bg-violet',
};

export function StatBars({
  stats,
  className,
  compact,
}: {
  stats: CharacterStats;
  className?: string;
  compact?: boolean;
}) {
  const keys = compact
    ? (['strength', 'speed', 'durability', 'combat', 'energy'] as StatKey[])
    : STAT_KEYS;

  return (
    <dl className={cn('space-y-2', className)}>
      {keys.map((key) => (
        <div key={key} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
          <dt className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-low)] sm:w-24">
            {STAT_LABELS[key]}
          </dt>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
            role="meter"
            aria-valuenow={stats[key]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={STAT_LABELS[key]}
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-700', TONE[key])}
              style={{ width: `${Math.max(2, stats[key])}%` }}
            />
          </div>
          <dd className="tabular w-7 text-right text-[11px] font-bold text-white">{stats[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
