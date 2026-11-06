import type {
  BidRecord,
  GameError,
  GameSettings,
  GameSettingsPatch,
  GameState,
  RankedTeam,
} from '@/game/types';

/**
 * What actually travels over the socket.
 *
 * The full bid log can reach several thousand rows in a long game, so the live channel
 * carries only the current round; completed games expose their whole bid history through
 * the archive API, which is what the replay screen reads.
 */
export interface PublicGameState extends Omit<GameState, 'bids'> {
  bids: BidRecord[];
  totalBids: number;
}

/** Per-viewer facts the server computes so no client ever derives its own limits. */
export interface ViewerState {
  playerId: string;
  isHost: boolean;
  isSpectator: boolean;
  canBid: boolean;
  /** Null when the player is not currently allowed to bid. */
  blockedReason: string | null;
  maxBid: number;
  nextMinimumBid: number;
  quickBids: number[];
  rosterFull: boolean;
  slotsRemaining: number;
  /** Pass voting: whether this viewer may vote, and where the tally stands. */
  canVotePass: boolean;
  hasVotedPass: boolean;
  passVotes: number;
  passVotesNeeded: number;
}

export type PulseType =
  | 'REVEAL'
  | 'BID'
  | 'OUTBID'
  | 'SOLD'
  | 'PASSED'
  | 'ANTI_SNIPE'
  | 'ROSTER_FULL'
  | 'FIRST_PLACE'
  | 'GAME_OVER'
  | 'LOW_BUDGET'
  | 'PASS_VOTE';

/** Lightweight side-channel that drives notifications, sounds and one-off animations. */
export interface Pulse {
  id: string;
  type: PulseType;
  message: string;
  at: number;
  characterId?: string;
  playerId?: string;
  amount?: number;
}

export interface JoinResult {
  code: string;
  playerId: string;
  token: string;
  state: PublicGameState;
  viewer: ViewerState;
}

export interface Ack<T> {
  ok: boolean;
  data?: T;
  error?: GameError;
}

export interface ServerToClientEvents {
  state: (payload: { state: PublicGameState; viewer: ViewerState; leaderboard: RankedTeam[] }) => void;
  pulse: (pulse: Pulse) => void;
  toast: (payload: { level: 'info' | 'error' | 'success'; message: string }) => void;
  kicked: (payload: { reason: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: {
      settings: Partial<GameSettings>;
      host: { name: string; teamName: string; avatar: string };
    },
    ack: (response: Ack<JoinResult>) => void,
  ) => void;
  'room:join': (
    payload: {
      code: string;
      name: string;
      teamName: string;
      avatar: string;
      password?: string;
    },
    ack: (response: Ack<JoinResult>) => void,
  ) => void;
  'room:resume': (
    payload: { code: string; playerId: string; token: string },
    ack: (response: Ack<JoinResult>) => void,
  ) => void;
  'player:ready': (payload: { ready: boolean }, ack: (response: Ack<true>) => void) => void;
  'player:profile': (
    payload: { teamName?: string; avatar?: string },
    ack: (response: Ack<true>) => void,
  ) => void;
  'host:settings': (
    payload: { patch: GameSettingsPatch },
    ack: (response: Ack<true>) => void,
  ) => void;
  'host:kick': (payload: { playerId: string }, ack: (response: Ack<true>) => void) => void;
  'host:start': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'host:reveal': (
    payload: { characterId?: string },
    ack: (response: Ack<true>) => void,
  ) => void;
  'host:open': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'host:pause': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'host:resume': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'host:extend': (payload: { seconds: number }, ack: (response: Ack<true>) => void) => void;
  'host:sell': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'host:pass': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'host:next': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'host:end': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'host:cancel': (payload: Record<string, never>, ack: (response: Ack<true>) => void) => void;
  'bid:place': (payload: { amount: number }, ack: (response: Ack<BidRecord>) => void) => void;
  'vote:pass': (
    payload: { pass: boolean },
    ack: (response: Ack<{ votes: number; needed: number }>) => void,
  ) => void;
}
