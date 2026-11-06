'use client';

import { motion } from 'framer-motion';
import { characterRating } from '@/game/scoring';
import type { Character, Player, ScoringConfig } from '@/game/types';
import { characterImage } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { credits, RARITY_STYLE } from '@/lib/format';

function TeamSlot({
  character,
  price,
  scoring,
  index,
}: {
  character?: Character;
  price?: number;
  scoring?: ScoringConfig;
  index: number;
}) {
  if (!character) {
    return (
      <div
        className="flex aspect-[3/4] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02]"
        aria-label={`Empty roster slot ${index + 1}`}
      >
        <span className="tabular text-lg font-bold text-white/12">{index + 1}</span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-white/20">
          Empty
        </span>
      </div>
    );
  }

  const rarity = RARITY_STYLE[character.rarity];

  return (
    <motion.div
      layoutId={`character-${character.id}`}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn(
        'group relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-black ring-1',
        rarity.ring,
      )}
      title={`${character.name} — ${credits(price ?? 0)} credits`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={characterImage(character)}
        alt={character.name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-1.5 pb-1 pt-4">
        <p className="truncate text-[9px] font-bold uppercase leading-tight text-white">
          {character.name}
        </p>
        <div className="flex items-center justify-between">
          <span className="tabular text-[9px] font-bold text-gold">{credits(price ?? 0)}</span>
          <span className="tabular text-[9px] font-bold text-sky">
            {characterRating(character, scoring)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export function TeamRoster({
  player,
  characters,
  maxRoster,
  scoring,
  className,
  compact,
}: {
  player: Player;
  characters: Map<string, Character>;
  maxRoster: number;
  scoring?: ScoringConfig;
  className?: string;
  compact?: boolean;
}) {
  const slots = Array.from({ length: maxRoster }, (_, index) => player.roster[index]);
  const complete = player.roster.length >= maxRoster;

  return (
    <div className={className}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="display truncate text-sm text-white">{player.teamName}</p>
          {!compact ? (
            <p className="truncate text-[10px] uppercase tracking-[0.14em] text-[var(--text-low)]">
              {player.name}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            'tabular shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold',
            complete
              ? 'border-mint/40 bg-mint/12 text-mint'
              : 'border-white/12 bg-white/[0.05] text-[var(--text-mid)]',
          )}
        >
          {player.roster.length}/{maxRoster}
        </span>
      </div>

      <div className={cn('grid gap-1.5', maxRoster > 6 ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-4')}>
        {slots.map((purchase, index) => (
          <TeamSlot
            key={purchase?.characterId ?? `empty-${index}`}
            index={index}
            character={purchase ? characters.get(purchase.characterId) : undefined}
            price={purchase?.price}
            scoring={scoring}
          />
        ))}
      </div>

      {complete ? (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-mint"
        >
          Team complete
        </motion.p>
      ) : null}
    </div>
  );
}
