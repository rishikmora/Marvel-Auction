'use client';

import { useState } from 'react';
import type { AuctionState, Character } from '@/game/types';
import type { PublicGameState } from '@/lib/protocol';
import { cn } from '@/lib/cn';
import { credits } from '@/lib/format';
import { request } from '@/lib/socket-client';
import { Button } from './ui/Button';
import { Badge } from './ui/Primitives';

type Command =
  | 'host:reveal'
  | 'host:open'
  | 'host:pause'
  | 'host:resume'
  | 'host:extend'
  | 'host:sell'
  | 'host:pass'
  | 'host:next'
  | 'host:end'
  | 'host:cancel';

/**
 * The host console.
 *
 * Buttons are disabled for transitions the state machine would reject, which keeps the
 * panel honest — but the server validates every command regardless of what the UI allows.
 */
export function HostControls({
  state,
  characters,
  className,
}: {
  state: PublicGameState;
  characters: Map<string, Character>;
  className?: string;
}) {
  const [pending, setPending] = useState<Command | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const auction = state.auction;
  const phase: AuctionState = auction.state;
  const finished = state.status !== 'ACTIVE';

  const send = async (command: Command, payload: Record<string, unknown> = {}) => {
    setPending(command);
    setError(null);
    const response = await request(command, payload);
    setPending(null);
    if (!response.ok) setError(response.error?.message ?? 'That action was rejected.');
  };

  const can = {
    reveal: !finished && ['WAITING', 'SOLD', 'PASSED'].includes(phase) && state.remainingPool.length > 0,
    open: !finished && phase === 'CHARACTER_REVEALED',
    pause: !finished && phase === 'BIDDING',
    resume: !finished && phase === 'PAUSED',
    extend: !finished && ['BIDDING', 'PAUSED'].includes(phase),
    sell: !finished && ['BIDDING', 'PAUSED'].includes(phase) && Boolean(auction.highestBidderId),
    pass: !finished && ['CHARACTER_REVEALED', 'BIDDING', 'PAUSED'].includes(phase),
    next: !finished && ['SOLD', 'PASSED'].includes(phase),
  };

  const available = state.remainingPool
    .map((id) => characters.get(id))
    .filter((character): character is Character => Boolean(character));

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={phase === 'BIDDING' ? 'crimson' : 'neutral'}>{phase.replace('_', ' ')}</Badge>
        <Badge tone="neutral">Round {auction.round}</Badge>
        <Badge tone="neutral">{state.remainingPool.length} in vault</Badge>
        {auction.awaitingHostSale ? <Badge tone="gold">Confirm sale</Badge> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          disabled={!can.reveal || pending !== null}
          loading={pending === 'host:reveal'}
          onClick={() => void send('host:reveal')}
        >
          Reveal next
        </Button>
        <Button
          variant="gold"
          disabled={!can.open || pending !== null}
          loading={pending === 'host:open'}
          onClick={() => void send('host:open')}
        >
          Start auction
        </Button>

        <Button
          variant="secondary"
          disabled={!(can.pause || can.resume) || pending !== null}
          onClick={() => void send(can.pause ? 'host:pause' : 'host:resume')}
        >
          {can.pause ? 'Pause' : 'Resume'}
        </Button>
        <Button
          variant="secondary"
          disabled={!can.extend || pending !== null}
          onClick={() => void send('host:extend', { seconds: 10 })}
        >
          +10s
        </Button>

        <Button
          variant="primary"
          disabled={!can.sell || pending !== null}
          loading={pending === 'host:sell'}
          onClick={() => void send('host:sell')}
        >
          Sell now
        </Button>
        <Button
          variant="danger"
          disabled={!can.pass || pending !== null}
          onClick={() => void send('host:pass')}
        >
          Pass
        </Button>

        <Button
          variant="outline"
          className="col-span-2"
          disabled={!can.next || pending !== null}
          onClick={() => void send('host:next')}
        >
          Next character
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          disabled={!can.reveal}
          onClick={() => setPickerOpen((open) => !open)}
        >
          {pickerOpen ? 'Hide vault' : 'Choose a character'}
        </Button>
        <Button
          variant={confirmEnd ? 'primary' : 'danger'}
          size="sm"
          className="flex-1"
          disabled={finished || pending !== null}
          onClick={() => {
            if (!confirmEnd) {
              setConfirmEnd(true);
              window.setTimeout(() => setConfirmEnd(false), 4000);
              return;
            }
            void send('host:end');
            setConfirmEnd(false);
          }}
        >
          {confirmEnd ? 'Confirm end' : 'End auction'}
        </Button>
      </div>

      {pickerOpen ? (
        <div className="scroll-thin max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2">
          {available.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-[var(--text-low)]">
              The vault is empty.
            </p>
          ) : (
            available.map((character) => (
              <button
                key={character.id}
                type="button"
                onClick={() => {
                  void send('host:reveal', { characterId: character.id });
                  setPickerOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-white/[0.07]"
              >
                <span className="truncate font-semibold text-white">{character.name}</span>
                <span className="tabular shrink-0 text-gold">{credits(character.basePrice)}</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] text-accent-soft">
          {error}
        </p>
      ) : null}
    </div>
  );
}
