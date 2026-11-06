import { NextResponse } from 'next/server';
import { characterRegistry } from '@/server/characters';
import { roomManager } from '@/server/rooms';
import { store } from '@/server/store';

export const dynamic = 'force-dynamic';

/** Headline numbers for the landing page. */
export async function GET() {
  const [stats, characters, archives] = await Promise.all([
    store.globalStats(),
    characterRegistry.all(),
    store.listArchives(5),
  ]);

  const topCharacter = stats.topCharacter
    ? characters.find((character) => character.id === stats.topCharacter?.characterId) ?? null
    : null;

  return NextResponse.json({
    gamesPlayed: stats.gamesPlayed,
    charactersAuctioned: stats.charactersAuctioned,
    creditsSpent: stats.creditsSpent,
    charactersAvailable: characters.length,
    liveRooms: roomManager.listPublic().length,
    mostContested: topCharacter
      ? { name: topCharacter.name, id: topCharacter.id, count: stats.topCharacter?.count ?? 0 }
      : null,
    recentWinners: archives.map((game) => ({
      code: game.code,
      name: game.name,
      winners: game.winnerNames,
      power: game.winnerPower,
      finishedAt: game.finishedAt,
    })),
  });
}
