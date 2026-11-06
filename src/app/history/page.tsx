'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { credits, timeAgo } from '@/lib/format';
import { displayCode } from '@/lib/room-code';
import { PageShell } from '@/components/SiteChrome';
import { Badge, EmptyState, Panel, SectionTitle } from '@/components/ui/Primitives';

interface ArchiveRow {
  id: string;
  code: string;
  name: string;
  mode: string;
  hostName: string;
  finishedAt: number;
  playerCount: number;
  winnerNames: string[];
  winnerPower: number;
  lots: number;
  totalBids: number;
}

export default function HistoryPage() {
  const [games, setGames] = useState<ArchiveRow[] | null>(null);

  useEffect(() => {
    void fetch('/api/archives?limit=40')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { games: ArchiveRow[] } | null) => setGames(data?.games ?? []))
      .catch(() => setGames([]));
  }, []);

  return (
    <PageShell className="max-w-4xl">
      <SectionTitle
        eyebrow="The archive"
        title="Past battles"
        description="Every completed auction, with its full bid log kept for the War Room and replay."
      />

      {games === null ? (
        <p className="py-16 text-center text-sm text-[var(--text-low)]">Loading the archive…</p>
      ) : games.length === 0 ? (
        <EmptyState
          title="No battles yet"
          description="Finish an auction and it will be recorded here, complete with analytics and a replay."
          icon="◇"
        />
      ) : (
        <ul className="space-y-2">
          {games.map((game) => (
            <li key={game.id}>
              <Link href={`/history/${game.code}`}>
                <Panel className="p-4 transition-colors hover:border-white/25">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="display truncate text-base text-white">{game.name}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-low)]">
                        {displayCode(game.code)} · hosted by {game.hostName} ·{' '}
                        {timeAgo(game.finishedAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone="crimson">{game.mode.replace(/_/g, ' ')}</Badge>
                        <Badge>{game.playerCount} teams</Badge>
                        <Badge>{game.lots} lots</Badge>
                        <Badge>{game.totalBids} bids</Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="eyebrow">Champion</p>
                      <p className="display truncate text-lg text-gold">
                        {game.winnerNames.join(' & ') || '—'}
                      </p>
                      <p className="tabular text-xs text-[var(--text-mid)]">
                        {credits(game.winnerPower)} power
                      </p>
                    </div>
                  </div>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
