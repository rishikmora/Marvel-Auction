import { NextResponse } from 'next/server';
import { roomManager } from '@/server/rooms';

export const dynamic = 'force-dynamic';

/** Public lobbies available to join. Private rooms are never listed. */
export async function GET() {
  return NextResponse.json({ rooms: roomManager.listPublic() });
}
