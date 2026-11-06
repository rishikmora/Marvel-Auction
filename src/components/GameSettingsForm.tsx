'use client';

import { useMemo, useState } from 'react';
import { GAME_MODES, UNIVERSE_LABELS, ALL_UNIVERSES, DEFAULT_SCORING, normalizeWeights } from '@/game/config';
import type { GameSettings, GameSettingsPatch, StatKey, Universe } from '@/game/types';
import { STAT_KEYS, STAT_LABELS } from '@/game/types';
import { cn } from '@/lib/cn';
import { Field, NumberInput, Select, TextInput, Toggle, ChipGroup } from './ui/Field';
import { Button } from './ui/Button';

export type SettingsDraft = GameSettings;

/**
 * One settings editor, shared by the create screen and the lobby.
 * Every field maps directly onto GameSettings, which is what the server stores.
 */
export function GameSettingsForm({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: SettingsDraft;
  onChange: (patch: GameSettingsPatch) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [showScoring, setShowScoring] = useState(false);

  const weights = useMemo(
    () => normalizeWeights(value.scoring?.weights ?? DEFAULT_SCORING.weights),
    [value.scoring?.weights],
  );
  const weightTotal = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  const setWeight = (key: StatKey, percent: number) => {
    onChange({
      scoring: {
        ...value.scoring,
        weights: { ...value.scoring.weights, [key]: Math.max(0, percent) / 100 },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* ------------------------- basics ------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Game name">
          {({ id }) => (
            <TextInput
              id={id}
              value={value.name}
              maxLength={40}
              disabled={disabled}
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder="Friday Night Draft"
            />
          )}
        </Field>

        <Field label="Game mode" hint={GAME_MODES.find((mode) => mode.id === value.mode)?.tagline}>
          {({ id }) => (
            <Select
              id={id}
              value={value.mode}
              disabled={disabled}
              onChange={(event) => onChange({ mode: event.target.value as GameSettings['mode'] })}
            >
              {GAME_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Starting budget" hint="Credits each player receives">
          {({ id }) => (
            <NumberInput
              id={id}
              min={100}
              max={100000}
              step={50}
              value={value.startingBudget}
              disabled={disabled}
              onChange={(event) => onChange({ startingBudget: Number(event.target.value) })}
            />
          )}
        </Field>
        <Field label="Roster size" hint="Characters per team">
          {({ id }) => (
            <NumberInput
              id={id}
              min={1}
              max={12}
              value={value.maxRoster}
              disabled={disabled}
              onChange={(event) => onChange({ maxRoster: Number(event.target.value) })}
            />
          )}
        </Field>
        <Field label="Min increment" hint="Smallest raise allowed">
          {({ id }) => (
            <NumberInput
              id={id}
              min={1}
              max={500}
              value={value.minIncrement}
              disabled={disabled}
              onChange={(event) => onChange({ minIncrement: Number(event.target.value) })}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Auction timer" hint="Seconds per character">
          {({ id }) => (
            <NumberInput
              id={id}
              min={5}
              max={300}
              value={value.auctionSeconds}
              disabled={disabled}
              onChange={(event) => onChange({ auctionSeconds: Number(event.target.value) })}
            />
          )}
        </Field>
        <Field label="Min players">
          {({ id }) => (
            <NumberInput
              id={id}
              min={1}
              max={24}
              value={value.minPlayers}
              disabled={disabled}
              onChange={(event) => onChange({ minPlayers: Number(event.target.value) })}
            />
          )}
        </Field>
        <Field label="Max players">
          {({ id }) => (
            <NumberInput
              id={id}
              min={2}
              max={24}
              value={value.maxPlayers}
              disabled={disabled}
              onChange={(event) => onChange({ maxPlayers: Number(event.target.value) })}
            />
          )}
        </Field>
      </div>

      {/* ------------------------ universes ----------------------- */}
      <div>
        <p className="eyebrow mb-2">Universes in the vault</p>
        <ChipGroup<Universe>
          label="Universes"
          multiple
          value={value.categories}
          onChange={(next) => onChange({ categories: next })}
          options={ALL_UNIVERSES.map((universe) => ({
            value: universe,
            label: UNIVERSE_LABELS[universe],
          }))}
        />
        <p className="mt-2 text-[11px] text-[var(--text-low)]">
          {value.categories.length === 0
            ? 'Nothing selected — every universe is in play.'
            : `${value.categories.length} selected.`}
        </p>
      </div>

      {/* ------------------------- rules -------------------------- */}
      <div className={cn('grid gap-2', compact ? 'sm:grid-cols-1' : 'sm:grid-cols-2')}>
        <Toggle
          checked={value.antiSnipeEnabled}
          disabled={disabled}
          onChange={(next) => onChange({ antiSnipeEnabled: next })}
          label="Anti-snipe"
          description={`A bid inside the last ${value.antiSnipeThresholdSeconds}s pushes the clock out by ${value.antiSnipeExtensionSeconds}s.`}
        />
        <Toggle
          checked={value.manualSaleConfirmation}
          disabled={disabled}
          onChange={(next) => onChange({ manualSaleConfirmation: next })}
          label="Manual sale confirmation"
          description="The clock expiring arms the sale; the host presses SELL NOW to close it."
        />
        <Toggle
          checked={value.reserveBudgetForSlots}
          disabled={disabled}
          onChange={(next) => onChange({ reserveBudgetForSlots: next })}
          label="Reserve budget for empty slots"
          description="Stops players spending so hard they cannot fill their remaining roster."
        />
        <Toggle
          checked={value.hostPlays}
          disabled={disabled}
          onChange={(next) => onChange({ hostPlays: next })}
          label="Host also plays"
          description="Turn off to run the auction as a neutral auctioneer."
        />
        <Toggle
          checked={value.passVoteEnabled}
          disabled={disabled}
          onChange={(next) => onChange({ passVoteEnabled: next })}
          label="Let players skip a lot"
          description="If every player who could still bid votes to skip, the lot is passed and the next character appears."
        />
        <Toggle
          checked={value.allowReconnectBidding}
          disabled={disabled}
          onChange={(next) => onChange({ allowReconnectBidding: next })}
          label="Allow bidding while reconnecting"
          description="Players on a flaky connection keep their seat at the table."
        />
        <Toggle
          checked={value.isPrivate}
          disabled={disabled}
          onChange={(next) => onChange({ isPrivate: next, password: next ? value.password : null })}
          label="Private room"
          description="Hidden from the public list and protected by a password."
        />
      </div>

      {value.antiSnipeEnabled ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Anti-snipe window" hint="Seconds before the end that trigger an extension">
            {({ id }) => (
              <NumberInput
                id={id}
                min={1}
                max={60}
                value={value.antiSnipeThresholdSeconds}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ antiSnipeThresholdSeconds: Number(event.target.value) })
                }
              />
            )}
          </Field>
          <Field label="Extension length" hint="Seconds added when it triggers">
            {({ id }) => (
              <NumberInput
                id={id}
                min={1}
                max={60}
                value={value.antiSnipeExtensionSeconds}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ antiSnipeExtensionSeconds: Number(event.target.value) })
                }
              />
            )}
          </Field>
        </div>
      ) : null}

      {value.isPrivate ? (
        <Field label="Room password" hint="Players must enter this to join">
          {({ id }) => (
            <TextInput
              id={id}
              value={value.password ?? ''}
              maxLength={40}
              disabled={disabled}
              onChange={(event) => onChange({ password: event.target.value })}
              placeholder="Set a password"
            />
          )}
        </Field>
      ) : null}

      {/* ------------------------ scoring ------------------------- */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="display text-sm text-white">Scoring model</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-low)]">
              Preview and tune the formula before anyone bids. Nothing is hidden from players.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowScoring((open) => !open)}>
            {showScoring ? 'Hide' : 'Configure'}
          </Button>
        </div>

        {showScoring ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              {STAT_KEYS.map((key) => (
                <div key={key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3">
                  <label htmlFor={`w-${key}`} className="text-[11px] text-[var(--text-mid)]">
                    {STAT_LABELS[key]}
                  </label>
                  <input
                    id={`w-${key}`}
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    disabled={disabled}
                    value={Math.round((value.scoring.weights[key] ?? 0) * 100)}
                    onChange={(event) => setWeight(key, Number(event.target.value))}
                    className="accent-accent"
                  />
                  <span className="tabular text-right text-[11px] font-bold text-white">
                    {Math.round(weights[key] * 100)}%
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-[var(--text-low)]">
                Weights are normalised automatically — they always add up to 100%
                {weightTotal > 0 ? '' : ' (falls back to defaults if all are zero)'}.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Max synergy" hint="% of character power">
                {({ id }) => (
                  <NumberInput
                    id={id}
                    min={0}
                    max={50}
                    value={Math.round(value.scoring.maxSynergyPct * 100)}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        scoring: { ...value.scoring, maxSynergyPct: Number(event.target.value) / 100 },
                      })
                    }
                  />
                )}
              </Field>
              <Field label="Max balance" hint="% of character power">
                {({ id }) => (
                  <NumberInput
                    id={id}
                    min={0}
                    max={50}
                    value={Math.round(value.scoring.maxBalancePct * 100)}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        scoring: { ...value.scoring, maxBalancePct: Number(event.target.value) / 100 },
                      })
                    }
                  />
                )}
              </Field>
              <Field label="Max leadership" hint="% of character power">
                {({ id }) => (
                  <NumberInput
                    id={id}
                    min={0}
                    max={50}
                    value={Math.round(value.scoring.maxLeadershipPct * 100)}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        scoring: {
                          ...value.scoring,
                          maxLeadershipPct: Number(event.target.value) / 100,
                        },
                      })
                    }
                  />
                )}
              </Field>
            </div>

            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange({ scoring: DEFAULT_SCORING })}
            >
              Reset to defaults
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
