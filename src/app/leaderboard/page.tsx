'use client';

import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, ACHIEVEMENT_MAP } from '@/game/achievements';
import { avatarSvg } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { credits, timeAgo } from '@/lib/format';
import { PageShell } from '@/components/SiteChrome';
import { Badge, EmptyState, Panel, SectionTitle } from '@/components/ui/Primitives';

interface Profile {
  name: string;
  avatar: string;
  gamesPlayed: number;
  wins: number;
  charactersWon: number;
  creditsSpent: number;
  highestPurchase: number;
  achievements: string[];
  updatedAt: number;
}

export default function LeaderboardPage() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/profiles')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { profiles: Profile[] } | null) => setProfiles(data?.profiles ?? []))
      .catch(() => setProfiles([]));
  }, []);

  const active = profiles?.find((profile) => profile.name === selected) ?? null;

  return (
    <PageShell className="max-w-5xl">
      <SectionTitle
        eyebrow="Career records"
        title="Auctioneers"
        description="Lifetime statistics across every completed auction on this server."
      />

      {profiles === null ? (
        <p className="py-16 text-center text-sm text-[var(--text-low)]">Loading records…</p>
      ) : profiles.length === 0 ? (
        <EmptyState
          title="No records yet"
          description="Play an auction through to the end and career statistics start accumulating here."
          icon="◇"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel className="overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/8 text-[9px] uppercase tracking-[0.14em] text-[var(--text-low)]">
                  <th className="px-3 py-2.5 font-bold">#</th>
                  <th className="px-3 py-2.5 font-bold">Player</th>
                  <th className="px-3 py-2.5 text-right font-bold">Wins</th>
                  <th className="px-3 py-2.5 text-right font-bold">Games</th>
                  <th className="hidden px-3 py-2.5 text-right font-bold sm:table-cell">Win rate</th>
                  <th className="hidden px-3 py-2.5 text-right font-bold sm:table-cell">Chars</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile, index) => {
                  const rate = profile.gamesPlayed
                    ? Math.round((profile.wins / profile.gamesPlayed) * 100)
                    : 0;
                  return (
                    <tr
                      key={profile.name}
                      onClick={() => setSelected(profile.name)}
                      className={cn(
                        'cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.04]',
                        selected === profile.name && 'bg-white/[0.06]',
                      )}
                    >
                      <td className="tabular px-3 py-2.5 text-sm text-[var(--text-low)]">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={avatarSvg(profile.avatar)}
                            alt=""
                            aria-hidden
                            className="h-7 w-7 rounded border border-white/10"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-white">
                              {profile.name}
                            </span>
                            <span className="block text-[10px] text-[var(--text-low)]">
                              {profile.achievements.length} achievement
                              {profile.achievements.length === 1 ? '' : 's'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-sm font-bold text-gold">
                        {profile.wins}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-sm text-[var(--text-mid)]">
                        {profile.gamesPlayed}
                      </td>
                      <td className="tabular hidden px-3 py-2.5 text-right text-sm text-[var(--text-mid)] sm:table-cell">
                        {rate}%
                      </td>
                      <td className="tabular hidden px-3 py-2.5 text-right text-sm text-[var(--text-mid)] sm:table-cell">
                        {profile.charactersWon}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <Panel className="p-5">
            {active ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarSvg(active.avatar)}
                    alt=""
                    aria-hidden
                    className="h-14 w-14 rounded-lg border border-white/12"
                  />
                  <div className="min-w-0">
                    <p className="display truncate text-lg text-white">{active.name}</p>
                    <p className="text-[11px] text-[var(--text-low)]">
                      Last played {timeAgo(active.updatedAt)}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['Games', active.gamesPlayed],
                      ['Wins', active.wins],
                      [
                        'Win rate',
                        `${active.gamesPlayed ? Math.round((active.wins / active.gamesPlayed) * 100) : 0}%`,
                      ],
                      ['Characters', active.charactersWon],
                      ['Credits spent', credits(active.creditsSpent)],
                      ['Highest buy', credits(active.highestPurchase)],
                    ] as [string, string | number][]
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/8 px-3 py-2">
                      <dt className="eyebrow">{label}</dt>
                      <dd className="tabular mt-0.5 text-sm font-bold text-white">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div>
                  <p className="eyebrow mb-2">Achievements</p>
                  <ul className="space-y-1.5">
                    {ACHIEVEMENTS.map((achievement) => {
                      const earned =
                        active.achievements.includes(achievement.id) ||
                        (achievement.id === 'MASTER_AUCTIONEER' && active.wins >= 10);
                      return (
                        <li
                          key={achievement.id}
                          className={cn(
                            'flex items-start gap-2.5 rounded-lg border px-2.5 py-2',
                            earned
                              ? 'border-gold/30 bg-gold/[0.07]'
                              : 'border-white/8 bg-white/[0.02] opacity-50',
                          )}
                        >
                          <span aria-hidden className="text-base">
                            {achievement.icon}
                          </span>
                          <span className="min-w-0">
                            <span
                              className={cn(
                                'block text-[11px] font-bold uppercase tracking-[0.1em]',
                                earned ? 'text-gold' : 'text-[var(--text-low)]',
                              )}
                            >
                              {achievement.name}
                            </span>
                            <span className="block text-[10px] leading-relaxed text-[var(--text-low)]">
                              {achievement.description}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="eyebrow">Achievements</p>
                <p className="text-[11px] leading-relaxed text-[var(--text-low)]">
                  Select a player to see their record. Achievements available:
                </p>
                <ul className="space-y-1.5">
                  {ACHIEVEMENTS.map((achievement) => (
                    <li key={achievement.id} className="flex items-start gap-2">
                      <span aria-hidden>{ACHIEVEMENT_MAP.get(achievement.id)?.icon}</span>
                      <span>
                        <Badge tone="gold">{achievement.name}</Badge>
                        <span className="mt-0.5 block text-[10px] text-[var(--text-low)]">
                          {achievement.description}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      )}
    </PageShell>
  );
}
