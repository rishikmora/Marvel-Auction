import { NextResponse } from 'next/server';
import { DEFAULT_SCORING, normalizeWeights } from '@/game/config';
import { SYNERGY_RULES, COUNTER_RELATIONSHIPS } from '@/game/data';
import { ROLE_PILLARS } from '@/game/scoring';
import { requireAdmin } from '@/server/auth';
import { scoringSchema } from '@/server/events';
import { store } from '@/server/store';

export const dynamic = 'force-dynamic';

/** The scoring model in force, published so players can audit how they are judged. */
export async function GET() {
  const admin = await store.getAdmin();
  return NextResponse.json({
    scoring: admin.scoring ?? DEFAULT_SCORING,
    isDefault: !admin.scoring,
    synergyRules: SYNERGY_RULES,
    counters: COUNTER_RELATIONSHIPS,
    pillars: ROLE_PILLARS,
  });
}

/** Admin: change the default scoring model used by newly created games. */
export async function PUT(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = scoringSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed.', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const current = (await store.getAdmin()).scoring ?? DEFAULT_SCORING;
  const scoring = {
    ...current,
    ...parsed.data,
    weights: normalizeWeights({ ...current.weights, ...(parsed.data.weights ?? {}) }),
  };
  await store.saveAdmin({ scoring });
  return NextResponse.json({ scoring });
}
