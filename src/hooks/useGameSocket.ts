'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RankedTeam } from '@/game/types';
import type { Pulse, PublicGameState, ViewerState } from '@/lib/protocol';
import { getSocket, request } from '@/lib/socket-client';
import { clearSession, loadSession } from '@/lib/session';

export type Connection = 'CONNECTING' | 'ONLINE' | 'RECONNECTING' | 'OFFLINE' | 'REJECTED';

export interface GameSocketState {
  state: PublicGameState | null;
  viewer: ViewerState | null;
  leaderboard: RankedTeam[];
  connection: Connection;
  /** Server clock minus local clock, so countdowns stay honest across drifting devices. */
  clockOffset: number;
  error: string | null;
  pulses: Pulse[];
  consumePulse: (id: string) => void;
}

const MAX_PULSES = 6;

/**
 * Subscribes to one auction room.
 *
 * The client renders whatever the server sends and never computes budgets, legality or
 * scores itself; every action here is a request the server is free to reject.
 */
export function useGameSocket(code: string) {
  const [state, setState] = useState<PublicGameState | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [leaderboard, setLeaderboard] = useState<RankedTeam[]>([]);
  const [connection, setConnection] = useState<Connection>('CONNECTING');
  const [error, setError] = useState<string | null>(null);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const clockOffset = useRef(0);
  const resumed = useRef(false);

  const resume = useCallback(async () => {
    const session = loadSession(code);
    if (!session) {
      setConnection('REJECTED');
      setError('You have not joined this auction yet.');
      return;
    }
    const response = await request<{ state: PublicGameState; viewer: ViewerState }>(
      'room:resume',
      { code, playerId: session.playerId, token: session.token },
    );
    if (!response.ok) {
      if (response.error?.code === 'ROOM_NOT_FOUND' || response.error?.code === 'NOT_IN_GAME') {
        clearSession(code);
      }
      setConnection('REJECTED');
      setError(response.error?.message ?? 'Could not rejoin this auction.');
      return;
    }
    setConnection('ONLINE');
    setError(null);
    if (response.data) {
      setState(response.data.state);
      setViewer(response.data.viewer);
    }
  }, [code]);

  useEffect(() => {
    const socket = getSocket();

    const onState = (payload: {
      state: PublicGameState;
      viewer: ViewerState;
      leaderboard: RankedTeam[];
    }) => {
      clockOffset.current = payload.state.serverTime - Date.now();
      setState(payload.state);
      setViewer(payload.viewer);
      setLeaderboard(payload.leaderboard);
      setConnection('ONLINE');
    };

    const onPulse = (pulse: Pulse) => {
      setPulses((current) => [pulse, ...current].slice(0, MAX_PULSES));
    };

    const onConnect = () => {
      setConnection('ONLINE');
      // Re-authenticate after every reconnect: the socket id changed server-side.
      void resume();
    };
    const onDisconnect = () => setConnection('RECONNECTING');
    const onConnectError = () => setConnection('OFFLINE');
    const onKicked = (payload: { reason: string }) => {
      clearSession(code);
      setConnection('REJECTED');
      setError(payload.reason);
    };

    socket.on('state', onState);
    socket.on('pulse', onPulse);
    socket.on('kicked', onKicked);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    if (socket.connected && !resumed.current) {
      resumed.current = true;
      void resume();
    }

    return () => {
      socket.off('state', onState);
      socket.off('pulse', onPulse);
      socket.off('kicked', onKicked);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [code, resume]);

  const consumePulse = useCallback((id: string) => {
    setPulses((current) => current.filter((pulse) => pulse.id !== id));
  }, []);

  return {
    state,
    viewer,
    leaderboard,
    connection,
    clockOffset: clockOffset.current,
    error,
    pulses,
    consumePulse,
    resume,
  };
}
