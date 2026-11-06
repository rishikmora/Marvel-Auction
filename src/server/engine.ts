import { applyMode, DEFAULT_SETTINGS, normalizeWeights } from '@/game/config';
import { filterByCategories } from '@/game/data';
import { rankTeams, scoreTeam } from '@/game/scoring';
import type {
  AuctionState,
  BidRecord,
  Character,
  ConnectionStatus,
  FeedEvent,
  FeedKind,
  GameSettings,
  GameSettingsPatch,
  GameState,
  Player,
  PurchaseRecord,
  RankedTeam,
  Result,
  ScoringConfig,
  SynergyRule,
  TeamScore,
} from '@/game/types';
import { err, ok } from '@/game/types';
import { id } from './ids';

/* ------------------------------------------------------------------ */
/* Injectable clock + scheduler keep the engine deterministic in tests  */
/* ------------------------------------------------------------------ */

export interface Scheduler {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface RoomOptions {
  code: string;
  settings: GameSettings;
  host: { id: string; name: string; teamName: string; avatar: string };
  characters: Character[];
  synergyRules?: SynergyRule[];
  now?: () => number;
  scheduler?: Scheduler;
  /** Deterministic shuffle hook; defaults to Math.random. */
  random?: () => number;
}

const MAX_FEED = 120;

/**
 * AuctionRoom is the single source of truth for one game.
 *
 * Every mutation is a method that returns a Result — the socket layer never writes to
 * state directly, and the client is never trusted for budgets, bid legality, ownership
 * or scoring. Invalid state transitions are rejected rather than clamped.
 */
export class AuctionRoom {
  readonly state: GameState;

  private readonly characters: Map<string, Character>;
  private readonly synergyRules: SynergyRule[] | undefined;
  private readonly now: () => number;
  private readonly scheduler: Scheduler;
  private readonly random: () => number;
  private readonly listeners = new Set<(room: AuctionRoom) => void>();

  private timerHandle: unknown = null;
  private roundOpenedAt = 0;
  private roundBidCount = 0;

  constructor(options: RoomOptions) {
    const settings = applyMode({ ...DEFAULT_SETTINGS, ...options.settings }, options.settings.mode);
    this.characters = new Map(options.characters.map((character) => [character.id, character]));
    this.synergyRules = options.synergyRules;
    this.now = options.now ?? (() => Date.now());
    this.scheduler = options.scheduler ?? realScheduler;
    this.random = options.random ?? Math.random;

    const pool = this.buildPool(settings, options.characters);
    const createdAt = this.now();

    const host: Player = {
      id: options.host.id,
      name: options.host.name,
      teamName: options.host.teamName,
      avatar: options.host.avatar,
      isHost: true,
      isSpectator: !settings.hostPlays,
      ready: true,
      budget: settings.startingBudget,
      spent: 0,
      roster: [],
      connection: 'ONLINE',
      lastSeen: createdAt,
      joinedAt: createdAt,
    };

    this.state = {
      id: id('game'),
      code: options.code,
      status: 'LOBBY',
      settings,
      hostId: host.id,
      createdAt,
      startedAt: null,
      finishedAt: null,
      players: [host],
      auction: {
        state: 'WAITING',
        round: 0,
        characterId: null,
        currentBid: 0,
        nextMinimumBid: 0,
        highestBidderId: null,
        endsAt: null,
        pausedRemainingMs: null,
        extensions: 0,
        awaitingHostSale: false,
        passVotes: [],
        passVotesNeeded: 0,
      },
      remainingPool: pool,
      soldCharacterIds: [],
      passedCharacterIds: [],
      purchases: [],
      bids: [],
      feed: [],
      serverTime: createdAt,
    };

    this.pushFeed('SYSTEM', `${host.name} opened the vault.`);
  }

  /* ---------------------------------------------------------------- */
  /* Subscriptions                                                     */
  /* ---------------------------------------------------------------- */

  subscribe(listener: (room: AuctionRoom) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.state.serverTime = this.now();
    for (const listener of this.listeners) listener(this);
  }

  /* ---------------------------------------------------------------- */
  /* Pool                                                              */
  /* ---------------------------------------------------------------- */

  private buildPool(settings: GameSettings, characters: Character[]): string[] {
    let candidates = characters;
    if (settings.characterPool && settings.characterPool.length) {
      const allow = new Set(settings.characterPool);
      candidates = candidates.filter((character) => allow.has(character.id));
    } else {
      candidates = filterByCategories(candidates, settings.categories);
    }
    const ids = candidates.map((character) => character.id);
    return this.shuffle(ids);
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /* ---------------------------------------------------------------- */
  /* Lookups                                                           */
  /* ---------------------------------------------------------------- */

  get host(): Player | undefined {
    return this.state.players.find((player) => player.id === this.state.hostId);
  }

  player(playerId: string): Player | undefined {
    return this.state.players.find((player) => player.id === playerId);
  }

  character(characterId: string): Character | undefined {
    return this.characters.get(characterId);
  }

  get currentCharacter(): Character | null {
    const characterId = this.state.auction.characterId;
    return characterId ? (this.characters.get(characterId) ?? null) : null;
  }

  /** Bidders only — spectators and the non-playing host are excluded. */
  get contenders(): Player[] {
    return this.state.players.filter((player) => !player.isSpectator);
  }

  private pushFeed(kind: FeedKind, message: string, extra: Partial<FeedEvent> = {}): void {
    const event: FeedEvent = {
      id: id('fe'),
      kind,
      message,
      at: this.now(),
      round: this.state.auction.round || undefined,
      ...extra,
    };
    this.state.feed.unshift(event);
    if (this.state.feed.length > MAX_FEED) this.state.feed.length = MAX_FEED;
  }

  /* ---------------------------------------------------------------- */
  /* Lobby                                                             */
  /* ---------------------------------------------------------------- */

  join(input: {
    playerId: string;
    name: string;
    teamName: string;
    avatar: string;
    password?: string | null;
  }): Result<Player> {
    if (this.state.status === 'CANCELLED') {
      return err('ROOM_NOT_FOUND', 'This auction was cancelled by the host.');
    }
    if (this.state.settings.isPrivate && this.state.settings.password) {
      if ((input.password ?? '') !== this.state.settings.password) {
        return err('BAD_PASSWORD', 'That room password is not correct.');
      }
    }

    const existing = this.player(input.playerId);
    if (existing) return this.reconnect(input.playerId);

    if (this.state.status !== 'LOBBY') {
      // Late arrivals become spectators rather than being turned away outright.
      return this.addPlayer({ ...input, spectator: true });
    }
    if (this.state.players.length >= this.state.settings.maxPlayers) {
      return err('ROOM_FULL', 'This auction is already at capacity.');
    }
    const nameTaken = this.state.players.some(
      (player) => player.name.toLowerCase() === input.name.trim().toLowerCase(),
    );
    if (nameTaken) return err('NAME_TAKEN', 'Someone in this room already uses that name.');

    return this.addPlayer({ ...input, spectator: false });
  }

  private addPlayer(input: {
    playerId: string;
    name: string;
    teamName: string;
    avatar: string;
    spectator: boolean;
  }): Result<Player> {
    const at = this.now();
    const player: Player = {
      id: input.playerId,
      name: input.name.trim(),
      teamName: input.teamName.trim() || `${input.name.trim()}'s Team`,
      avatar: input.avatar,
      isHost: false,
      isSpectator: input.spectator,
      ready: false,
      budget: this.state.settings.startingBudget,
      spent: 0,
      roster: [],
      connection: 'ONLINE',
      lastSeen: at,
      joinedAt: at,
    };
    this.state.players.push(player);
    this.pushFeed(
      'JOIN',
      input.spectator
        ? `${player.name} is watching as a spectator.`
        : `${player.teamName} entered the auction.`,
      { playerId: player.id },
    );
    this.emit();
    return ok(player);
  }

  reconnect(playerId: string): Result<Player> {
    const player = this.player(playerId);
    if (!player) return err('NOT_IN_GAME', 'You are not part of this auction.');
    player.connection = 'RECONNECTED';
    player.lastSeen = this.now();
    this.pushFeed('SYSTEM', `${player.teamName} reconnected.`, { playerId });
    this.emit();
    return ok(player);
  }

  setConnection(playerId: string, status: ConnectionStatus): void {
    const player = this.player(playerId);
    if (!player) return;
    player.connection = status;
    player.lastSeen = this.now();
    if (status === 'DISCONNECTED') {
      this.pushFeed('SYSTEM', `${player.teamName} lost connection.`, { playerId });
    }
    this.emit();
    this.maybeResolvePassVote();
  }

  setReady(playerId: string, ready: boolean): Result<Player> {
    const player = this.player(playerId);
    if (!player) return err('NOT_IN_GAME', 'You are not part of this auction.');
    if (this.state.status !== 'LOBBY') {
      return err('INVALID_STATE', 'The auction has already started.');
    }
    player.ready = ready;
    this.emit();
    return ok(player);
  }

  updateProfile(
    playerId: string,
    patch: { teamName?: string; avatar?: string },
  ): Result<Player> {
    const player = this.player(playerId);
    if (!player) return err('NOT_IN_GAME', 'You are not part of this auction.');
    if (this.state.status !== 'LOBBY') {
      return err('INVALID_STATE', 'Team details are locked once the auction begins.');
    }
    if (patch.teamName !== undefined) player.teamName = patch.teamName.trim().slice(0, 28);
    if (patch.avatar !== undefined) player.avatar = patch.avatar;
    this.emit();
    return ok(player);
  }

  updateSettings(hostId: string, patch: GameSettingsPatch): Result<GameSettings> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    if (this.state.status !== 'LOBBY') {
      return err('INVALID_STATE', 'Settings are locked once the auction begins.');
    }

    const scoringPatch = patch.scoring ?? {};
    const scoring: ScoringConfig = {
      ...this.state.settings.scoring,
      ...scoringPatch,
      weights: normalizeWeights({
        ...this.state.settings.scoring.weights,
        ...(scoringPatch.weights ?? {}),
      }),
    };
    const merged: GameSettings = { ...this.state.settings, ...patch, scoring };
    const next = applyMode(merged, patch.mode ?? this.state.settings.mode);
    // A mode overlay must not silently discard an explicit host choice made in the same edit.
    Object.assign(next, patch, { scoring });
    this.state.settings = next;

    // Budget changes have to propagate to players who have not spent anything yet.
    for (const player of this.state.players) {
      if (player.spent === 0) player.budget = next.startingBudget;
      player.isSpectator = player.isHost ? !next.hostPlays : player.isSpectator;
    }
    this.state.remainingPool = this.buildPool(next, [...this.characters.values()]);
    this.emit();
    return ok(next);
  }

  kick(hostId: string, playerId: string): Result<true> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    if (playerId === this.state.hostId) {
      return err('VALIDATION', 'The host cannot be removed from their own auction.');
    }
    const player = this.player(playerId);
    if (!player) return err('NOT_IN_GAME', 'That player is not in this auction.');

    // Returning their characters to the pool keeps the board consistent for everyone else.
    for (const purchase of player.roster) {
      this.state.remainingPool.push(purchase.characterId);
      this.state.soldCharacterIds = this.state.soldCharacterIds.filter(
        (characterId) => characterId !== purchase.characterId,
      );
    }
    this.state.players = this.state.players.filter((entry) => entry.id !== playerId);
    if (this.state.auction.highestBidderId === playerId) {
      this.state.auction.highestBidderId = null;
      this.state.auction.currentBid = 0;
      this.state.auction.nextMinimumBid = this.currentCharacter?.basePrice ?? 0;
    }
    this.pushFeed('LEAVE', `${player.teamName} was removed by the host.`, { playerId });
    this.emit();
    this.maybeResolvePassVote();
    return ok(true);
  }

  start(hostId: string): Result<true> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    if (this.state.status !== 'LOBBY') {
      return err('INVALID_STATE', 'This auction has already started.');
    }
    if (this.contenders.length < this.state.settings.minPlayers) {
      return err(
        'NOT_ENOUGH_PLAYERS',
        `You need at least ${this.state.settings.minPlayers} bidders to begin.`,
      );
    }
    if (!this.state.remainingPool.length) {
      return err('POOL_EMPTY', 'No characters match the selected categories.');
    }
    this.state.status = 'ACTIVE';
    this.state.startedAt = this.now();
    this.state.auction.state = 'WAITING';
    this.pushFeed('SYSTEM', 'The auction floor is open.');
    this.emit();
    return ok(true);
  }

  /* ---------------------------------------------------------------- */
  /* Host auction controls                                             */
  /* ---------------------------------------------------------------- */

  private requireHost(playerId: string): Result<true> {
    if (playerId !== this.state.hostId) {
      return err('NOT_HOST', 'Only the host can perform this action.');
    }
    return ok(true);
  }

  private requireActive(): Result<true> {
    if (this.state.status !== 'ACTIVE') {
      return err('INVALID_STATE', 'The auction is not currently running.');
    }
    return ok(true);
  }

  revealCharacter(hostId: string, characterId?: string): Result<Character> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    return this.revealInternal(characterId);
  }

  /** Reveal without the host check — used by the host command above and by auto-advance. */
  private revealInternal(characterId?: string): Result<Character> {
    const active = this.requireActive();
    if (!active.ok) return active;

    const allowed: AuctionState[] = ['WAITING', 'SOLD', 'PASSED'];
    if (!allowed.includes(this.state.auction.state)) {
      return err('INVALID_STATE', 'Finish the current lot before revealing another.');
    }
    if (!this.state.remainingPool.length) {
      return err('POOL_EMPTY', 'Every character in the pool has been auctioned.');
    }

    const nextId = characterId ?? this.state.remainingPool[0];
    if (!this.state.remainingPool.includes(nextId)) {
      return err('CHARACTER_SOLD', 'That character is no longer available.');
    }
    const character = this.characters.get(nextId);
    if (!character) return err('VALIDATION', 'Unknown character.');

    this.clearTimer();
    this.roundBidCount = 0;
    this.state.auction = {
      state: 'CHARACTER_REVEALED',
      round: this.state.auction.round + 1,
      characterId: character.id,
      currentBid: 0,
      nextMinimumBid: character.basePrice,
      highestBidderId: null,
      endsAt: null,
      pausedRemainingMs: null,
      extensions: 0,
      awaitingHostSale: false,
      passVotes: [],
      passVotesNeeded: 0,
    };
    this.refreshPassVoteTarget();
    this.pushFeed('REVEAL', `${character.name} enters the arena.`, {
      characterId: character.id,
      amount: character.basePrice,
    });
    this.emit();
    return ok(character);
  }

  startBidding(hostId: string): Result<true> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    return this.openFloorInternal();
  }

  /** Open the floor without the host check — used by the host command and by auto-advance. */
  private openFloorInternal(): Result<true> {
    const active = this.requireActive();
    if (!active.ok) return active;
    if (this.state.auction.state !== 'CHARACTER_REVEALED') {
      return err('INVALID_STATE', 'Reveal a character before opening the floor.');
    }

    const at = this.now();
    this.roundOpenedAt = at;
    this.state.auction.state = 'BIDDING';
    this.state.auction.endsAt = at + this.state.settings.auctionSeconds * 1000;
    this.state.auction.pausedRemainingMs = null;
    this.armTimer();
    this.pushFeed('SYSTEM', 'Bidding is open.', {
      characterId: this.state.auction.characterId ?? undefined,
    });
    this.emit();
    return ok(true);
  }

  pause(hostId: string): Result<true> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    if (this.state.auction.state !== 'BIDDING') {
      return err('INVALID_STATE', 'Only a live auction can be paused.');
    }
    const remaining = Math.max(0, (this.state.auction.endsAt ?? this.now()) - this.now());
    this.clearTimer();
    this.state.auction.state = 'PAUSED';
    this.state.auction.pausedRemainingMs = remaining;
    this.state.auction.endsAt = null;
    this.pushFeed('SYSTEM', 'The host paused the auction.');
    this.emit();
    return ok(true);
  }

  resume(hostId: string): Result<true> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    if (this.state.auction.state !== 'PAUSED') {
      return err('INVALID_STATE', 'The auction is not paused.');
    }
    const remaining = this.state.auction.pausedRemainingMs ?? this.state.settings.auctionSeconds * 1000;
    this.state.auction.state = 'BIDDING';
    this.state.auction.endsAt = this.now() + remaining;
    this.state.auction.pausedRemainingMs = null;
    this.armTimer();
    this.pushFeed('SYSTEM', 'The auction resumes.');
    this.emit();
    return ok(true);
  }

  extendTimer(hostId: string, seconds: number): Result<number> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    const delta = Math.max(1, Math.min(120, Math.floor(seconds)));

    if (this.state.auction.state === 'PAUSED') {
      this.state.auction.pausedRemainingMs = (this.state.auction.pausedRemainingMs ?? 0) + delta * 1000;
    } else if (this.state.auction.state === 'BIDDING') {
      this.state.auction.endsAt = (this.state.auction.endsAt ?? this.now()) + delta * 1000;
      this.state.auction.awaitingHostSale = false;
      this.armTimer();
    } else {
      return err('INVALID_STATE', 'There is no running clock to extend.');
    }
    this.pushFeed('SYSTEM', `Host added ${delta}s to the clock.`);
    this.emit();
    return ok(delta);
  }

  sellNow(hostId: string): Result<PurchaseRecord> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    if (!['BIDDING', 'PAUSED'].includes(this.state.auction.state)) {
      return err('INVALID_STATE', 'There is no live lot to sell.');
    }
    if (!this.state.auction.highestBidderId) {
      return err('VALIDATION', 'No bids have been placed — pass the lot instead.');
    }
    return this.finalizeSale();
  }

  pass(hostId: string): Result<PurchaseRecord> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    const passable: AuctionState[] = ['CHARACTER_REVEALED', 'BIDDING', 'PAUSED'];
    if (!passable.includes(this.state.auction.state)) {
      return err('INVALID_STATE', 'There is no lot on the block.');
    }
    return this.finalizePass();
  }

  nextCharacter(hostId: string): Result<true> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    if (!['SOLD', 'PASSED'].includes(this.state.auction.state)) {
      return err('INVALID_STATE', 'Resolve the current lot first.');
    }
    this.state.auction = {
      ...this.state.auction,
      state: 'WAITING',
      characterId: null,
      currentBid: 0,
      nextMinimumBid: 0,
      highestBidderId: null,
      endsAt: null,
      pausedRemainingMs: null,
      extensions: 0,
      awaitingHostSale: false,
      passVotes: [],
      passVotesNeeded: 0,
    };
    this.emit();
    this.checkAutoFinish();
    return ok(true);
  }

  endAuction(hostId: string): Result<RankedTeam[]> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    if (this.state.status === 'FINISHED') return ok(this.leaderboard());
    this.finish('The host closed the auction.');
    return ok(this.leaderboard());
  }

  cancelGame(hostId: string): Result<true> {
    const guard = this.requireHost(hostId);
    if (!guard.ok) return guard;
    this.clearTimer();
    this.state.status = 'CANCELLED';
    this.state.auction.state = 'FINISHED';
    this.pushFeed('SYSTEM', 'The auction was cancelled.');
    this.emit();
    return ok(true);
  }

  /* ---------------------------------------------------------------- */
  /* Bidding                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Maximum a player may legally commit right now.
   *
   * With reserveBudgetForSlots enabled we hold back enough credits to fill the rest of
   * the roster at the cheapest price still on the board, so nobody can strand
   * themselves with empty slots and no money.
   */
  maxBidFor(playerId: string): number {
    const player = this.player(playerId);
    if (!player) return 0;
    const slotsLeft = this.state.settings.maxRoster - player.roster.length;
    if (slotsLeft <= 0) return 0;
    if (!this.state.settings.reserveBudgetForSlots || slotsLeft === 1) return player.budget;

    const floor = this.cheapestRemainingPrice();
    const reserve = (slotsLeft - 1) * floor;
    return Math.max(0, player.budget - reserve);
  }

  private cheapestRemainingPrice(): number {
    let cheapest = Number.POSITIVE_INFINITY;
    for (const characterId of this.state.remainingPool) {
      if (characterId === this.state.auction.characterId) continue;
      const character = this.characters.get(characterId);
      if (character && character.basePrice < cheapest) cheapest = character.basePrice;
    }
    if (!Number.isFinite(cheapest)) return this.state.settings.minIncrement;
    return Math.max(1, cheapest);
  }

  canBid(playerId: string): Result<Player> {
    const player = this.player(playerId);
    if (!player) return err('NOT_IN_GAME', 'You are not part of this auction.');
    if (player.isSpectator) return err('NOT_IN_GAME', 'Spectators cannot place bids.');
    if (this.state.status !== 'ACTIVE') return err('AUCTION_ENDED', 'The auction has ended.');
    if (this.state.auction.state !== 'BIDDING') {
      return err('INVALID_STATE', 'Bidding is not open on this lot.');
    }
    if (player.roster.length >= this.state.settings.maxRoster) {
      return err('ROSTER_FULL', 'Your team is already complete.');
    }
    if (
      player.connection === 'DISCONNECTED' &&
      !this.state.settings.allowReconnectBidding
    ) {
      return err('RECONNECTING', 'You are reconnecting — bidding is paused for you.');
    }
    return ok(player);
  }

  /* ---------------------------------------------------------------- */
  /* Pass voting                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Players who get a say in skipping the current lot.
   *
   * A full roster or a dropped connection means you could not bid on this lot anyway, so
   * you are not counted — otherwise one finished player would block every skip for the
   * rest of the auction.
   */
  get passVoters(): Player[] {
    return this.state.players.filter((player) => {
      if (player.isSpectator) return false;
      if (player.roster.length >= this.state.settings.maxRoster) return false;
      if (player.connection === 'DISCONNECTED' && !this.state.settings.allowReconnectBidding) {
        return false;
      }
      return true;
    });
  }

  /**
   * Recomputes how many votes a skip needs and drops votes from players who are no longer
   * eligible. Called whenever the eligible set can change, which is also what makes a
   * disconnect or a completed roster resolve a vote that is already unanimous.
   */
  private refreshPassVoteTarget(): void {
    const eligible = this.passVoters;
    const eligibleIds = new Set(eligible.map((player) => player.id));
    this.state.auction.passVotes = this.state.auction.passVotes.filter((id) =>
      eligibleIds.has(id),
    );
    this.state.auction.passVotesNeeded = eligible.length;
  }

  private clearPassVotes(): void {
    this.state.auction.passVotes = [];
    this.refreshPassVoteTarget();
  }

  canVotePass(playerId: string): Result<Player> {
    if (!this.state.settings.passVoteEnabled) {
      return err('INVALID_STATE', 'Skip voting is turned off for this auction.');
    }
    const player = this.player(playerId);
    if (!player) return err('NOT_IN_GAME', 'You are not part of this auction.');
    if (player.isSpectator) return err('NOT_IN_GAME', 'Spectators cannot vote.');
    if (this.state.status !== 'ACTIVE') return err('AUCTION_ENDED', 'The auction has ended.');
    if (!['CHARACTER_REVEALED', 'BIDDING'].includes(this.state.auction.state)) {
      return err('INVALID_STATE', 'There is no lot on the block.');
    }
    if (player.roster.length >= this.state.settings.maxRoster) {
      return err('ROSTER_FULL', 'Your team is already complete.');
    }
    // Once real money is on the lot it is wanted, so skipping is off the table.
    if (this.state.auction.highestBidderId) {
      return err('INVALID_STATE', 'This lot already has a bid.');
    }
    return ok(player);
  }

  /**
   * Toggles one player's vote to skip the current lot. When every eligible player agrees
   * the lot is passed and the next character is revealed automatically.
   */
  votePass(playerId: string, wantsPass = true): Result<{ votes: number; needed: number }> {
    const eligibility = this.canVotePass(playerId);
    if (!eligibility.ok) return eligibility;
    const player = eligibility.value;

    this.refreshPassVoteTarget();
    const already = this.state.auction.passVotes.includes(playerId);

    if (wantsPass && !already) {
      this.state.auction.passVotes.push(playerId);
      this.pushFeed('PASS_VOTE', `${player.teamName} voted to skip.`, {
        playerId,
        characterId: this.state.auction.characterId ?? undefined,
      });
    } else if (!wantsPass && already) {
      this.state.auction.passVotes = this.state.auction.passVotes.filter((id) => id !== playerId);
      this.pushFeed('PASS_VOTE', `${player.teamName} withdrew their skip vote.`, { playerId });
    }

    const votes = this.state.auction.passVotes.length;
    const needed = this.state.auction.passVotesNeeded;
    this.emit();

    if (needed > 0 && votes >= needed) this.resolveUnanimousPass();
    return ok({ votes, needed });
  }

  /**
   * Re-evaluates a standing vote after the eligible set changes — someone disconnected,
   * filled their roster or was removed. A vote that is already unanimous resolves here
   * rather than waiting for another click that may never come.
   */
  private maybeResolvePassVote(): void {
    if (this.state.status !== 'ACTIVE') return;
    if (!['CHARACTER_REVEALED', 'BIDDING'].includes(this.state.auction.state)) return;
    if (this.state.auction.highestBidderId) return;
    if (!this.state.auction.characterId) return;

    this.refreshPassVoteTarget();
    const { passVotes, passVotesNeeded } = this.state.auction;
    if (passVotesNeeded > 0 && passVotes.length >= passVotesNeeded) {
      this.resolveUnanimousPass();
    }
  }

  /** Everyone agreed: pass the lot and bring out the next character. */
  private resolveUnanimousPass(): void {
    const character = this.currentCharacter;
    // If the floor was already open, the next lot opens too — otherwise every skip would
    // stall the room waiting on the host, which is the friction the vote exists to remove.
    const floorWasOpen = this.state.auction.state === 'BIDDING';

    this.pushFeed(
      'PASSED',
      character
        ? `Everyone passed on ${character.name}. Next lot.`
        : 'Everyone passed on this lot.',
      { characterId: character?.id },
    );
    this.finalizePass();

    if (this.state.remainingPool.length === 0) {
      this.checkAutoFinish();
      return;
    }

    const revealed = this.revealInternal();
    if (revealed.ok && floorWasOpen) this.openFloorInternal();
  }

  placeBid(playerId: string, amount: number): Result<BidRecord> {
    const eligibility = this.canBid(playerId);
    if (!eligibility.ok) return eligibility;
    const player = eligibility.value;

    const character = this.currentCharacter;
    if (!character) return err('INVALID_STATE', 'There is no character on the block.');

    const at = this.now();
    if (this.state.auction.endsAt !== null && at >= this.state.auction.endsAt) {
      return err('AUCTION_ENDED', 'The clock beat you to it.');
    }
    if (this.state.auction.highestBidderId === playerId) {
      return err('ALREADY_HIGHEST', 'You already hold the top bid.');
    }

    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      return err('VALIDATION', 'That is not a valid bid.');
    }
    if (value < this.state.auction.nextMinimumBid) {
      return err(
        'BID_TOO_LOW',
        `Minimum bid is ${this.state.auction.nextMinimumBid} credits.`,
      );
    }
    if (value > player.budget) {
      return err('INSUFFICIENT_CREDITS', 'You do not have enough credits for that bid.');
    }
    const ceiling = this.maxBidFor(playerId);
    if (value > ceiling) {
      const slotsLeft = this.state.settings.maxRoster - player.roster.length;
      return err(
        'INSUFFICIENT_CREDITS',
        `You must hold back credits for ${slotsLeft - 1} more slot${slotsLeft - 1 === 1 ? '' : 's'}. Your ceiling is ${ceiling}.`,
      );
    }

    /* --- accepted --- */
    const previousLeader = this.state.auction.highestBidderId;
    this.state.auction.currentBid = value;
    this.state.auction.highestBidderId = playerId;
    this.state.auction.nextMinimumBid = value + this.state.settings.minIncrement;
    this.roundBidCount += 1;
    // A bid proves the lot is wanted, so any standing skip votes no longer apply.
    this.clearPassVotes();

    let triggeredAntiSnipe = false;
    if (this.state.settings.antiSnipeEnabled && this.state.auction.endsAt !== null) {
      const remaining = this.state.auction.endsAt - at;
      const threshold = this.state.settings.antiSnipeThresholdSeconds * 1000;
      if (remaining <= threshold) {
        this.state.auction.endsAt = at + this.state.settings.antiSnipeExtensionSeconds * 1000;
        this.state.auction.extensions += 1;
        triggeredAntiSnipe = true;
      }
    }
    this.armTimer();

    const record: BidRecord = {
      id: id('bid'),
      round: this.state.auction.round,
      characterId: character.id,
      playerId,
      amount: value,
      at,
      offsetMs: Math.max(0, at - this.roundOpenedAt),
      triggeredAntiSnipe,
    };
    this.state.bids.push(record);

    this.pushFeed('BID', `${player.teamName} bids ${value} on ${character.name}.`, {
      playerId,
      characterId: character.id,
      amount: value,
    });
    if (triggeredAntiSnipe) {
      this.pushFeed(
        'ANTI_SNIPE',
        `Last-second bid — clock extended by ${this.state.settings.antiSnipeExtensionSeconds}s.`,
        { characterId: character.id },
      );
    }

    this.emit();
    void previousLeader;
    return ok(record);
  }

  /* ---------------------------------------------------------------- */
  /* Timer                                                             */
  /* ---------------------------------------------------------------- */

  private armTimer(): void {
    this.clearTimer();
    const endsAt = this.state.auction.endsAt;
    if (endsAt === null || this.state.auction.state !== 'BIDDING') return;
    const delay = Math.max(0, endsAt - this.now());
    this.timerHandle = this.scheduler.set(() => {
      this.timerHandle = null;
      this.onTimerExpired();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      this.scheduler.clear(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /** Exposed for tests driving a virtual clock. */
  tick(): void {
    if (this.state.auction.state !== 'BIDDING') return;
    const endsAt = this.state.auction.endsAt;
    if (endsAt !== null && this.now() >= endsAt) {
      this.clearTimer();
      this.onTimerExpired();
    }
  }

  private onTimerExpired(): void {
    if (this.state.auction.state !== 'BIDDING') return;

    if (!this.state.auction.highestBidderId) {
      this.finalizePass();
      return;
    }
    if (this.state.settings.manualSaleConfirmation) {
      this.state.auction.awaitingHostSale = true;
      this.state.auction.endsAt = null;
      this.pushFeed('SYSTEM', 'Clock expired — waiting on the host to confirm the sale.');
      this.emit();
      return;
    }
    this.finalizeSale();
  }

  /* ---------------------------------------------------------------- */
  /* Resolution                                                        */
  /* ---------------------------------------------------------------- */

  private finalizeSale(): Result<PurchaseRecord> {
    const character = this.currentCharacter;
    const winnerId = this.state.auction.highestBidderId;
    const winner = winnerId ? this.player(winnerId) : undefined;
    if (!character || !winner) {
      return err('VALIDATION', 'Nothing to sell.');
    }
    const price = this.state.auction.currentBid;

    // Final server-side guard: a race or a stale client must never overdraw an account.
    if (price > winner.budget) {
      this.pushFeed('SYSTEM', `Sale voided — ${winner.teamName} could not cover the bid.`);
      return this.finalizePass();
    }

    this.clearTimer();
    const at = this.now();

    winner.budget -= price;
    winner.spent += price;
    winner.roster.push({
      characterId: character.id,
      price,
      round: this.state.auction.round,
      at,
    });

    const record: PurchaseRecord = {
      id: id('pur'),
      round: this.state.auction.round,
      characterId: character.id,
      playerId: winner.id,
      price,
      at,
      bidCount: this.roundBidCount,
      passed: false,
    };
    this.state.purchases.push(record);
    this.state.soldCharacterIds.push(character.id);
    this.state.remainingPool = this.state.remainingPool.filter(
      (characterId) => characterId !== character.id,
    );

    this.state.auction.state = 'SOLD';
    this.state.auction.endsAt = null;
    this.state.auction.awaitingHostSale = false;

    this.pushFeed('SOLD', `${character.name} SOLD to ${winner.teamName} for ${price} credits.`, {
      playerId: winner.id,
      characterId: character.id,
      amount: price,
    });
    if (winner.roster.length >= this.state.settings.maxRoster) {
      this.pushFeed('ROSTER_FULL', `${winner.teamName} completed their roster.`, {
        playerId: winner.id,
      });
    }

    this.emit();
    return ok(record);
  }

  private finalizePass(): Result<PurchaseRecord> {
    const character = this.currentCharacter;
    if (!character) return err('VALIDATION', 'Nothing to pass.');

    this.clearTimer();
    const record: PurchaseRecord = {
      id: id('pur'),
      round: this.state.auction.round,
      characterId: character.id,
      playerId: null,
      price: 0,
      at: this.now(),
      bidCount: this.roundBidCount,
      passed: true,
    };
    this.state.purchases.push(record);
    this.state.passedCharacterIds.push(character.id);
    this.state.remainingPool = this.state.remainingPool.filter(
      (characterId) => characterId !== character.id,
    );

    this.state.auction.state = 'PASSED';
    this.state.auction.endsAt = null;
    this.state.auction.awaitingHostSale = false;
    this.pushFeed('PASSED', `${character.name} went unsold.`, { characterId: character.id });
    this.emit();
    return ok(record);
  }

  /** The auction ends on its own once nothing can still be bought. */
  private checkAutoFinish(): void {
    if (this.state.status !== 'ACTIVE') return;
    const poolEmpty = this.state.remainingPool.length === 0;
    const everyoneFull = this.contenders.every(
      (player) => player.roster.length >= this.state.settings.maxRoster,
    );
    if (poolEmpty) {
      this.finish('Every character in the vault has been auctioned.');
    } else if (this.contenders.length > 0 && everyoneFull) {
      this.finish('Every roster is complete.');
    }
  }

  private finish(reason: string): void {
    this.clearTimer();
    this.state.status = 'FINISHED';
    this.state.finishedAt = this.now();
    this.state.auction.state = 'FINISHED';
    this.state.auction.endsAt = null;
    this.pushFeed('SYSTEM', reason);
    this.emit();
  }

  /* ---------------------------------------------------------------- */
  /* Scoring projections                                               */
  /* ---------------------------------------------------------------- */

  rosterOf(playerId: string): Character[] {
    const player = this.player(playerId);
    if (!player) return [];
    return player.roster
      .map((purchase) => this.characters.get(purchase.characterId))
      .filter((character): character is Character => Boolean(character));
  }

  scoreOf(playerId: string): TeamScore {
    return scoreTeam(
      playerId,
      this.rosterOf(playerId),
      this.state.settings.scoring,
      this.synergyRules,
    );
  }

  leaderboard(): RankedTeam[] {
    const contenders = this.contenders;
    const scores = contenders.map((player) => this.scoreOf(player.id));
    return rankTeams(scores, contenders);
  }

  /** Serialisable snapshot for the wire. */
  snapshot(): GameState {
    return { ...this.state, serverTime: this.now() };
  }

  destroy(): void {
    this.clearTimer();
    this.listeners.clear();
  }
}
