'use client';

import { useMemo, useState } from 'react';
import { ALL_UNIVERSES, UNIVERSE_LABELS } from '@/game/config';
import { characterRating } from '@/game/scoring';
import type { Character, Rarity, Role, StatKey, Tier, Universe } from '@/game/types';
import { STAT_KEYS, STAT_LABELS } from '@/game/types';
import { characterImage } from '@/lib/character-art';
import { cn } from '@/lib/cn';
import { credits, ROLE_NAME } from '@/lib/format';
import { Button } from './ui/Button';
import { Field, NumberInput, Select, TextInput, ChipGroup } from './ui/Field';
import { Badge, EmptyState, Panel } from './ui/Primitives';

const ROLES: Role[] = [
  'TANK',
  'DAMAGE',
  'SUPPORT',
  'LEADER',
  'STRATEGIST',
  'SPEEDSTER',
  'RANGED',
  'MAGICAL',
  'COSMIC',
  'TECH',
  'MUTANT',
  'ASSASSIN',
];
const TIERS: Tier[] = ['STREET', 'ENHANCED', 'ELITE', 'COSMIC', 'OMEGA'];
const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

function blankCharacter(): Character {
  return {
    id: '',
    name: '',
    alias: '',
    universe: 'AVENGERS',
    categories: ['AVENGERS'],
    roles: ['DAMAGE'],
    stats: {
      strength: 50,
      speed: 50,
      durability: 50,
      intelligence: 50,
      combat: 50,
      energy: 50,
      versatility: 50,
      leadership: 50,
      specialAbility: 50,
    },
    tier: 'ENHANCED',
    rarity: 'RARE',
    basePrice: 80,
    description: '',
    specialAbilities: [],
    synergyTags: [],
    palette: ['#e01b3c', '#3fd0ff'],
    glyph: '??',
  };
}

/** Full CRUD over the character catalogue, backed by the admin API. */
export function AdminCharacterManager({
  characters,
  token,
  onChanged,
}: {
  characters: Character[];
  token: string;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [universe, setUniverse] = useState<string>('all');
  const [draft, setDraft] = useState<Character | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const filtered = useMemo(() => {
    let list = characters;
    if (universe !== 'all') {
      list = list.filter((character) => character.categories.includes(universe as Universe));
    }
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter(
        (character) =>
          character.name.toLowerCase().includes(needle) ||
          character.alias.toLowerCase().includes(needle) ||
          character.id.includes(needle),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [characters, universe, query]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setMessage(null);

    const response = await fetch(
      isNew ? '/api/characters' : `/api/characters/${encodeURIComponent(draft.id)}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(draft),
      },
    );
    setBusy(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage({ tone: 'error', text: body.error ?? 'Save failed.' });
      return;
    }
    setMessage({ tone: 'ok', text: `${draft.name} saved.` });
    setDraft(null);
    setIsNew(false);
    onChanged();
  };

  const remove = async (character: Character) => {
    setBusy(true);
    const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': token },
    });
    setBusy(false);
    if (!response.ok) {
      setMessage({ tone: 'error', text: 'Delete failed.' });
      return;
    }
    setMessage({ tone: 'ok', text: `${character.name} removed from the catalogue.` });
    setDraft(null);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search characters"
          aria-label="Search characters"
          className="min-w-[200px] flex-1 rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-[var(--text-low)]"
        />
        <select
          value={universe}
          onChange={(event) => setUniverse(event.target.value)}
          aria-label="Filter by universe"
          className="rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-sm text-white"
        >
          <option value="all">All universes</option>
          {ALL_UNIVERSES.map((entry) => (
            <option key={entry} value={entry}>
              {UNIVERSE_LABELS[entry]}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={() => {
            setDraft(blankCharacter());
            setIsNew(true);
          }}
        >
          Add character
        </Button>
      </div>

      {message ? (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            message.tone === 'ok'
              ? 'border-mint/30 bg-mint/10 text-mint'
              : 'border-accent/30 bg-accent/10 text-accent-soft',
          )}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Panel className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState title="The vault is empty" description="No characters match that filter." />
          ) : (
            <ul className="scroll-thin max-h-[60vh] divide-y divide-white/6 overflow-y-auto">
              {filtered.map((character) => (
                <li key={character.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...character, stats: { ...character.stats } });
                      setIsNew(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]',
                      draft?.id === character.id && !isNew && 'bg-white/[0.07]',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={characterImage(character)}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      className="h-12 w-9 shrink-0 rounded border border-white/10 object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white">
                        {character.name}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--text-low)]">
                        {character.id} · {UNIVERSE_LABELS[character.universe]}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block text-sm font-bold text-sky">
                        {characterRating(character)}
                      </span>
                      <span className="tabular block text-[10px] text-gold">
                        {credits(character.basePrice)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="p-4">
          {!draft ? (
            <EmptyState
              title="Nothing selected"
              description="Pick a character to edit, or add a new one to the catalogue."
            />
          ) : (
            <div className="scroll-thin max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="display text-base text-white">
                  {isNew ? 'New character' : draft.name}
                </h3>
                <Badge tone="neutral">{characterRating(draft)} power</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ID" hint="lowercase-with-hyphens">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={draft.id}
                      disabled={!isNew}
                      onChange={(event) =>
                        setDraft({ ...draft, id: event.target.value.toLowerCase() })
                      }
                    />
                  )}
                </Field>
                <Field label="Name">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Alias">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={draft.alias}
                      onChange={(event) => setDraft({ ...draft, alias: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Glyph" hint="2–3 characters for generated art">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={draft.glyph}
                      maxLength={4}
                      onChange={(event) => setDraft({ ...draft, glyph: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Primary universe">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={draft.universe}
                      onChange={(event) =>
                        setDraft({ ...draft, universe: event.target.value as Universe })
                      }
                    >
                      {ALL_UNIVERSES.map((entry) => (
                        <option key={entry} value={entry}>
                          {UNIVERSE_LABELS[entry]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Base price">
                  {({ id }) => (
                    <NumberInput
                      id={id}
                      min={1}
                      max={5000}
                      value={draft.basePrice}
                      onChange={(event) =>
                        setDraft({ ...draft, basePrice: Number(event.target.value) })
                      }
                    />
                  )}
                </Field>
                <Field label="Tier">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={draft.tier}
                      onChange={(event) => setDraft({ ...draft, tier: event.target.value as Tier })}
                    >
                      {TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {tier}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Rarity">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={draft.rarity}
                      onChange={(event) =>
                        setDraft({ ...draft, rarity: event.target.value as Rarity })
                      }
                    >
                      {RARITIES.map((rarity) => (
                        <option key={rarity} value={rarity}>
                          {rarity}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <Field label="Description">
                {({ id }) => (
                  <textarea
                    id={id}
                    value={draft.description}
                    maxLength={280}
                    rows={3}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    className="w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-sm text-white"
                  />
                )}
              </Field>

              <div>
                <p className="eyebrow mb-2">Categories</p>
                <ChipGroup<Universe>
                  label="Categories"
                  multiple
                  value={draft.categories}
                  onChange={(next) =>
                    setDraft({ ...draft, categories: next.length ? next : [draft.universe] })
                  }
                  options={ALL_UNIVERSES.map((entry) => ({
                    value: entry,
                    label: UNIVERSE_LABELS[entry],
                  }))}
                />
              </div>

              <div>
                <p className="eyebrow mb-2">Roles</p>
                <ChipGroup<Role>
                  label="Roles"
                  multiple
                  value={draft.roles}
                  onChange={(next) => setDraft({ ...draft, roles: next.length ? next : ['DAMAGE'] })}
                  options={ROLES.map((role) => ({ value: role, label: ROLE_NAME[role] }))}
                />
              </div>

              <div>
                <p className="eyebrow mb-2">Stats</p>
                <div className="space-y-1.5">
                  {STAT_KEYS.map((key: StatKey) => (
                    <div key={key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2">
                      <label htmlFor={`stat-${key}`} className="text-[11px] text-[var(--text-mid)]">
                        {STAT_LABELS[key]}
                      </label>
                      <input
                        id={`stat-${key}`}
                        type="range"
                        min={0}
                        max={100}
                        value={draft.stats[key]}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            stats: { ...draft.stats, [key]: Number(event.target.value) },
                          })
                        }
                        className="accent-accent"
                      />
                      <span className="tabular text-right text-[11px] font-bold text-white">
                        {draft.stats[key]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Field label="Synergy tags" hint="Comma separated — these drive synergy rules">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={draft.synergyTags.join(', ')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        synergyTags: event.target.value
                          .split(',')
                          .map((tag) => tag.trim().toLowerCase())
                          .filter(Boolean),
                      })
                    }
                  />
                )}
              </Field>

              <Field label="Special abilities" hint="Comma separated">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={draft.specialAbilities.join(', ')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        specialAbilities: event.target.value
                          .split(',')
                          .map((ability) => ability.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                )}
              </Field>

              <Field label="Image URL" hint="Leave blank to use generated vector art">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={draft.imageUrl ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, imageUrl: event.target.value || undefined })
                    }
                    placeholder="https://cdn.example.com/iron-man.jpg"
                  />
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Palette 1">
                  {({ id }) => (
                    <input
                      id={id}
                      type="color"
                      value={draft.palette[0]}
                      onChange={(event) =>
                        setDraft({ ...draft, palette: [event.target.value, draft.palette[1]] })
                      }
                      className="h-10 w-full rounded-lg border border-white/12 bg-black/40"
                    />
                  )}
                </Field>
                <Field label="Palette 2">
                  {({ id }) => (
                    <input
                      id={id}
                      type="color"
                      value={draft.palette[1]}
                      onChange={(event) =>
                        setDraft({ ...draft, palette: [draft.palette[0], event.target.value] })
                      }
                      className="h-10 w-full rounded-lg border border-white/12 bg-black/40"
                    />
                  )}
                </Field>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="primary" className="flex-1" loading={busy} onClick={() => void save()}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                {!isNew ? (
                  <Button variant="danger" disabled={busy} onClick={() => void remove(draft)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
