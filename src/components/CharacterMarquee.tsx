'use client';

import type { Character } from '@/game/types';
import { characterImage } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';

/**
 * Two rows of portraits drifting in opposite directions.
 *
 * Each row renders its characters twice and translates by exactly -50%, so the loop is
 * seamless. Under reduced motion the animation is dropped and the rows become ordinary
 * horizontally scrollable strips rather than disappearing.
 */
function Row({
  characters,
  direction,
  reduced,
}: {
  characters: Character[];
  direction: 'left' | 'right';
  reduced: boolean;
}) {
  if (!characters.length) return null;
  const doubled = [...characters, ...characters];

  return (
    <div
      className={cn('fade-x overflow-hidden', reduced && 'scroll-thin overflow-x-auto')}
      aria-hidden
    >
      <div
        className={cn(
          'flex w-max gap-3',
          !reduced && (direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right'),
        )}
      >
        {doubled.map((character, index) => (
          <div
            key={`${character.id}-${index}`}
            className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-white/8 sm:h-36 sm:w-24"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={characterImage(character)}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CharacterMarquee({
  characters,
  className,
}: {
  characters: Character[];
  className?: string;
}) {
  const { reduceMotion } = useSettings();
  if (characters.length < 4) return null;

  const half = Math.ceil(characters.length / 2);
  const top = characters.slice(0, half);
  const bottom = characters.slice(half);

  return (
    <div className={cn('space-y-3', className)}>
      <Row characters={top} direction="left" reduced={reduceMotion} />
      <Row characters={bottom} direction="right" reduced={reduceMotion} />
    </div>
  );
}
