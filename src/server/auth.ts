import { timingSafeEqual } from 'node:crypto';

export type Role = 'ADMIN' | 'HOST' | 'PLAYER';

/**
 * Admin authorisation for the character/scoring management API.
 *
 * The token comes from MARVEL_ADMIN_TOKEN. In development a well-known fallback keeps the
 * panel usable out of the box; in production an unset token disables admin writes entirely
 * rather than silently accepting a default everyone knows.
 */
const DEV_FALLBACK = 'marvel-admin';

export function adminTokenConfigured(): boolean {
  return Boolean(process.env.MARVEL_ADMIN_TOKEN) || process.env.NODE_ENV !== 'production';
}

function expectedToken(): string | null {
  if (process.env.MARVEL_ADMIN_TOKEN) return process.env.MARVEL_ADMIN_TOKEN;
  if (process.env.NODE_ENV !== 'production') return DEV_FALLBACK;
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isAdminRequest(request: Request): boolean {
  const expected = expectedToken();
  if (!expected) return false;
  const provided =
    request.headers.get('x-admin-token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!provided) return false;
  return safeEqual(provided, expected);
}

export function requireAdmin(request: Request): Response | null {
  if (isAdminRequest(request)) return null;
  return Response.json(
    {
      error: adminTokenConfigured()
        ? 'Administrator authorisation required.'
        : 'Admin access is disabled: set MARVEL_ADMIN_TOKEN to enable it.',
    },
    { status: 401 },
  );
}
