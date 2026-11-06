'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { characterRating } from '@/game/scoring';
import type { Character, ScoringConfig } from '@/game/types';
import { characterImage } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { credits, RARITY_STYLE, ROLE_NAME, UNIVERSE_NAME } from '@/lib/format';
import { Badge } from './ui/Primitives';

export interface CharacterCardProps {
  character: Character;
  scoring?: ScoringConfig;
  size?: 'sm' | 'md' | 'lg';
  price?: number;
  priceLabel?: string;
  owner?: string;
  selected?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * The premium trading-card treatment used everywhere a character appears.
 * Rarity drives the border, glow and label so legendary pulls read differently at a glance.
 */
export const CharacterCard = memo(function CharacterCard({
  character,
  scoring,
  size = 'md',
  price,
  priceLabel = 'Paid',
  owner,
  selected,
  interactive,
  onClick,
  className,
}: CharacterCardProps) {
  const rating = characterRating(character, scoring);
  const rarity = RARITY_STYLE[character.rarity];
  const image = characterImage(character);

  const sizes = {
    sm: 'w-full',
    md: 'w-full',
    lg: 'w-full',
  } as const;

  const Wrapper = interactive || onClick ? motion.button : motion.div;

  return (
    <Wrapper
      type={interactive || onClick ? 'button' : undefined}
      onClick={onClick}
      whileHover={interactive ? { y: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-panel text-left ring-1',
        'border-white/8 transition-shadow duration-300',
        rarity.ring,
        rarity.glow,
        selected && 'ring-2 ring-accent',
        (interactive || onClick) && 'no-tap-highlight cursor-pointer',
        sizes[size],
        className,
      )}
      aria-label={`${character.name}, power ${rating}, ${rarity.label}`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <Badge tone={character.rarity === 'MYTHIC' ? 'crimson' : character.rarity === 'LEGENDARY' ? 'gold' : 'neutral'}>
            {rarity.label}
          </Badge>
        </div>

        <div className="absolute right-2 top-2 rounded-lg border border-white/15 bg-black/70 px-2 py-1 text-center backdrop-blur-sm">
          <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--text-low)]">
            Power
          </div>
          <div className="tabular display text-lg leading-none text-white">{rating}</div>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="display truncate text-base leading-tight text-white">{character.name}</p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-[var(--text-low)]">
            {character.alias || UNIVERSE_NAME[character.universe]}
          </p>
        </div>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {character.roles.slice(0, 3).map((role) => (
            <span
              key={role}
              className="rounded border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-mid)]"
            >
              {ROLE_NAME[role]}
            </span>
          ))}
        </div>

        {price !== undefined ? (
          <div className="flex items-baseline justify-between border-t border-white/8 pt-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-low)]">
              {priceLabel}
            </span>
            <span className="tabular text-sm font-bold text-gold">{credits(price)}</span>
          </div>
        ) : (
          <div className="flex items-baseline justify-between border-t border-white/8 pt-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-low)]">
              Base
            </span>
            <span className="tabular text-sm font-bold text-[var(--text-mid)]">
              {credits(character.basePrice)}
            </span>
          </div>
        )}

        {owner ? (
          <p className="truncate text-[10px] uppercase tracking-[0.12em] text-sky">{owner}</p>
        ) : null}
      </div>
    </Wrapper>
  );
});
