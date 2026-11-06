import { randomUUID, randomInt } from 'node:crypto';
import { displayCode, normalizeCode } from '@/lib/room-code';

/** Excludes 0/O/1/I/L so codes survive being read aloud over voice chat. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function id(prefix = ''): string {
  const value = randomUUID().replace(/-/g, '').slice(0, 16);
  return prefix ? `${prefix}_${value}` : value;
}

export function roomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export const normalizeRoomCode = normalizeCode;
export const displayRoomCode = displayCode;
