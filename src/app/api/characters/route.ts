import { NextResponse } from 'next/server';
import { characterRegistry } from '@/server/characters';
import { characterSchema } from '@/server/events';
import { requireAdmin } from '@/server/auth';
import { SYNERGY_RULES, COUNTER_RELATIONSHIPS } from '@/game/data';
import type { Character } from '@/game/types';

export const dynamic = 'force-dynamic';

/**
 * The character catalogue.
 *
 * `?view=summary` returns a light projection for browsing screens; the full payload is
 * only sent where stats actually matter (the auction room and the admin panel).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get('view');
  const universe = url.searchParams.get('universe');
  const all = await characterRegistry.all();

  const filtered = universe
    ? all.filter((character) => character.categories.includes(universe as Character['categories'][number]))
    : all;

  if (view === 'summary') {
    return NextResponse.json(
      {
        characters: filtered.map((character) => ({
          id: character.id,
          name: character.name,
          alias: character.alias,
          universe: character.universe,
          rarity: character.rarity,
          tier: character.tier,
          basePrice: character.basePrice,
          palette: character.palette,
          glyph: character.glyph,
        })),
        total: filtered.length,
      },
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' } },
    );
  }

  return NextResponse.json(
    {
      characters: filtered,
      total: filtered.length,
      synergyRules: view === 'rules' ? SYNERGY_RULES : undefined,
      counters: view === 'rules' ? COUNTER_RELATIONSHIPS : undefined,
    },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' } },
  );
}

/** Admin: create or replace a character. */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = characterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed.', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const saved = await characterRegistry.upsert(parsed.data as Character);
  return NextResponse.json({ character: saved }, { status: 201 });
}
