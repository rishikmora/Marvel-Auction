'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AVATARS, DEFAULT_SETTINGS, GAME_MODE_MAP, applyMode } from '@/game/config';
import type { GameSettings, GameSettingsPatch } from '@/game/types';
import type { JoinResult } from '@/lib/protocol';
import { avatarSvg } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { loadIdentity, saveIdentity, saveSession } from '@/lib/session';
import { request } from '@/lib/socket-client';
import { GameSettingsForm } from '@/components/GameSettingsForm';
import { PageShell } from '@/components/SiteChrome';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Panel, SectionTitle } from '@/components/ui/Primitives';

function CreateForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const identity = loadIdentity();
    if (identity) {
      setName(identity.name);
      setTeamName(identity.teamName);
      setAvatar(identity.avatar);
    }
  }, []);

  // The landing page links straight to a mode; apply it once on arrival.
  useEffect(() => {
    const requested = search?.get('mode');
    if (!requested || !(requested in GAME_MODE_MAP)) return;
    setSettings((current) => applyMode(current, requested as GameSettings['mode']));
  }, [search]);

  const patch = (next: GameSettingsPatch) => {
    setSettings((current) => {
      const merged: GameSettings = {
        ...current,
        ...next,
        scoring: { ...current.scoring, ...(next.scoring ?? {}) },
      } as GameSettings;
      // Selecting a mode applies its overlay; other edits leave the mode alone.
      return next.mode ? applyMode(merged, next.mode) : merged;
    });
  };

  const create = async () => {
    if (!name.trim()) {
      setError('Enter your name so players know who is hosting.');
      return;
    }
    setCreating(true);
    setError(null);

    const response = await request<JoinResult>('room:create', {
      settings,
      host: { name: name.trim(), teamName: teamName.trim(), avatar },
    });
    setCreating(false);

    if (!response.ok || !response.data) {
      setError(response.error?.message ?? 'Could not create the auction.');
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
        eyebrow="Host a game"
        title="Create auction"
        description="Set the rules, get a room code, and invite your rivals. Everything here can still be changed from the lobby before you start."
      />

      <div className="space-y-5">
        <Panel className="p-5">
          <p className="eyebrow mb-4">You</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={name}
                  maxLength={20}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Tony"
                  autoComplete="nickname"
                />
              )}
            </Field>
            <Field label="Team name" hint="Leave blank and we will name it after you">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={teamName}
                  maxLength={28}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="Team Alpha"
                />
              )}
            </Field>
          </div>

          <p className="eyebrow mb-2 mt-4">Emblem</p>
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
        </Panel>

        <Panel className="p-5">
          <p className="eyebrow mb-4">Auction rules</p>
          <GameSettingsForm value={settings} onChange={patch} />
        </Panel>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-soft"
          >
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-4 z-10">
          <Button
            variant="primary"
            size="xl"
            className="w-full"
            loading={creating}
            disabled={creating}
            onClick={() => void create()}
          >
            Create auction room
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

/* useSearchParams needs a Suspense boundary for static prerendering. */
export default function CreatePage() {
  return (
    <Suspense
      fallback={
        <PageShell className="max-w-4xl">
          <p className="py-20 text-center text-sm text-muted">Loading…</p>
        </PageShell>
      }
    >
      <CreateForm />
    </Suspense>
  );
}
