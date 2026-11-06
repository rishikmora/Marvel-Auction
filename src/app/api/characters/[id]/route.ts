import { NextResponse } from 'next/server';
import { characterRegistry } from '@/server/characters';
import { characterSchema } from '@/server/events';
import { requireAdmin } from '@/server/auth';
import type { Character } from '@/game/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const character = await characterRegistry.byId(params.id);
  if (!character) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  return NextResponse.json({ character });
}

/** Admin: edit an existing character. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = characterSchema.safeParse({ ...(body as object), id: params.id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed.', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const saved = await characterRegistry.upsert(parsed.data as Character);
  return NextResponse.json({ character: saved });
}

/** Admin: remove a character from the catalogue. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const existing = await characterRegistry.byId(params.id);
  if (!existing) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });

  await characterRegistry.remove(params.id);
  return NextResponse.json({ removed: params.id });
}
