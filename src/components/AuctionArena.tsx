'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { characterRating } from '@/game/scoring';
import type { Character, Player } from '@/game/types';
import type { PublicGameState, ViewerState } from '@/lib/protocol';
import { characterImage } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { credits, RARITY_STYLE, ROLE_NAME, UNIVERSE_NAME } from '@/lib/format';
import { AuctionTimer } from './AuctionTimer';
import { BidPanel } from './BidPanel';
import { PassVote } from './PassVote';
import { StatBars } from './StatBars';
import { Badge, EmptyState } from './ui/Primitives';

export function AuctionArena({
  state,
  viewer,
  character,
  highestBidder,
  clockOffset,
  className,
}: {
  state: PublicGameState;
  viewer: ViewerState | null;
  character: Character | null;
  highestBidder: Player | null;
  clockOffset: number;
  className?: string;
}) {
  const auction = state.auction;
  const live = auction.state === 'BIDDING' && state.status === 'ACTIVE';

  if (!character) {
    return (
      <div className={cn('panel edge-glow flex min-h-[420px] items-center justify-center p-6', className)}>
        <EmptyState
          title={state.status === 'ACTIVE' ? 'Standing by' : 'The vault is sealed'}
          description={
            state.status === 'ACTIVE'
              ? 'The host is choosing the next character. Get your budget ready.'
              : 'This auction is not running right now.'
          }
          icon="◈"
          className="border-0"
        />
      </div>
    );
  }

  const rating = characterRating(character, state.settings.scoring);
  const rarity = RARITY_STYLE[character.rarity];

  return (
    <section
      className={cn('panel edge-glow relative overflow-hidden', className)}
      aria-label="Auction arena"
    >
      {/* Ambient wash tinted by the character's own palette */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(700px 380px at 30% 0%, ${character.palette[0]}33, transparent 65%),
                       radial-gradient(600px 340px at 90% 20%, ${character.palette[1]}22, transparent 70%)`,
        }}
      />
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-25" />

      <div className="relative grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ---------------- portrait ---------------- */}
        <div className="space-y-3">
          <motion.div
            key={character.id}
            layoutId={`character-${character.id}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className={cn(
              'relative mx-auto aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-xl border border-white/12 bg-black ring-1 lg:max-w-none',
              rarity.ring,
              rarity.glow,
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={characterImage(character)}
              alt={`${character.name} portrait`}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent p-3 pt-10">
              <div className="flex flex-wrap gap-1">
                {character.roles.slice(0, 4).map((role) => (
                  <span
                    key={role}
                    className="rounded border border-white/12 bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-mid)]"
                  >
                    {ROLE_NAME[role]}
                  </span>
                ))}
              </div>
            </div>
            <div className="absolute right-2 top-2">
              <Badge tone={character.rarity === 'MYTHIC' ? 'crimson' : character.rarity === 'LEGENDARY' ? 'gold' : 'neutral'}>
                {rarity.label}
              </Badge>
            </div>
          </motion.div>

          <div className="hidden lg:block">
            <StatBars stats={character.stats} />
          </div>
        </div>

        {/* ---------------- details + bidding ---------------- */}
        <div className="flex flex-col gap-4">
          <header>
            <p className="eyebrow">
              Lot {auction.round} · {UNIVERSE_NAME[character.universe]}
            </p>
            <h2 className="display mt-1 text-3xl leading-none text-white sm:text-4xl">
              {character.name}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--text-mid)]">
              {character.alias}
            </p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--text-low)]">
              {character.description}
            </p>
          </header>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
              <p className="eyebrow">Power</p>
              <p className="tabular display text-2xl text-white">{rating}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
              <p className="eyebrow">Base</p>
              <p className="tabular display text-2xl text-[var(--text-mid)]">
                {credits(character.basePrice)}
              </p>
            </div>
            <div
              className={cn(
                'rounded-lg border px-3 py-2',
                auction.currentBid > 0
                  ? 'border-gold/40 bg-gold/[0.08]'
                  : 'border-white/10 bg-black/40',
              )}
            >
              <p className="eyebrow">Current bid</p>
              <AnimatePresence mode="popLayout">
                <motion.p
                  key={auction.currentBid}
                  initial={{ y: 10, opacity: 0, scale: 1.08 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className="tabular display text-2xl text-gold"
                >
                  {auction.currentBid > 0 ? credits(auction.currentBid) : '—'}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5">
            <div className="min-w-0">
              <p className="eyebrow">Leading bidder</p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={highestBidder?.id ?? 'none'}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'display truncate text-lg',
                    highestBidder ? 'text-sky' : 'text-[var(--text-low)]',
                  )}
                >
                  {highestBidder ? highestBidder.teamName : 'No bids yet'}
                </motion.p>
              </AnimatePresence>
            </div>
            <AuctionTimer
              endsAt={auction.endsAt}
              clockOffset={clockOffset}
              totalSeconds={state.settings.auctionSeconds}
              paused={auction.state === 'PAUSED'}
              awaitingHost={auction.awaitingHostSale}
              extensions={auction.extensions}
            />
          </div>

          {auction.state === 'SOLD' ? (
            <div className="rounded-lg border border-gold/30 bg-gold/[0.08] px-3 py-3 text-center">
              <p className="display text-lg text-gold">Sold</p>
              <p className="mt-0.5 text-xs text-[var(--text-mid)]">
                Waiting for the host to bring out the next character.
              </p>
            </div>
          ) : auction.state === 'PASSED' ? (
            <div className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-3 text-center">
              <p className="display text-lg text-[var(--text-mid)]">Passed</p>
              <p className="mt-0.5 text-xs text-[var(--text-low)]">
                {character.name} went unsold and leaves the board.
              </p>
            </div>
          ) : auction.state === 'CHARACTER_REVEALED' ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-sky/25 bg-sky/[0.06] px-3 py-3 text-center">
                <p className="display text-lg text-sky">Get ready</p>
                <p className="mt-0.5 text-xs text-[var(--text-mid)]">
                  The host opens the floor in a moment.
                </p>
              </div>
              <PassVote viewer={viewer} />
            </div>
          ) : (
            <div className="space-y-3">
              <BidPanel viewer={viewer} live={live} />
              <PassVote viewer={viewer} />
            </div>
          )}

          <div className="lg:hidden">
            <StatBars stats={character.stats} compact />
          </div>
        </div>
      </div>
    </section>
  );
}
