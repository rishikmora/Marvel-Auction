'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GAME_MODES } from '@/game/config';
import type { Character } from '@/game/types';
import { credits, timeAgo } from '@/lib/format';
import { displayCode, normalizeCode } from '@/lib/room-code';
import { lastRoom } from '@/lib/session';
import { CharacterMarquee } from '@/components/CharacterMarquee';
import { MascotBadge } from '@/components/Mascot';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

interface Stats {
  gamesPlayed: number;
  charactersAuctioned: number;
  creditsSpent: number;
  charactersAvailable: number;
  liveRooms: number;
  mostContested: { name: string; id: string; count: number } | null;
  recentWinners: { code: string; name: string; winners: string[]; power: number; finishedAt: number }[];
}

const Arrow = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
    <path d="M5 12h13M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function HomePage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [resume, setResume] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setResume(lastRoom());

    void fetch('/api/stats')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Stats | null) => setStats(data))
      .catch(() => setStats(null));

    void fetch('/api/characters')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { characters: Character[] } | null) => {
        if (!data) return;
        // A fixed, recognisable slice for the marquee rather than the whole catalogue.
        const wanted = [
          'thanos', 'iron-man', 'scarlet-witch', 'wolverine', 'doctor-doom', 'storm',
          'silver-surfer', 'venom', 'captain-america', 'magneto', 'spider-man', 'hela',
          'thor', 'deadpool', 'black-panther', 'galactus', 'jean-grey', 'loki',
          'captain-marvel', 'ultron', 'doctor-strange', 'rogue', 'gamora', 'daredevil',
        ];
        setCharacters(
          wanted
            .map((id) => data.characters.find((entry) => entry.id === id))
            .filter((entry): entry is Character => Boolean(entry)),
        );
      })
      .catch(() => setCharacters([]));
  }, []);

  const join = () => {
    const normalized = normalizeCode(code);
    if (normalized.length < 4) {
      setJoinError('Enter the full room code.');
      joinRef.current?.focus();
      return;
    }
    router.push(`/join?code=${normalized}`);
  };

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-4 pt-8 sm:px-6 sm:pt-12">
        {/* ----------------------------- hero ----------------------------- */}
        <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
          <div>
            <h1 className="headline text-cream">
              Bid. Build.
              <br />
              Dominate.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-subtle sm:text-lg">
              The live superhero auction game. Make a room, friends join with a code, and the
              strongest team wins — not the biggest spender.
            </p>

            {/* mode tiles */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link href="/create" className="tile tile-accent group p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-pill bg-black/15">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M5 12.5a10 10 0 0 1 14 0M8 16a6 6 0 0 1 8 0" strokeLinecap="round" />
                      <circle cx="12" cy="19.5" r="1.4" fill="currentColor" stroke="none" />
                    </svg>
                  </span>
                  <span className="transition-transform group-hover:translate-x-0.5">{Arrow}</span>
                </div>
                <p className="display mt-4 text-xl">Host an auction</p>
                <p className="mt-1 text-sm opacity-80">Make a room. Friends join with a code.</p>
              </Link>

              <Link href="/join" className="tile group p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-pill bg-white/[0.06] text-subtle">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <rect x="7" y="3" width="10" height="18" rx="2.5" />
                      <path d="M11 18.5h2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="text-muted transition-transform group-hover:translate-x-0.5">
                    {Arrow}
                  </span>
                </div>
                <p className="display mt-4 text-xl text-cream">Join a room</p>
                <p className="mt-1 text-sm text-muted">Got a code? Take a seat at the table.</p>
              </Link>
            </div>

            {/* inline join */}
            <div className="mt-4 rounded-card border border-white/10 bg-panel-deep p-4">
              <p className="text-sm text-subtle">Got a code from a friend?</p>
              <div className="mt-2.5 flex gap-2">
                <input
                  ref={joinRef}
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setJoinError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') join();
                  }}
                  placeholder="ROOM CODE"
                  aria-label="Room code"
                  aria-invalid={Boolean(joinError)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="tabular min-w-0 flex-1 rounded-xl border border-white/12 bg-ink px-4 py-3 text-base tracking-[0.18em] text-cream placeholder:tracking-[0.18em] placeholder:text-muted focus:border-accent/60"
                />
                <button
                  type="button"
                  onClick={join}
                  className="no-tap-highlight shrink-0 rounded-xl bg-cream px-6 py-3 text-sm font-bold text-ink transition-colors hover:bg-white"
                >
                  Join
                </button>
              </div>
              {joinError ? (
                <p role="alert" className="mt-2 text-xs text-accent">
                  {joinError}
                </p>
              ) : null}
            </div>

            {resume ? (
              <Link
                href={`/room/${resume}`}
                className="mt-3 inline-flex items-center gap-2 text-sm text-accent hover:underline"
              >
                Rejoin {displayCode(resume)} {Arrow}
              </Link>
            ) : null}
          </div>

          {/* mascot + highlight column */}
          <div className="space-y-3">
            <div className="flex justify-center lg:justify-end">
              <MascotBadge />
            </div>

            <div className="rounded-card border border-accent/25 bg-accent/[0.07] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                The vault · {stats?.charactersAvailable ?? 110} characters
              </p>
              <p className="display mt-1.5 text-xl text-cream">Everyone starts equal</p>
              <p className="mt-1.5 text-sm leading-relaxed text-subtle">
                Same credits, seven slots, one shot at each hero. Synergy and team balance decide
                it, so the smart roster beats the expensive one.
              </p>
              <Link
                href="/how-to-play"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
              >
                How it works {Arrow}
              </Link>
            </div>

            {stats && stats.liveRooms > 0 ? (
              <div className="rounded-card border border-white/10 bg-panel p-4">
                <p className="text-sm text-cream">
                  <span className="tabular font-bold text-mint">{stats.liveRooms}</span> room
                  {stats.liveRooms === 1 ? '' : 's'} open right now
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {/* --------------------------- marquee --------------------------- */}
        {characters.length ? (
          <section className="mt-14" aria-label="Characters in the vault">
            <CharacterMarquee characters={characters} />
          </section>
        ) : null}

        {/* ---------------------------- modes ---------------------------- */}
        <section className="mt-14">
          <h2 className="display text-2xl text-cream">Ways to play</h2>
          <p className="mt-1.5 text-sm text-muted">
            Pick a mode when you create the room. Every rule is yours to change.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GAME_MODES.filter((mode) => mode.id !== 'CUSTOM').map((mode) => (
              <Link key={mode.id} href={`/create?mode=${mode.id}`} className="tile group p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="display text-base text-cream">{mode.name}</p>
                  <span className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5">
                    {Arrow}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{mode.tagline}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------------------------- stats ---------------------------- */}
        <section className="mt-14">
          <h2 className="display text-2xl text-cream">The numbers so far</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['Auctions completed', String(stats?.gamesPlayed ?? 0), 'text-cream'],
                ['Characters sold', String(stats?.charactersAuctioned ?? 0), 'text-cream'],
                ['Credits committed', credits(stats?.creditsSpent ?? 0), 'text-gold'],
                ['Most contested', stats?.mostContested?.name ?? '—', 'text-accent'],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="rounded-card border border-white/10 bg-panel p-5">
                <p className="eyebrow">{label}</p>
                <p className={`tabular display mt-1.5 truncate text-3xl ${tone}`}>{value}</p>
              </div>
            ))}
          </div>

          {stats?.recentWinners?.length ? (
            <div className="mt-3 rounded-card border border-white/10 bg-panel p-5">
              <p className="eyebrow mb-3">Recent champions</p>
              <ul className="divide-y divide-white/8">
                {stats.recentWinners.map((game) => (
                  <li key={game.code} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/history/${game.code}`}
                        className="truncate text-sm font-bold text-cream hover:text-accent"
                      >
                        {game.winners.join(' & ') || 'No winner'}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {game.name} · {timeAgo(game.finishedAt)}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-bold text-gold">
                      {credits(game.power)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
