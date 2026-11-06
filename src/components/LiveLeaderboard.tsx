'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { RankedTeam } from '@/game/types';
import { cn } from '@/lib/cn';
import { credits } from '@/lib/format';
import { EmptyState } from './ui/Primitives';

const RANK_TONE = [
  'border-gold/50 bg-gold/[0.08]',
  'border-white/20 bg-white/[0.05]',
  'border-[#c98b2e]/40 bg-[#c98b2e]/[0.07]',
];

export function LiveLeaderboard({
  teams,
  youId,
  onInspect,
  className,
}: {
  teams: RankedTeam[];
  youId?: string | null;
  onInspect?: (playerId: string) => void;
  className?: string;
}) {
  if (!teams.length) {
    return (
      <EmptyState
        title="No rivals yet"
        description="Rankings appear as soon as the first character is sold."
        className={className}
      />
    );
  }

  return (
    <ol className={cn('space-y-1.5', className)}>
      <AnimatePresence initial={false}>
        {teams.map((team) => {
          const you = team.playerId === youId;
          return (
            <motion.li
              key={team.playerId}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            >
              <button
                type="button"
                onClick={() => onInspect?.(team.playerId)}
                disabled={!onInspect}
                className={cn(
                  'no-tap-highlight flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  RANK_TONE[team.rank - 1] ?? 'border-white/8 bg-white/[0.02]',
                  you && 'ring-1 ring-sky/50',
                  onInspect && 'hover:bg-white/[0.08]',
                )}
              >
                <span
                  className={cn(
                    'tabular display w-6 shrink-0 text-center text-lg',
                    team.rank === 1 ? 'text-gold' : 'text-[var(--text-mid)]',
                  )}
                >
                  {team.rank}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-bold text-white">
                      {team.player.teamName}
                    </span>
                    {you ? (
                      <span className="shrink-0 rounded bg-sky/20 px-1 text-[8px] font-bold uppercase tracking-[0.1em] text-sky">
                        You
                      </span>
                    ) : null}
                    {team.sharedRank ? (
                      <span className="shrink-0 rounded bg-white/10 px-1 text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--text-mid)]">
                        Tied
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--text-low)]">
                    <span className="tabular">{team.characters.length} chars</span>
                    <span aria-hidden>·</span>
                    <span className="tabular">{credits(team.player.budget)} left</span>
                    {team.synergyBonus > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="tabular text-mint">+{team.synergyBonus} syn</span>
                      </>
                    ) : null}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <motion.span
                    key={team.total}
                    initial={{ scale: 1.12, color: '#f5c451' }}
                    animate={{ scale: 1, color: '#ffffff' }}
                    className="tabular display block text-base leading-none"
                  >
                    {credits(team.total)}
                  </motion.span>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-low)]">
                    Power
                  </span>
                </span>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
