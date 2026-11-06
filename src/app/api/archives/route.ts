import { NextResponse } from 'next/server';
import { store } from '@/server/store';

export const dynamic = 'force-dynamic';

/** Completed auctions, newest first. Bodies are trimmed to what the index screen needs. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
  const archives = await store.listArchives(limit);

  return NextResponse.json({
    games: archives.map((game) => ({
      id: game.id,
      code: game.code,
      name: game.name,
      mode: game.mode,
      hostName: game.hostName,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      playerCount: game.playerCount,
      winnerNames: game.winnerNames,
      winnerPower: game.winnerPower,
      lots: game.state.purchases.length,
      totalBids: game.state.bids.length,
    })),
  });
}
