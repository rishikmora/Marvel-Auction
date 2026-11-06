'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AVATARS } from '@/game/config';
import type { JoinResult } from '@/lib/protocol';
import { avatarSvg } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { displayCode, normalizeCode } from '@/lib/room-code';
import { loadIdentity, saveIdentity, saveSession } from '@/lib/session';
import { request } from '@/lib/socket-client';
import { PageShell } from '@/components/SiteChrome';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { EmptyState, Panel, SectionTitle } from '@/components/ui/Primitives';

interface PublicRoom {
  code: string;
  name: string;
  mode: string;
  players: number;
  maxPlayers: number;
  hostName: string;
}

function JoinForm() {
  const router = useRouter();
  const search = useSearchParams();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);

  useEffect(() => {
    const prefill = search?.get('code');
    if (prefill) setCode(displayCode(normalizeCode(prefill)));

    const identity = loadIdentity();
    if (identity) {
      setName(identity.name);
      setTeamName(identity.teamName);
      setAvatar(identity.avatar);
    }

    void fetch('/api/rooms')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { rooms: PublicRoom[] } | null) => setRooms(data?.rooms ?? []))
      .catch(() => setRooms([]));
  }, [search]);

  const join = async (targetCode?: string) => {
    const normalized = normalizeCode(targetCode ?? code);
    if (normalized.length < 4) {
      setError('Enter the full room code, for example MARVEL-X7K9QM.');
      return;
    }
    if (!name.trim()) {
      setError('Enter a display name.');
      return;
    }

    setJoining(true);
    setError(null);
    const response = await request<JoinResult>('room:join', {
      code: normalized,
      name: name.trim(),
      teamName: teamName.trim(),
      avatar,
      password: password || undefined,
    });
    setJoining(false);

    if (!response.ok || !response.data) {
      if (response.error?.code === 'BAD_PASSWORD') setNeedsPassword(true);
      setError(response.error?.message ?? 'Could not join that auction.');
      return;
    }

    saveIdentity({ name: name.trim(), teamName: teamName.trim(), avatar });
    saveSession({
      code: response.data.code,
      playerId: response.data.playerId,
      token: response.data.token,
      name: name.trim(),
    });
    router.push(`/room/${response.data.code}`);
  };

  return (
    <PageShell className="max-w-4xl">
      <SectionTitle
        eyebrow="Take a seat"
        title="Join auction"
        description="Enter the room code your host shared, pick a team name, and get ready to bid."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="p-5">
          <div className="space-y-4">
            <Field label="Room code" hint="Case does not matter — MARVEL- prefix optional">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="MARVEL-X7K9QM"
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="tabular text-lg tracking-[0.18em]"
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={name}
                    maxLength={20}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Natasha"
                    autoComplete="nickname"
                  />
                )}
              </Field>
              <Field label="Team name" hint="Optional">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={teamName}
                    maxLength={28}
                    onChange={(event) => setTeamName(event.target.value)}
                    placeholder="Team Omega"
                  />
                )}
              </Field>
            </div>

            {needsPassword ? (
              <Field label="Room password" error={error}>
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter the password"
                  />
                )}
              </Field>
            ) : null}

            <div>
              <p className="eyebrow mb-2">Emblem</p>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
                {AVATARS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    aria-label={`Emblem ${entry}`}
                    aria-pressed={avatar === entry}
                    onClick={() => setAvatar(entry)}
                    className={cn(
                      'no-tap-highlight aspect-square overflow-hidden rounded-lg border transition-colors',
                      avatar === entry
                        ? 'border-accent ring-1 ring-accent/50'
                        : 'border-white/10 hover:border-white/30',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarSvg(entry)} alt="" aria-hidden className="h-full w-full" />
                  </button>
                ))}
              </div>
            </div>

            {error && !needsPassword ? (
              <p
                role="alert"
                className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-soft"
              >
                {error}
              </p>
            ) : null}

            <Button
              variant="primary"
              size="xl"
              className="w-full"
              loading={joining}
              disabled={joining}
              onClick={() => void join()}
            >
              Join auction
            </Button>
          </div>
        </Panel>

        <Panel className="p-5">
          <p className="eyebrow mb-3">Open rooms</p>
          {rooms.length === 0 ? (
            <EmptyState
              title="No public rooms"
              description="Nobody has an open lobby right now. Ask your host for a code, or start your own."
            />
          ) : (
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li key={room.code}>
                  <button
                    type="button"
                    onClick={() => setCode(displayCode(room.code))}
                    className="w-full rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08]"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold text-white">{room.name}</span>
                      <span className="tabular shrink-0 text-[11px] text-[var(--text-low)]">
                        {room.players}/{room.maxPlayers}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-[var(--text-low)]">
                      {displayCode(room.code)} · host {room.hostName} · {room.mode.replace(/_/g, ' ')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <PageShell className="max-w-4xl">
          <p className="py-20 text-center text-sm text-[var(--text-low)]">Loading…</p>
        </PageShell>
      }
    >
      <JoinForm />
    </Suspense>
  );
}
