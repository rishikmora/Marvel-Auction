'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { Character, Player } from '@/game/types';
import { useCharacters } from '@/lib/character-cache';
import { cn } from '@/lib/cn';
import { credits } from '@/lib/format';
import { displayCode, normalizeCode } from '@/lib/room-code';
import { useGameSocket } from '@/hooks/useGameSocket';
import { AuctionArena } from '@/components/AuctionArena';
import { AuctionFeed } from '@/components/AuctionFeed';
import { AuctionHistory } from '@/components/AuctionHistory';
import { BudgetWidget } from '@/components/BudgetWidget';
import { CharacterReveal } from '@/components/CharacterReveal';
import { FinalResults } from '@/components/FinalResults';
import { GameLobby } from '@/components/GameLobby';
import { HostControls } from '@/components/HostControls';
import { LiveLeaderboard } from '@/components/LiveLeaderboard';
import { NotificationStack } from '@/components/NotificationStack';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { SiteHeader } from '@/components/SiteChrome';
import { SoldOverlay, type SaleSummary } from '@/components/SoldOverlay';
import { TeamRoster } from '@/components/TeamRoster';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Panel } from '@/components/ui/Primitives';

type MobileTab = 'arena' | 'team' | 'ranks' | 'feed';

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = normalizeCode(String(params?.code ?? ''));

  const { state, viewer, leaderboard, connection, clockOffset, error, pulses, consumePulse } =
    useGameSocket(code);
  const { characters, loading: charactersLoading } = useCharacters();

  const [mobileTab, setMobileTab] = useState<MobileTab>('arena');
  const [sale, setSale] = useState<SaleSummary | null>(null);
  const [revealed, setRevealed] = useState<Character | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const lastPurchaseId = useRef<string | null>(null);
  const lastRevealKey = useRef<string | null>(null);

  const me = useMemo(
    () => state?.players.find((player) => player.id === viewer?.playerId) ?? null,
    [state, viewer],
  );

  const currentCharacter = state?.auction.characterId
    ? (characters.get(state.auction.characterId) ?? null)
    : null;

  const highestBidder =
    state?.auction.highestBidderId
      ? (state.players.find((player) => player.id === state.auction.highestBidderId) ?? null)
      : null;

  /* --- cinematic reveal, fired once per lot --- */
  useEffect(() => {
    if (!state || state.auction.state !== 'CHARACTER_REVEALED' || !currentCharacter) return;
    const key = `${state.auction.round}:${currentCharacter.id}`;
    if (lastRevealKey.current === key) return;
    lastRevealKey.current = key;
    setRevealed(currentCharacter);
  }, [state, currentCharacter]);

  /* --- sold celebration, fired once per completed sale --- */
  useEffect(() => {
    if (!state) return;
    const latest = state.purchases[state.purchases.length - 1];
    if (!latest || latest.passed || !latest.playerId) return;
    if (lastPurchaseId.current === latest.id) return;
    lastPurchaseId.current = latest.id;

    const winner = state.players.find((player) => player.id === latest.playerId);
    const character = characters.get(latest.characterId);
    if (!winner || !character) return;
    setSale({
      character,
      winner,
      price: latest.price,
      previousBudget: winner.budget + latest.price,
    });
  }, [state, characters]);

  /* --- connection banner --- */
  useEffect(() => {
    if (connection === 'RECONNECTING') setBanner('Reconnecting to the auction…');
    else if (connection === 'OFFLINE') setBanner('Connection lost. Retrying…');
    else setBanner(null);
  }, [connection]);

  if (connection === 'REJECTED') {
    return (
      <div className="min-h-dvh">
        <SiteHeader />
        <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
          <p className="display text-2xl text-white">Cannot join this auction</p>
          <p className="mt-3 text-sm text-[var(--text-mid)]">
            {error ?? 'Your seat is no longer valid.'}
          </p>
          <div className="mt-6 flex gap-2">
            <Button variant="primary" onClick={() => router.push(`/join?code=${code}`)}>
              Join with the code
            </Button>
            <Link href="/">
              <Button variant="ghost">Back home</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!state || !viewer) {
    return (
      <div className="min-h-dvh">
        <SiteHeader />
        <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="mt-5 text-sm text-[var(--text-mid)]">Connecting to {displayCode(code)}…</p>
        </main>
      </div>
    );
  }

  const inspectedTeam = leaderboard.find((team) => team.playerId === inspect) ?? null;
  const youRank = leaderboard.find((team) => team.playerId === viewer.playerId);

  /* ------------------------------ lobby ------------------------------ */
  if (state.status === 'LOBBY') {
    return (
      <div className="min-h-dvh">
        <SiteHeader right={<ConnectionPill connection={connection} />} />
        <main className="mx-auto w-full max-w-[1400px] px-3 py-6 sm:px-5">
          {banner ? <Banner message={banner} /> : null}
          <GameLobby state={state} viewer={viewer} onError={(message) => setBanner(message)} />
        </main>
        <NotificationStack pulses={pulses} onDismiss={consumePulse} />
      </div>
    );
  }

  /* ----------------------------- finished ---------------------------- */
  if (state.status === 'FINISHED' || state.status === 'CANCELLED') {
    return (
      <div className="min-h-dvh">
        <SiteHeader
          right={
            <div className="flex gap-2">
              <Link href={`/history/${state.code}`}>
                <Button size="sm" variant="secondary">
                  War Room
                </Button>
              </Link>
              <Link href="/">
                <Button size="sm" variant="ghost">
                  Home
                </Button>
              </Link>
            </div>
          }
        />
        <main className="mx-auto w-full max-w-[1200px] px-3 py-6 sm:px-5">
          {state.status === 'CANCELLED' ? (
            <EmptyState
              title="Auction cancelled"
              description="The host closed this room before it finished."
              icon="⏹"
            />
          ) : charactersLoading ? (
            <p className="py-20 text-center text-sm text-[var(--text-low)]">Tallying scores…</p>
          ) : (
            <FinalResults
              state={state}
              rankings={leaderboard}
              characters={characters}
              youId={viewer.playerId}
            />
          )}
        </main>
      </div>
    );
  }

  /* ------------------------------ active ----------------------------- */
  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <SiteHeader
        compact
        showNav={false}
        right={
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 sm:flex">
              <Badge tone="neutral">{displayCode(state.code)}</Badge>
              <Badge tone="crimson">Lot {state.auction.round}</Badge>
              <Badge tone="neutral">{state.players.length} players</Badge>
            </span>
            {me && !me.isSpectator ? (
              <span className="rounded-md border border-gold/35 bg-gold/10 px-2 py-1">
                <span className="tabular text-xs font-bold text-gold">{credits(me.budget)}</span>
              </span>
            ) : null}
            <ConnectionPill connection={connection} />
          </div>
        }
      />

      <main className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5">
        {banner ? <Banner message={banner} /> : null}

        {/* ---------- desktop: three columns ---------- */}
        <div className="hidden gap-4 lg:grid lg:grid-cols-[300px_minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {me && !me.isSpectator ? (
              <Panel className="p-4">
                <p className="eyebrow mb-3">Your wallet</p>
                <BudgetWidget
                  player={me}
                  startingBudget={state.settings.startingBudget}
                  maxBid={viewer.maxBid}
                />
              </Panel>
            ) : null}

            {me ? (
              <Panel className="p-4">
                <TeamRoster
                  player={me}
                  characters={characters}
                  maxRoster={state.settings.maxRoster}
                  scoring={state.settings.scoring}
                />
                {youRank ? (
                  <button
                    type="button"
                    onClick={() => setInspect(viewer.playerId)}
                    className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.07]"
                  >
                    <span className="flex items-baseline justify-between">
                      <span className="eyebrow">Team power</span>
                      <span className="tabular display text-lg text-gold">
                        {credits(youRank.total)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[10px] text-sky">
                      Rank #{youRank.rank} · how was this calculated?
                    </span>
                  </button>
                ) : null}
              </Panel>
            ) : null}

            {viewer.isHost ? (
              <Panel glow className="p-4">
                <p className="eyebrow mb-3">Host console</p>
                <HostControls state={state} characters={characters} />
              </Panel>
            ) : null}
          </div>

          <div className="space-y-4">
            <AuctionArena
              state={state}
              viewer={viewer}
              character={currentCharacter}
              highestBidder={highestBidder}
              clockOffset={clockOffset}
            />
            <Panel className="p-4">
              <p className="eyebrow mb-3">Auction history</p>
              <AuctionHistory
                purchases={state.purchases}
                players={state.players}
                characters={characters}
                className="max-h-64"
              />
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel className="p-4">
              <p className="eyebrow mb-3">Live rankings</p>
              <LiveLeaderboard teams={leaderboard} youId={viewer.playerId} onInspect={setInspect} />
            </Panel>
            <Panel className="p-4">
              <p className="eyebrow mb-3">Auction feed</p>
              <AuctionFeed feed={state.feed} className="max-h-[420px]" />
            </Panel>
            <Panel className="p-4">
              <p className="eyebrow mb-3">Rivals</p>
              <div className="space-y-3">
                {state.players
                  .filter((player) => !player.isSpectator && player.id !== viewer.playerId)
                  .map((player) => (
                    <RivalRow
                      key={player.id}
                      player={player}
                      characters={characters}
                      maxRoster={state.settings.maxRoster}
                    />
                  ))}
              </div>
            </Panel>
          </div>
        </div>

        {/* ---------- mobile: focused single column ---------- */}
        <div className="lg:hidden">
          {mobileTab === 'arena' ? (
            <div className="space-y-4">
              <AuctionArena
                state={state}
                viewer={viewer}
                character={currentCharacter}
                highestBidder={highestBidder}
                clockOffset={clockOffset}
              />
              {viewer.isHost ? (
                <Panel glow className="p-4">
                  <p className="eyebrow mb-3">Host console</p>
                  <HostControls state={state} characters={characters} />
                </Panel>
              ) : null}
            </div>
          ) : null}

          {mobileTab === 'team' && me ? (
            <div className="space-y-4">
              {!me.isSpectator ? (
                <Panel className="p-4">
                  <p className="eyebrow mb-3">Your wallet</p>
                  <BudgetWidget
                    player={me}
                    startingBudget={state.settings.startingBudget}
                    maxBid={viewer.maxBid}
                  />
                </Panel>
              ) : null}
              <Panel className="p-4">
                <TeamRoster
                  player={me}
                  characters={characters}
                  maxRoster={state.settings.maxRoster}
                  scoring={state.settings.scoring}
                />
              </Panel>
              {youRank ? (
                <Panel className="p-4">
                  <ScoreBreakdown
                    score={youRank}
                    characters={characters}
                    scoring={state.settings.scoring}
                    teamName={youRank.player.teamName}
                  />
                </Panel>
              ) : null}
            </div>
          ) : null}

          {mobileTab === 'ranks' ? (
            <Panel className="p-4">
              <p className="eyebrow mb-3">Live rankings</p>
              <LiveLeaderboard teams={leaderboard} youId={viewer.playerId} onInspect={setInspect} />
            </Panel>
          ) : null}

          {mobileTab === 'feed' ? (
            <div className="space-y-4">
              <Panel className="p-4">
                <p className="eyebrow mb-3">Auction feed</p>
                <AuctionFeed feed={state.feed} className="max-h-[50vh]" />
              </Panel>
              <Panel className="p-4">
                <p className="eyebrow mb-3">History</p>
                <AuctionHistory
                  purchases={state.purchases}
                  players={state.players}
                  characters={characters}
                  className="max-h-[40vh]"
                />
              </Panel>
            </div>
          ) : null}
        </div>
      </main>

      {/* ---------- mobile tab bar ---------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur-xl lg:hidden"
        aria-label="Auction sections"
      >
        <div className="grid grid-cols-4">
          {(
            [
              ['arena', 'Arena'],
              ['team', 'My team'],
              ['ranks', 'Ranks'],
              ['feed', 'Feed'],
            ] as [MobileTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMobileTab(key)}
              aria-current={mobileTab === key}
              className={cn(
                'no-tap-highlight py-3 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors',
                mobileTab === key
                  ? 'border-t-2 border-accent bg-accent/10 text-white'
                  : 'text-[var(--text-low)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <CharacterReveal
        character={revealed}
        scoring={state.settings.scoring}
        onComplete={() => setRevealed(null)}
      />
      <SoldOverlay sale={sale} onDone={() => setSale(null)} />
      <NotificationStack pulses={pulses} onDismiss={consumePulse} />

      <AnimatePresence>
        {inspectedTeam ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
            onClick={() => setInspect(null)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
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
                score={inspectedTeam}
                characters={characters}
                scoring={state.settings.scoring}
                teamName={inspectedTeam.player.teamName}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ConnectionPill({ connection }: { connection: string }) {
  const tone =
    connection === 'ONLINE'
      ? 'border-mint/40 bg-mint/12 text-mint'
      : connection === 'RECONNECTING'
        ? 'border-gold/40 bg-gold/12 text-gold'
        : 'border-accent/40 bg-accent/12 text-accent-soft';

  return (
    <span
      className={cn(
        'rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em]',
        tone,
      )}
    >
      {connection === 'ONLINE' ? 'Live' : connection === 'RECONNECTING' ? 'Reconnecting' : 'Offline'}
    </span>
  );
}

function Banner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2.5 text-center text-xs font-semibold text-gold"
    >
      {message}
    </div>
  );
}

function RivalRow({
  player,
  characters,
  maxRoster,
}: {
  player: Player;
  characters: Map<string, Character>;
  maxRoster: number;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              player.connection === 'DISCONNECTED' ? 'bg-accent' : 'bg-mint',
            )}
            aria-label={player.connection === 'DISCONNECTED' ? 'Disconnected' : 'Online'}
          />
          <span className="truncate text-[11px] font-bold text-white">{player.teamName}</span>
        </span>
        <span className="tabular shrink-0 text-[11px] font-bold text-gold">
          {credits(player.budget)}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: maxRoster }, (_, index) => {
          const purchase = player.roster[index];
          const character = purchase ? characters.get(purchase.characterId) : undefined;
          return (
            <div
              key={index}
              title={character?.name}
              className={cn(
                'aspect-square rounded-sm border',
                character
                  ? 'border-white/15 bg-accent/25'
                  : 'border-dashed border-white/10 bg-transparent',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
