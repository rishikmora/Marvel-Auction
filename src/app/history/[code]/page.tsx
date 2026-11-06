'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { AuctionAnalytics } from '@/game/analytics';
import type {
  BidRecord,
  Character,
  GameSettings,
  Player,
  PurchaseRecord,
  RankedTeam,
} from '@/game/types';
import { cn } from '@/lib/cn';
import { credits, timeAgo } from '@/lib/format';
import { displayCode, normalizeCode } from '@/lib/room-code';
import { AuctionHistory } from '@/components/AuctionHistory';
import { BattleSimulation } from '@/components/BattleSimulation';
import { ReplayTimeline } from '@/components/ReplayTimeline';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { PageShell } from '@/components/SiteChrome';
import { TeamRoster } from '@/components/TeamRoster';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Panel, SectionTitle, Stat } from '@/components/ui/Primitives';

interface WarRoomData {
  game: {
    id: string;
    code: string;
    name: string;
    mode: string;
    hostName: string;
    startedAt: number | null;
    finishedAt: number;
    settings: GameSettings;
    players: Player[];
    purchases: PurchaseRecord[];
    bids: BidRecord[];
  };
  rankings: RankedTeam[];
  analytics: AuctionAnalytics;
  characters: Character[];
}

type Tab = 'overview' | 'teams' | 'history' | 'replay' | 'battle';

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['teams', 'Teams'],
  ['history', 'Lot history'],
  ['replay', 'Replay'],
  ['battle', 'Battle sim'],
];

export default function WarRoomPage() {
  const params = useParams<{ code: string }>();
  const code = normalizeCode(String(params?.code ?? ''));

  const [data, setData] = useState<WarRoomData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [inspect, setInspect] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/archives/${code}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('That auction is not in the archive.');
        return (await response.json()) as WarRoomData;
      })
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
  }, [code]);

  const characters = useMemo(
    () => new Map((data?.characters ?? []).map((character) => [character.id, character])),
    [data],
  );

  if (error) {
    return (
      <PageShell className="max-w-3xl">
        <EmptyState
          title="Not in the archive"
          description={error}
          action={
            <Link href="/history">
              <Button variant="secondary">Back to past battles</Button>
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell className="max-w-3xl">
        <p className="py-20 text-center text-sm text-[var(--text-low)]">Opening the War Room…</p>
      </PageShell>
    );
  }

  const { game, rankings, analytics } = data;
  const champion = rankings[0];
  const inspected = rankings.find((team) => team.playerId === inspect) ?? null;

  return (
    <PageShell className="max-w-6xl">
      <SectionTitle
        eyebrow="Post-auction analysis"
        title="The War Room"
        description={`${game.name} · ${displayCode(game.code)} · hosted by ${game.hostName} · ${timeAgo(game.finishedAt)}`}
      />

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'no-tap-highlight shrink-0 rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
              tab === key ? 'bg-accent text-ink' : 'text-muted hover:text-cream',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ------------------------- overview ------------------------- */}
      {tab === 'overview' ? (
        <div className="space-y-4">
          <Panel glow className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Badge tone="gold">Champion</Badge>
                <p className="display mt-2 text-3xl text-white">
                  {champion?.player.teamName ?? '—'}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--text-mid)]">
                  {champion?.player.name}
                </p>
              </div>
              <div className="text-right">
                <p className="eyebrow">Final power</p>
                <p className="tabular display text-4xl text-gold">
                  {credits(champion?.total ?? 0)}
                </p>
              </div>
            </div>
          </Panel>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Panel className="p-4">
              <Stat label="Lots sold" value={analytics.soldLots} hint={`${analytics.passedLots} passed`} />
            </Panel>
            <Panel className="p-4">
              <Stat label="Credits spent" value={credits(analytics.totalCreditsSpent)} tone="gold" />
            </Panel>
            <Panel className="p-4">
              <Stat
                label="Average price"
                value={credits(analytics.averagePrice)}
                hint={`Average bid ${credits(analytics.averageBid)}`}
              />
            </Panel>
            <Panel className="p-4">
              <Stat
                label="Highest bid"
                value={credits(analytics.highestBid)}
                hint={`Lowest win ${credits(analytics.lowestWinningBid)}`}
                tone="crimson"
              />
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel className="p-5">
              <h3 className="display mb-3 text-base text-white">Spending efficiency</h3>
              <ul className="space-y-2">
                {[...analytics.players]
                  .sort((a, b) => b.powerPerCredit - a.powerPerCredit)
                  .map((player) => (
                    <li key={player.playerId} className="rounded-lg border border-white/8 p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-white">
                          {player.teamName}
                        </span>
                        <span className="tabular text-sm font-bold text-mint">
                          {player.powerPerCredit} pwr/credit
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-low)] sm:grid-cols-4">
                        <span className="tabular">Spent {credits(player.spent)}</span>
                        <span className="tabular">Left {credits(player.remaining)}</span>
                        <span className="tabular">Bids {player.bidsPlaced}</span>
                        <span className="tabular">
                          {player.discipline < 1 ? 'Under' : 'Over'} base ×{player.discipline}
                        </span>
                      </div>
                    </li>
                  ))}
              </ul>
            </Panel>

            <Panel className="p-5">
              <h3 className="display mb-3 text-base text-white">Standouts</h3>
              <dl className="space-y-2.5">
                {(
                  [
                    ['Best purchase', analytics.bestValue && `${analytics.bestValue.characterName} — ${credits(analytics.bestValue.price)} for ${credits(analytics.bestValue.power)} power`],
                    ['Worst purchase', analytics.worstValue && `${analytics.worstValue.characterName} — ${credits(analytics.worstValue.price)} for ${credits(analytics.worstValue.power)} power`],
                    ['Largest overpay', analytics.largestOverpay && `${analytics.largestOverpay.characterName} — ${analytics.largestOverpay.overpay > 0 ? '+' : ''}${analytics.largestOverpay.overpay} vs base`],
                    ['Most contested', analytics.mostContested && `${analytics.mostContested.characterName} — ${analytics.mostContested.bidCount} bids`],
                    ['Fastest sale', analytics.fastestPurchase && `${analytics.fastestPurchase.characterName} — ${analytics.fastestPurchase.bidCount} bid(s)`],
                    ['Most aggressive', analytics.mostAggressive && `${analytics.mostAggressive.teamName} — ${analytics.mostAggressive.aggression} bids per win`],
                    ['Most disciplined', analytics.mostDisciplined && `${analytics.mostDisciplined.teamName} — paid ×${analytics.mostDisciplined.discipline} of base`],
                    ['Best value team', analytics.bestValueTeam && `${analytics.bestValueTeam.teamName} — ${analytics.bestValueTeam.powerPerCredit} pwr/credit`],
                  ] as [string, string | null | undefined][]
                ).map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-[11px] text-[var(--text-low)]">{label}</dt>
                    <dd className="text-right text-[11px] font-semibold text-white">
                      {value ?? '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>

          <Panel className="p-5">
            <h3 className="display mb-3 text-base text-white">Final standings</h3>
            <ul className="space-y-2">
              {rankings.map((team) => (
                <li key={team.playerId}>
                  <button
                    type="button"
                    onClick={() => setInspect(team.playerId)}
                    className="w-full rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-left hover:bg-white/[0.06]"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="tabular display w-5 text-sm text-[var(--text-low)]">
                          {team.rank}
                        </span>
                        <span className="truncate text-sm font-bold text-white">
                          {team.player.teamName}
                        </span>
                        {team.sharedRank ? <Badge>Shared</Badge> : null}
                      </span>
                      <span className="tabular text-sm font-bold text-gold">
                        {credits(team.total)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-sky">How was this calculated?</p>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {/* -------------------------- teams --------------------------- */}
      {tab === 'teams' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {rankings.map((team) => (
            <Panel key={team.playerId} className="p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <span className="display text-base text-white">#{team.rank}</span>
                <span className="tabular text-lg font-bold text-gold">{credits(team.total)}</span>
              </div>
              <TeamRoster
                player={team.player}
                characters={characters}
                maxRoster={game.settings.maxRoster}
                scoring={game.settings.scoring}
              />
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[var(--text-low)]">
                <span className="tabular">Chars {credits(team.characterPower)}</span>
                <span className="tabular text-mint">Synergy +{team.synergyBonus}</span>
                <span className="tabular text-sky">Balance +{team.balanceBonus}</span>
                <span className="tabular text-gold">Leadership +{team.leadershipBonus}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 w-full"
                onClick={() => setInspect(team.playerId)}
              >
                Full breakdown
              </Button>
            </Panel>
          ))}
        </div>
      ) : null}

      {/* ------------------------- lot history ---------------------- */}
      {tab === 'history' ? (
        <Panel className="p-4">
          <AuctionHistory
            purchases={game.purchases}
            players={game.players}
            characters={characters}
            filterable
            className="max-h-[70vh]"
          />
        </Panel>
      ) : null}

      {/* --------------------------- replay ------------------------- */}
      {tab === 'replay' ? (
        <Panel className="p-5">
          <h3 className="display mb-1 text-base text-white">Auction replay</h3>
          <p className="mb-4 text-[11px] text-[var(--text-low)]">
            Rebuilt from {game.bids.length} recorded bids across {game.purchases.length} lots.
          </p>
          <ReplayTimeline
            bids={game.bids}
            purchases={game.purchases}
            players={game.players}
            characters={characters}
            auctionSeconds={game.settings.auctionSeconds}
          />
        </Panel>
      ) : null}

      {/* --------------------------- battle ------------------------- */}
      {tab === 'battle' ? (
        <Panel className="p-5">
          {rankings.length >= 2 ? (
            <BattleSimulation
              a={rankings[0]}
              b={rankings[1]}
              characters={characters}
              scoring={game.settings.scoring}
              seed={game.id}
            />
          ) : (
            <EmptyState
              title="Not enough teams"
              description="A battle simulation needs at least two finished rosters."
            />
          )}
        </Panel>
      ) : null}

      {/* ------------------------ breakdown ------------------------- */}
      {inspected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
          onClick={() => setInspect(null)}
        >
          <div
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
              scoring={game.settings.scoring}
              teamName={inspected.player.teamName}
            />
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
