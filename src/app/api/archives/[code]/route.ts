import { NextResponse } from 'next/server';
import { computeAnalytics } from '@/game/analytics';
import { characterRegistry } from '@/server/characters';
import { store } from '@/server/store';

export const dynamic = 'force-dynamic';

/**
 * One completed auction in full: state, rankings, analytics and the entire bid log.
 *
 * The live socket channel only carries the current round's bids, so this is where the
 * replay and War Room screens get the complete timeline.
 */
export async function GET(_request: Request, { params }: { params: { code: string } }) {
  const archive = await store.getArchive(params.code);
  if (!archive) {
    return NextResponse.json({ error: 'No archived auction with that code.' }, { status: 404 });
  }

  const registry = await characterRegistry.map();
  const referenced = new Set<string>([
    ...archive.state.purchases.map((purchase) => purchase.characterId),
    ...archive.state.bids.map((bid) => bid.characterId),
  ]);

  // Only ship the characters this game actually touched.
  const characters = [...referenced]
    .map((id) => registry.get(id))
    .filter((character): character is NonNullable<typeof character> => Boolean(character));

  const analytics = computeAnalytics(archive.state, registry, archive.state.settings.scoring);

  return NextResponse.json({
    game: {
      id: archive.id,
      code: archive.code,
      name: archive.name,
      mode: archive.mode,
      hostName: archive.hostName,
      startedAt: archive.startedAt,
      finishedAt: archive.finishedAt,
      settings: archive.state.settings,
      players: archive.state.players,
      purchases: archive.state.purchases,
      bids: archive.state.bids,
      feed: archive.state.feed,
    },
    rankings: archive.rankings,
    analytics,
    characters,
  });
}
