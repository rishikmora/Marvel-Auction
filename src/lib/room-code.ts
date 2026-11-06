/**
 * Room-code formatting shared by client and server.
 *
 * Lives outside src/server because the server module imports node:crypto, which the
 * browser bundle must not pull in.
 */
export const ROOM_CODE_PREFIX = 'MARVEL';

/** Accepts "MARVEL-X7K9QM", "x7k9qm" or "X7K9 QM" and returns the canonical code. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(new RegExp(`^${ROOM_CODE_PREFIX}[-\\s]?`), '')
    .replace(/[^A-Z0-9]/g, '');
}

export function displayCode(code: string): string {
  return `${ROOM_CODE_PREFIX}-${code.toUpperCase()}`;
}
