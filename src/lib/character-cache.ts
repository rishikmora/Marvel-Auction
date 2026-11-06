'use client';

import { useEffect, useState } from 'react';
import type { Character } from '@/game/types';

/**
 * The catalogue is fetched at most once per tab and shared by every screen that needs it.
 *
 * Screens that do not need stats (landing, join, lobby list) never call this, and the
 * response itself is cacheable, so the full dataset is not re-downloaded per navigation.
 */
let inflight: Promise<Character[]> | null = null;
let cached: Character[] | null = null;

export async function loadCharacters(): Promise<Character[]> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = fetch('/api/characters')
    .then(async (response) => {
      if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
      const data = (await response.json()) as { characters: Character[] };
      cached = data.characters;
      return cached;
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });

  return inflight;
}

export function invalidateCharacters(): void {
  cached = null;
  inflight = null;
}

export function useCharacters() {
  const [characters, setCharacters] = useState<Map<string, Character>>(
    () => new Map(cached?.map((character) => [character.id, character])),
  );
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadCharacters()
      .then((list) => {
        if (!alive) return;
        setCharacters(new Map(list.map((character) => [character.id, character])));
        setLoading(false);
      })
      .catch((cause: Error) => {
        if (!alive) return;
        setError(cause.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { characters, loading, error };
}
