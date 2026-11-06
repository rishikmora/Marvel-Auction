'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SCORING } from '@/game/config';
import type { Character, ScoringConfig, SynergyRule, CounterRelationship } from '@/game/types';
import { STAT_KEYS, STAT_LABELS } from '@/game/types';
import { invalidateCharacters } from '@/lib/character-cache';
import { cn } from '@/lib/cn';
import { AdminCharacterManager } from '@/components/AdminCharacterManager';
import { PageShell } from '@/components/SiteChrome';
import { Button } from '@/components/ui/Button';
import { Field, NumberInput, TextInput } from '@/components/ui/Field';
import { Badge, Panel, SectionTitle } from '@/components/ui/Primitives';

type Tab = 'characters' | 'scoring' | 'rules';

const TOKEN_KEY = 'marvel-auction:admin-token';

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [input, setInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('characters');

  const [characters, setCharacters] = useState<Character[]>([]);
  const [scoring, setScoring] = useState<ScoringConfig>(DEFAULT_SCORING);
  const [rules, setRules] = useState<{ synergyRules: SynergyRule[]; counters: CounterRelationship[] }>({
    synergyRules: [],
    counters: [],
  });
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    invalidateCharacters();
    const [charactersResponse, scoringResponse] = await Promise.all([
      fetch('/api/characters', { cache: 'no-store' }),
      fetch('/api/scoring', { cache: 'no-store' }),
    ]);
    if (charactersResponse.ok) {
      const data = (await charactersResponse.json()) as { characters: Character[] };
      setCharacters(data.characters);
    }
    if (scoringResponse.ok) {
      const data = (await scoringResponse.json()) as {
        scoring: ScoringConfig;
        synergyRules: SynergyRule[];
        counters: CounterRelationship[];
      };
      setScoring(data.scoring);
      setRules({ synergyRules: data.synergyRules, counters: data.counters });
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(TOKEN_KEY);
      if (stored) {
        setToken(stored);
        setAuthed(true);
      }
    } catch {
      // sessionStorage unavailable — the operator just re-enters the token.
    }
    void refresh();
  }, [refresh]);

  const authenticate = async () => {
    // Probe a protected route so a bad token fails immediately rather than on first save.
    const response = await fetch('/api/scoring', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-admin-token': input },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(body.error ?? 'That token was rejected.');
      return;
    }
    setToken(input);
    setAuthed(true);
    setStatus(null);
    try {
      window.sessionStorage.setItem(TOKEN_KEY, input);
    } catch {
      // Non-persistent session is fine.
    }
    void refresh();
  };

  const saveScoring = async () => {
    const response = await fetch('/api/scoring', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(scoring),
    });
    setStatus(response.ok ? 'Scoring defaults saved.' : 'Could not save the scoring model.');
    if (response.ok) void refresh();
  };

  const resetCatalogue = async () => {
    const response = await fetch('/api/characters/reset', {
      method: 'POST',
      headers: { 'x-admin-token': token },
    });
    setStatus(response.ok ? 'Catalogue restored to the shipped dataset.' : 'Reset failed.');
    if (response.ok) void refresh();
  };

  if (!authed) {
    return (
      <PageShell className="max-w-md">
        <SectionTitle
          eyebrow="Restricted"
          title="Admin access"
          description="Enter the administrator token to manage characters, scoring and rules."
        />
        <Panel className="space-y-4 p-5">
          <Field label="Admin token" hint="Set MARVEL_ADMIN_TOKEN in the environment">
            {({ id }) => (
              <TextInput
                id={id}
                type="password"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void authenticate();
                }}
                placeholder="••••••••"
              />
            )}
          </Field>
          {status ? <p className="text-xs text-accent-soft">{status}</p> : null}
          <Button variant="primary" className="w-full" onClick={() => void authenticate()}>
            Unlock
          </Button>
          <p className="text-[11px] leading-relaxed text-[var(--text-low)]">
            In development the token defaults to <code className="text-white">marvel-admin</code>.
            In production, admin writes are disabled entirely unless MARVEL_ADMIN_TOKEN is set.
          </p>
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-6xl">
      <SectionTitle
        eyebrow="Administration"
        title="Control room"
        description="Characters, scoring weights and the rule data that drives synergy and counters."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
          {(
            [
              ['characters', `Characters (${characters.length})`],
              ['scoring', 'Scoring model'],
              ['rules', 'Synergy & counters'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'no-tap-highlight rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
                tab === key ? 'bg-accent text-ink' : 'text-muted hover:text-cream',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Badge tone="toxic">Authenticated</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            setAuthed(false);
            setToken('');
            try {
              window.sessionStorage.removeItem(TOKEN_KEY);
            } catch {
              /* no-op */
            }
          }}
        >
          Lock
        </Button>
      </div>

      {status ? (
        <p className="mb-4 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-xs text-white">
          {status}
        </p>
      ) : null}

      {tab === 'characters' ? (
        <div className="space-y-3">
          <AdminCharacterManager characters={characters} token={token} onChanged={() => void refresh()} />
          <Button size="sm" variant="danger" onClick={() => void resetCatalogue()}>
            Reset catalogue to shipped dataset
          </Button>
        </div>
      ) : null}

      {tab === 'scoring' ? (
        <Panel className="space-y-5 p-5">
          <div>
            <h3 className="display text-base text-white">Default weights</h3>
            <p className="mt-1 text-[11px] text-[var(--text-low)]">
              Applied to newly created games. Hosts can still override these per room.
            </p>
          </div>

          <div className="space-y-2">
            {STAT_KEYS.map((key) => (
              <div key={key} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3">
                <label htmlFor={`admin-w-${key}`} className="text-[11px] text-[var(--text-mid)]">
                  {STAT_LABELS[key]}
                </label>
                <input
                  id={`admin-w-${key}`}
                  type="range"
                  min={0}
                  max={40}
                  value={Math.round((scoring.weights[key] ?? 0) * 100)}
                  onChange={(event) =>
                    setScoring({
                      ...scoring,
                      weights: { ...scoring.weights, [key]: Number(event.target.value) / 100 },
                    })
                  }
                  className="accent-accent"
                />
                <span className="tabular text-right text-[11px] font-bold text-white">
                  {Math.round((scoring.weights[key] ?? 0) * 100)}%
                </span>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['maxSynergyPct', 'Max synergy %'],
                ['maxBalancePct', 'Max balance %'],
                ['maxLeadershipPct', 'Max leadership %'],
                ['maxPenaltyPct', 'Max penalty %'],
              ] as [keyof ScoringConfig, string][]
            ).map(([key, label]) => (
              <Field key={String(key)} label={label}>
                {({ id }) => (
                  <NumberInput
                    id={id}
                    min={0}
                    max={50}
                    value={Math.round((scoring[key] as number) * 100)}
                    onChange={(event) =>
                      setScoring({ ...scoring, [key]: Number(event.target.value) / 100 })
                    }
                  />
                )}
              </Field>
            ))}
            <Field label="Redundancy threshold" hint="Same-role characters tolerated">
              {({ id }) => (
                <NumberInput
                  id={id}
                  min={1}
                  max={7}
                  value={scoring.redundancyThreshold}
                  onChange={(event) =>
                    setScoring({ ...scoring, redundancyThreshold: Number(event.target.value) })
                  }
                />
              )}
            </Field>
            <Field label="Penalty per excess">
              {({ id }) => (
                <NumberInput
                  id={id}
                  min={0}
                  max={500}
                  value={scoring.redundancyPenaltyPerExcess}
                  onChange={(event) =>
                    setScoring({
                      ...scoring,
                      redundancyPenaltyPerExcess: Number(event.target.value),
                    })
                  }
                />
              )}
            </Field>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void saveScoring()}>
              Save scoring model
            </Button>
            <Button variant="ghost" onClick={() => setScoring(DEFAULT_SCORING)}>
              Reset to defaults
            </Button>
          </div>
        </Panel>
      ) : null}

      {tab === 'rules' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-5">
            <h3 className="display mb-3 text-base text-white">
              Synergy rules ({rules.synergyRules.length})
            </h3>
            <ul className="scroll-thin max-h-[60vh] space-y-2 overflow-y-auto">
              {rules.synergyRules.map((rule) => (
                <li key={rule.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-mint">{rule.name}</span>
                    <span className="tabular text-[10px] text-[var(--text-low)]">
                      tag: {rule.tag}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-low)]">
                    {rule.description}
                  </p>
                  <p className="tabular mt-1 text-[10px] text-[var(--text-mid)]">
                    {rule.minCount}+ members · {rule.flatBonus} base · +{rule.perExtraMember} each
                    {rule.cap ? ` · cap ${rule.cap}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-5">
            <h3 className="display mb-3 text-base text-white">
              Counter relationships ({rules.counters.length})
            </h3>
            <p className="mb-3 text-[11px] text-[var(--text-low)]">
              Used only by battle simulation — never by the auction ranking.
            </p>
            <ul className="scroll-thin max-h-[55vh] space-y-2 overflow-y-auto">
              {rules.counters.map((counter) => (
                <li key={counter.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {counter.sourceTag} → {counter.targetTag}
                    </span>
                    <span className="tabular text-[11px] font-bold text-sky">
                      ×{counter.advantageMultiplier}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-low)]">
                    {counter.reason}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}
    </PageShell>
  );
}
