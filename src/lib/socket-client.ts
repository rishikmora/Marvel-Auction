'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './protocol';

export type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameClientSocket | null = null;

/**
 * One shared connection per tab. The create/join screens and the auction room all use
 * the same socket, so a player never ends up bound to two sessions at once.
 */
export function getSocket(): GameClientSocket {
  if (socket) return socket;
  socket = io({
    path: '/api/realtime',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    reconnectionDelayMax: 4000,
    timeout: 8000,
    autoConnect: true,
  });
  return socket;
}

export function disposeSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Promise wrapper around socket.emit's acknowledgement callback. */
export function request<T>(
  event: keyof ClientToServerEvents,
  payload: unknown,
  timeoutMs = 8000,
): Promise<{ ok: boolean; data?: T; error?: { code: string; message: string } }> {
  return new Promise((resolve) => {
    const client = getSocket();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        error: { code: 'TIMEOUT', message: 'The server did not respond. Check your connection.' },
      });
    }, timeoutMs);

    // socket.io types the emit overloads per-event; this bridge is intentionally generic.
    (client.emit as (event: string, payload: unknown, ack: (response: unknown) => void) => void)(
      event,
      payload,
      (response: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(
          (response as { ok: boolean; data?: T; error?: { code: string; message: string } }) ?? {
            ok: false,
            error: { code: 'UNKNOWN', message: 'Something went wrong.' },
          },
        );
      },
    );
  });
}
