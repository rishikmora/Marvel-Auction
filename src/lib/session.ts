'use client';

export interface StoredSession {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

const key = (code: string) => `marvel-auction:session:${code.toUpperCase()}`;
const LAST_KEY = 'marvel-auction:last-room';

export function saveSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(key(session.code), JSON.stringify(session));
    window.localStorage.setItem(LAST_KEY, session.code.toUpperCase());
  } catch {
    // Storage unavailable: the player simply cannot auto-reconnect after a refresh.
  }
}

export function loadSession(code: string): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(key(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.playerId || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(code: string): void {
  try {
    window.localStorage.removeItem(key(code));
  } catch {
    // no-op
  }
}

export function lastRoom(): string | null {
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Remembered identity so returning players do not retype their name every game. */
export interface Identity {
  name: string;
  teamName: string;
  avatar: string;
}

const IDENTITY_KEY = 'marvel-auction:identity';

export function saveIdentity(identity: Identity): void {
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // no-op
  }
}

export function loadIdentity(): Identity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}
