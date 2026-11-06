import { NextResponse } from 'next/server';
import { computeAnalytics } from '@/game/analytics';
import { characterRegistry } from '@/server/characters';
import { aiJudgeConfigured, runAiJudge } from '@/server/ai-judge';
import { roomManager } from '@/server/rooms';
import { store } from '@/server/store';

export const dynamic = 'force-dynamic';

/** Whether a Claude-backed verdict is available, so the UI can set expectations. */
export async function GET() {
  return NextResponse.json({ claudeAvailable: aiJudgeConfigured() });
}

/**
 * Delivers the Judge's verdict on a finished auction.
 *
 * Reads the game from the live room when it is still in memory, otherwise from the
 * archive, so a verdict can be requested long after everyone has left.
 */
export async function POST(request: Request) {
  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const code = (body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return NextResponse.json({ error: 'A room code is required.' }, { status: 400 });

  const live = roomManager.byCode(code);
  const archived = live ? null : await store.getArchive(code);

  if (!live && !archived) {
    return NextResponse.json({ error: 'No auction found with that code.' }, { status: 404 });
  }

  const state = live ? live.snapshot() : archived!.state;
  if (state.status !== 'FINISHED') {
    return NextResponse.json(
      { error: 'The Judge only rules on finished auctions.' },
      { status: 409 },
    );
  }

  const rankings = live ? live.leaderboard() : archived!.rankings;
  const characters = await characterRegistry.map();
  const analytics = computeAnalytics(state, characters, state.settings.scoring);

  const { verdict, fallbackReason } = await runAiJudge({
    rankings,
    characters,
    analytics,
    seed: state.id,
  });

  return NextResponse.json({ verdict, fallbackReason, claudeAvailable: aiJudgeConfigured() });
}
