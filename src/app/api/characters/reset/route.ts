import { NextResponse } from 'next/server';
import { characterRegistry } from '@/server/characters';
import { requireAdmin } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Admin: drop every catalogue edit and return to the shipped seed dataset. */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  await characterRegistry.reset();
  const characters = await characterRegistry.all();
  return NextResponse.json({ reset: true, total: characters.length });
}
