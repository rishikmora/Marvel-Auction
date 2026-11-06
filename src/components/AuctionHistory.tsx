'use client';

import { useMemo, useState } from 'react';
import type { Character, Player, PurchaseRecord, Universe } from '@/game/types';
import { cn } from '@/lib/cn';
import { credits, timestamp, UNIVERSE_NAME } from '@/lib/format';
import { EmptyState } from './ui/Primitives';

type SortKey = 'round' | 'price-desc' | 'price-asc';

export function AuctionHistory({
  purchases,
  players,
  characters,
  className,
  filterable,
}: {
  purchases: PurchaseRecord[];
  players: Player[];
  characters: Map<string, Character>;
  className?: string;
  filterable?: boolean;
}) {
  const [player, setPlayer] = useState<string>('all');
  const [universe, setUniverse] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('round');

  const playerMap = useMemo(() => new Map(players.map((entry) => [entry.id, entry])), [players]);

  const rows = useMemo(() => {
    let list = purchases.filter((record) => !record.passed);
    if (player !== 'all') list = list.filter((record) => record.playerId === player);
    if (universe !== 'all') {
      list = list.filter((record) =>
        characters.get(record.characterId)?.categories.includes(universe as Universe),
      );
    }
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter((record) =>
        characters.get(record.characterId)?.name.toLowerCase().includes(needle),
      );
    }
    const sorted = [...list];
    if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
    else sorted.sort((a, b) => b.round - a.round);
    return sorted;
  }, [purchases, player, universe, query, sort, characters]);

  const universes = useMemo(() => {
    const set = new Set<Universe>();
    for (const record of purchases) {
      const character = characters.get(record.characterId);
      character?.categories.forEach((category) => set.add(category));
    }
    return [...set].sort();
  }, [purchases, characters]);

  if (!purchases.length) {
    return (
      <EmptyState
        title="No battles yet"
        description="Sold characters appear here with the winning team and price."
        className={className}
      />
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {filterable ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search character"
            aria-label="Search character"
            className="rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-[var(--text-low)]"
          />
          <select
            value={player}
            onChange={(event) => setPlayer(event.target.value)}
            aria-label="Filter by player"
            className="rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs text-white"
          >
            <option value="all">All teams</option>
            {players
              .filter((entry) => !entry.isSpectator)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.teamName}
                </option>
              ))}
          </select>
          <select
            value={universe}
            onChange={(event) => setUniverse(event.target.value)}
            aria-label="Filter by universe"
            className="rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs text-white"
          >
            <option value="all">All universes</option>
            {universes.map((entry) => (
              <option key={entry} value={entry}>
                {UNIVERSE_NAME[entry]}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort"
            className="rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-xs text-white"
          >
            <option value="round">Latest round</option>
            <option value="price-desc">Highest bid</option>
            <option value="price-asc">Lowest bid</option>
          </select>
        </div>
      ) : null}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-panel/95 backdrop-blur">
            <tr className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-low)]">
              <th className="px-2 py-1.5 font-bold">Lot</th>
              <th className="px-2 py-1.5 font-bold">Character</th>
              <th className="px-2 py-1.5 font-bold">Team</th>
              <th className="px-2 py-1.5 text-right font-bold">Price</th>
              <th className="hidden px-2 py-1.5 text-right font-bold sm:table-cell">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => {
              const character = characters.get(record.characterId);
              const winner = record.playerId ? playerMap.get(record.playerId) : null;
              const overpay = character ? record.price - character.basePrice : 0;
              return (
                <tr key={record.id} className="border-t border-white/6 hover:bg-white/[0.03]">
                  <td className="tabular px-2 py-1.5 text-[11px] text-[var(--text-low)]">
                    {record.round}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="block truncate text-[11px] font-semibold text-white">
                      {character?.name ?? record.characterId}
                    </span>
                    {character ? (
                      <span className="text-[9px] text-[var(--text-low)]">
                        {UNIVERSE_NAME[character.universe]} · {record.bidCount} bids
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="block truncate text-[11px] text-sky">
                      {winner?.teamName ?? '—'}
                    </span>
                  </td>
                  <td className="tabular px-2 py-1.5 text-right">
                    <span className="block text-[11px] font-bold text-gold">
                      {credits(record.price)}
                    </span>
                    {character ? (
                      <span
                        className={cn(
                          'text-[9px]',
                          overpay > 0 ? 'text-accent-soft' : 'text-mint',
                        )}
                      >
                        {overpay > 0 ? '+' : ''}
                        {overpay} vs base
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular hidden px-2 py-1.5 text-right text-[10px] text-[var(--text-low)] sm:table-cell">
                    {timestamp(record.at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-[var(--text-low)]">
            Nothing matches those filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
