import { NextResponse } from 'next/server';
import { store } from '@/server/store';

export const dynamic = 'force-dynamic';

/** Career leaderboard across every archived auction. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  if (name) {
    const profile = await store.getProfile(name);
    if (!profile) return NextResponse.json({ error: 'No profile yet.' }, { status: 404 });
    return NextResponse.json({ profile });
  }

  const profiles = await store.listProfiles(50);
  return NextResponse.json({ profiles });
}
