'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AVATARS } from '@/game/config';
import type { GameSettingsPatch } from '@/game/types';
import type { PublicGameState, ViewerState } from '@/lib/protocol';
import { avatarSvg } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { credits, UNIVERSE_NAME } from '@/lib/format';
import { displayCode } from '@/lib/room-code';
import { request } from '@/lib/socket-client';
import { GameSettingsForm } from './GameSettingsForm';
import { Button } from './ui/Button';
import { Badge, Panel } from './ui/Primitives';

export function GameLobby({
  state,
  viewer,
  onError,
}: {
  state: PublicGameState;
  viewer: ViewerState;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState<'players' | 'settings'>('players');
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const isHost = viewer.isHost;
  const contenders = state.players.filter((player) => !player.isSpectator);
  const ready = contenders.filter((player) => player.ready || player.isHost).length;
  const enough = contenders.length >= state.settings.minPlayers;
  const me = state.players.find((player) => player.id === viewer.playerId);

  const send = async (event: Parameters<typeof request>[0], payload: unknown = {}) => {
    const response = await request(event, payload);
    if (!response.ok) onError(response.error?.message ?? 'That action was rejected.');
    return response.ok;
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(displayCode(state.code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onError('Could not copy — select the code manually.');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ------------------------- main ------------------------- */}
      <div className="space-y-5">
        <Panel glow className="overflow-hidden">
          <div className="relative p-5 sm:p-6">
            <div className="grid-bg pointer-events-none absolute inset-0 opacity-20" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow">Room code</p>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="no-tap-highlight group mt-1 flex items-center gap-2"
                >
                  <span className="display text-3xl text-white sm:text-4xl">
                    {displayCode(state.code)}
                  </span>
                  <span className="rounded-md border border-white/12 bg-white/[0.05] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-low)] group-hover:text-white">
                    {copied ? 'Copied' : 'Copy'}
                  </span>
                </button>
                <p className="mt-2 text-sm text-[var(--text-mid)]">{state.settings.name}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge tone="crimson">{state.settings.mode.replace(/_/g, ' ')}</Badge>
                <Badge tone="gold">{credits(state.settings.startingBudget)} credits</Badge>
                <Badge tone="plasma">{state.settings.maxRoster} slots</Badge>
                <Badge>{state.settings.auctionSeconds}s clock</Badge>
                {state.settings.isPrivate ? <Badge tone="vibranium">Private</Badge> : null}
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
          {(['players', 'settings'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'no-tap-highlight flex-1 rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
                tab === key ? 'bg-accent text-ink' : 'text-muted hover:text-cream',
              )}
            >
              {key === 'players' ? `Players (${state.players.length})` : 'Game settings'}
            </button>
          ))}
        </div>

        {tab === 'players' ? (
          <Panel className="p-4 sm:p-5">
            <ul className="grid gap-2 sm:grid-cols-2">
              {state.players.map((player) => (
                <motion.li
                  key={player.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                    player.id === viewer.playerId
                      ? 'border-sky/40 bg-sky/[0.06]'
                      : 'border-white/8 bg-white/[0.02]',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarSvg(player.avatar)}
                    alt=""
                    aria-hidden
                    className="h-10 w-10 shrink-0 rounded-lg border border-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{player.teamName}</p>
                    <p className="truncate text-[11px] text-[var(--text-low)]">{player.name}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {player.isHost ? <Badge tone="gold">Host</Badge> : null}
                    {player.isSpectator ? (
                      <Badge>Spectator</Badge>
                    ) : player.ready || player.isHost ? (
                      <Badge tone="toxic">Ready</Badge>
                    ) : (
                      <Badge>Waiting</Badge>
                    )}
                    {isHost && !player.isHost ? (
                      <button
                        type="button"
                        onClick={() => void send('host:kick', { playerId: player.id })}
                        className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-soft hover:text-accent"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </motion.li>
              ))}

              {Array.from({
                length: Math.max(0, state.settings.minPlayers - state.players.length),
              }).map((_, index) => (
                <li
                  key={`slot-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-white/10 px-3 py-2.5"
                >
                  <div className="h-10 w-10 shrink-0 rounded-lg border border-dashed border-white/10" />
                  <p className="text-xs text-[var(--text-low)]">Waiting for rivals…</p>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel className="p-4 sm:p-5">
            {isHost ? (
              <GameSettingsForm
                value={state.settings}
                onChange={(patch: GameSettingsPatch) => void send('host:settings', { patch })}
              />
            ) : (
              <ReadOnlySettings state={state} />
            )}
          </Panel>
        )}
      </div>

      {/* ------------------------ sidebar ----------------------- */}
      <div className="space-y-4">
        <Panel className="p-4">
          <p className="eyebrow mb-3">Your identity</p>
          {me ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="team-name" className="eyebrow mb-1.5 block">
                  Team name
                </label>
                <input
                  id="team-name"
                  value={me.teamName}
                  maxLength={28}
                  disabled={state.status !== 'LOBBY'}
                  onChange={(event) =>
                    void send('player:profile', { teamName: event.target.value })
                  }
                  className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-sm text-white focus:border-sky/60 disabled:opacity-50"
                />
              </div>

              <div>
                <p className="eyebrow mb-1.5">Emblem</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {AVATARS.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      aria-label={`Emblem ${avatar}`}
                      aria-pressed={me.avatar === avatar}
                      disabled={state.status !== 'LOBBY'}
                      onClick={() => void send('player:profile', { avatar })}
                      className={cn(
                        'no-tap-highlight aspect-square overflow-hidden rounded-lg border transition-colors',
                        me.avatar === avatar
                          ? 'border-accent ring-1 ring-accent/50'
                          : 'border-white/10 hover:border-white/25',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatarSvg(avatar)} alt="" aria-hidden className="h-full w-full" />
                    </button>
                  ))}
                </div>
              </div>

              {!me.isHost ? (
                <Button
                  variant={me.ready ? 'secondary' : 'primary'}
                  className="w-full"
                  onClick={() => void send('player:ready', { ready: !me.ready })}
                >
                  {me.ready ? 'Not ready' : "I'm ready"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Panel>

        {isHost ? (
          <Panel glow className="p-4">
            <p className="eyebrow mb-2">Host controls</p>
            <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-low)]">
              {enough
                ? `${ready} of ${contenders.length} bidders ready. You can start whenever you like.`
                : `Need at least ${state.settings.minPlayers} bidders — ${contenders.length} in the room.`}
            </p>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              loading={starting}
              disabled={!enough || starting}
              onClick={async () => {
                setStarting(true);
                await send('host:start');
                setStarting(false);
              }}
            >
              Start auction
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="mt-2 w-full"
              onClick={() => void send('host:cancel')}
            >
              Cancel room
            </Button>
          </Panel>
        ) : (
          <Panel className="p-4 text-center">
            <p className="eyebrow mb-1">Waiting on the host</p>
            <p className="text-xs text-[var(--text-low)]">
              {state.players.find((player) => player.isHost)?.name ?? 'The host'} starts the auction
              when everyone is ready.
            </p>
          </Panel>
        )}

        <Panel className="p-4">
          <p className="eyebrow mb-2">Vault</p>
          <p className="tabular display text-2xl text-white">{state.remainingPool.length}</p>
          <p className="mt-1 text-[11px] text-[var(--text-low)]">
            characters available across{' '}
            {state.settings.categories.length === 0
              ? 'every universe'
              : state.settings.categories.map((c) => UNIVERSE_NAME[c]).join(', ')}
            .
          </p>
        </Panel>
      </div>
    </div>
  );
}

function ReadOnlySettings({ state }: { state: PublicGameState }) {
  const rows: [string, string][] = [
    ['Mode', state.settings.mode.replace(/_/g, ' ')],
    ['Starting budget', `${credits(state.settings.startingBudget)} credits`],
    ['Roster size', `${state.settings.maxRoster} characters`],
    ['Auction timer', `${state.settings.auctionSeconds}s`],
    ['Minimum increment', `${credits(state.settings.minIncrement)} credits`],
    [
      'Anti-snipe',
      state.settings.antiSnipeEnabled
        ? `+${state.settings.antiSnipeExtensionSeconds}s inside the last ${state.settings.antiSnipeThresholdSeconds}s`
        : 'Disabled',
    ],
    ['Sale confirmation', state.settings.manualSaleConfirmation ? 'Host confirms' : 'Automatic'],
    ['Budget reserve', state.settings.reserveBudgetForSlots ? 'On' : 'Off'],
    [
      'Universes',
      state.settings.categories.length === 0
        ? 'All'
        : state.settings.categories.map((c) => UNIVERSE_NAME[c]).join(', '),
    ],
  ];

  return (
    <dl className="divide-y divide-white/6">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-xs text-[var(--text-low)]">{label}</dt>
          <dd className="text-right text-xs font-bold text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
