/**
 * Live end-to-end check against a running server.
 *
 * Drives three real socket clients through a full auction: create, join, start, reveal,
 * competitive bidding, anti-snipe, sale, roster limits, disconnect/reconnect, finish and
 * archive. Run with:  node tests/e2e-live.mjs [port]
 */
import { io } from 'socket.io-client';

const PORT = process.argv[2] ?? '3111';
const BASE = `http://localhost:${PORT}`;
const ADMIN_TOKEN = process.env.MARVEL_ADMIN_TOKEN ?? 'marvel-admin';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

function connect(name) {
  const socket = io(BASE, { path: '/api/realtime', transports: ['websocket'] });
  socket.data = { name, states: [], pulses: [] };
  socket.on('state', (payload) => {
    socket.data.latest = payload;
    socket.data.states.push(payload);
  });
  socket.on('pulse', (pulse) => socket.data.pulses.push(pulse));
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error(`${name} could not connect`)), 8000);
  });
}

function send(socket, event, payload = {}) {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
    setTimeout(() => resolve({ ok: false, error: { code: 'TIMEOUT', message: 'no ack' } }), 6000);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`\nMARVEL: THE AUCTION — live end-to-end against ${BASE}\n`);

  const host = await connect('Host');
  const alpha = await connect('Alpha');
  const omega = await connect('Omega');

  /* ---------------------- create + join ---------------------- */
  const created = await send(host, 'room:create', {
    settings: {
      name: 'E2E Battle',
      startingBudget: 1000,
      maxRoster: 2,
      auctionSeconds: 8,
      minIncrement: 10,
      antiSnipeEnabled: true,
      antiSnipeThresholdSeconds: 3,
      antiSnipeExtensionSeconds: 3,
      reserveBudgetForSlots: false,
      hostPlays: false,
      minPlayers: 2,
    },
    host: { name: 'Fury', teamName: 'Command', avatar: 'shield' },
  });
  check('host creates a room', created.ok, JSON.stringify(created.error));
  const code = created.data?.code;
  check('room code issued', typeof code === 'string' && code.length === 6, code);

  const joinAlpha = await send(alpha, 'room:join', {
    code,
    name: 'Alpha',
    teamName: 'Team Alpha',
    avatar: 'star',
  });
  const joinOmega = await send(omega, 'room:join', {
    code,
    name: 'Omega',
    teamName: 'Team Omega',
    avatar: 'flame',
  });
  check('player Alpha joins', joinAlpha.ok, JSON.stringify(joinAlpha.error));
  check('player Omega joins', joinOmega.ok, JSON.stringify(joinOmega.error));

  const duplicate = await send(omega, 'room:join', { code, name: 'Alpha', teamName: 'X', avatar: 'star' });
  check('duplicate name rejected', !duplicate.ok && duplicate.error?.code === 'NAME_TAKEN');

  const badRoom = await send(alpha, 'room:join', { code: 'ZZZZZZ', name: 'Ghost', teamName: 'X', avatar: 'star' });
  check('unknown room rejected', !badRoom.ok && badRoom.error?.code === 'ROOM_NOT_FOUND');

  await wait(300);
  check('all clients received state', Boolean(host.data.latest && alpha.data.latest && omega.data.latest));

  const publicRooms = await fetch(`${BASE}/api/rooms`).then((response) => response.json());
  check(
    'REST API sees the room created over the socket',
    publicRooms.rooms.some((room) => room.code === code),
    JSON.stringify(publicRooms.rooms),
  );
  check(
    'lobby shows three seats',
    alpha.data.latest?.state.players.length === 3,
    String(alpha.data.latest?.state.players.length),
  );

  /* ------------------ authorisation boundary ----------------- */
  const playerStart = await send(alpha, 'host:start');
  check('non-host cannot start the auction', !playerStart.ok && playerStart.error?.code === 'NOT_HOST');

  const started = await send(host, 'host:start');
  check('host starts the auction', started.ok, JSON.stringify(started.error));

  /* ----------------------- lot one --------------------------- */
  const reveal = await send(host, 'host:reveal', { characterId: 'iron-man' });
  check('host reveals Iron Man', reveal.ok, JSON.stringify(reveal.error));
  await wait(200);
  check(
    'clients see CHARACTER_REVEALED',
    alpha.data.latest?.state.auction.state === 'CHARACTER_REVEALED',
    alpha.data.latest?.state.auction.state,
  );

  const earlyBid = await send(alpha, 'bid:place', { amount: 500 });
  check('bidding blocked before the floor opens', !earlyBid.ok && earlyBid.error?.code === 'INVALID_STATE');

  const opened = await send(host, 'host:open');
  check('host opens the floor', opened.ok, JSON.stringify(opened.error));
  await wait(200);

  const basePrice = alpha.data.latest?.state.auction.nextMinimumBid;
  const lowBid = await send(alpha, 'bid:place', { amount: Math.max(1, basePrice - 5) });
  check('below-minimum bid rejected', !lowBid.ok && lowBid.error?.code === 'BID_TOO_LOW');

  const negative = await send(alpha, 'bid:place', { amount: -50 });
  check('negative bid rejected', !negative.ok);

  const overspend = await send(alpha, 'bid:place', { amount: 99999 });
  check('overspend rejected', !overspend.ok && overspend.error?.code === 'INSUFFICIENT_CREDITS');

  const firstBid = await send(alpha, 'bid:place', { amount: basePrice });
  check('opening bid accepted', firstBid.ok, JSON.stringify(firstBid.error));

  const selfOutbid = await send(alpha, 'bid:place', { amount: basePrice + 100 });
  check('self-outbid rejected', !selfOutbid.ok && selfOutbid.error?.code === 'ALREADY_HIGHEST');

  const counter = await send(omega, 'bid:place', { amount: basePrice + 50 });
  check('rival outbids', counter.ok, JSON.stringify(counter.error));
  await wait(250);
  check(
    'alpha was told they were outbid',
    alpha.data.pulses.some((pulse) => pulse.type === 'OUTBID'),
  );
  check(
    'all clients agree on the leading bid',
    host.data.latest?.state.auction.currentBid === basePrice + 50 &&
      alpha.data.latest?.state.auction.currentBid === basePrice + 50 &&
      omega.data.latest?.state.auction.currentBid === basePrice + 50,
  );

  /* -------------------- anti-snipe ---------------------------- */
  const endsBefore = alpha.data.latest?.state.auction.endsAt ?? 0;
  const remaining = endsBefore - Date.now();
  await wait(Math.max(0, remaining - 1500)); // slip inside the 3s anti-snipe window

  const snipe = await send(alpha, 'bid:place', { amount: basePrice + 120 });
  check('last-second bid accepted', snipe.ok, JSON.stringify(snipe.error));
  await wait(250);
  check(
    'anti-snipe extended the clock',
    (alpha.data.latest?.state.auction.extensions ?? 0) >= 1,
    `extensions=${alpha.data.latest?.state.auction.extensions}`,
  );

  /* ---------------------- auto sale --------------------------- */
  await wait(4500);
  check(
    'clock expiry sold the lot',
    alpha.data.latest?.state.auction.state === 'SOLD',
    alpha.data.latest?.state.auction.state,
  );

  const alphaPlayer = alpha.data.latest?.state.players.find((p) => p.name === 'Alpha');
  check('winner received the character', alphaPlayer?.roster.length === 1);
  check(
    'credits deducted exactly',
    alphaPlayer?.budget === 1000 - (basePrice + 120) && alphaPlayer?.spent === basePrice + 120,
    `budget=${alphaPlayer?.budget} spent=${alphaPlayer?.spent}`,
  );
  check(
    'character removed from the pool',
    !alpha.data.latest?.state.remainingPool.includes('iron-man'),
  );

  /* ----------------- reconnect keeps state -------------------- */
  const resumed = await send(alpha, 'room:resume', {
    code,
    playerId: created.data ? joinAlpha.data.playerId : '',
    token: joinAlpha.data.token,
  });
  check('reconnect with a valid token succeeds', resumed.ok, JSON.stringify(resumed.error));
  check('reconnect restores the roster', resumed.data?.state.players.find((p) => p.name === 'Alpha')?.roster.length === 1);

  const forged = await send(omega, 'room:resume', {
    code,
    playerId: joinAlpha.data.playerId,
    token: 'forged-token-that-is-long-enough',
  });
  check('reconnect with a forged token rejected', !forged.ok);

  /* ---------------- group skip (pass vote) -------------------- */
  await send(host, 'host:next');
  await send(host, 'host:reveal', { characterId: 'hawkeye' });
  await send(host, 'host:open');
  await wait(200);

  const beforeSkipRound = alpha.data.latest?.state.auction.round;
  const skipNeeded = alpha.data.latest?.viewer?.passVotesNeeded ?? 0;
  check('pass vote counts both bidders', skipNeeded === 2, `needed=${skipNeeded}`);

  const firstVote = await send(alpha, 'vote:pass', { pass: true });
  check('first skip vote accepted', firstVote.ok, JSON.stringify(firstVote.error));
  await wait(200);
  check(
    'one vote does not skip the lot',
    alpha.data.latest?.state.auction.characterId === 'hawkeye',
    String(alpha.data.latest?.state.auction.characterId),
  );
  check('tally is visible to the voter', alpha.data.latest?.viewer?.hasVotedPass === true);

  const secondVote = await send(omega, 'vote:pass', { pass: true });
  check('second skip vote accepted', secondVote.ok, JSON.stringify(secondVote.error));
  await wait(400);

  check(
    'unanimous vote passed the lot',
    alpha.data.latest?.state.passedCharacterIds.includes('hawkeye'),
    JSON.stringify(alpha.data.latest?.state.passedCharacterIds),
  );
  check(
    'a new character was revealed automatically',
    alpha.data.latest?.state.auction.characterId !== null &&
      alpha.data.latest?.state.auction.characterId !== 'hawkeye' &&
      (alpha.data.latest?.state.auction.round ?? 0) > (beforeSkipRound ?? 0),
    `now=${alpha.data.latest?.state.auction.characterId} round=${alpha.data.latest?.state.auction.round}`,
  );
  check('tally reset for the new lot', (alpha.data.latest?.viewer?.passVotes ?? 99) === 0);

  // A bid cancels any standing skip vote.
  await send(alpha, 'vote:pass', { pass: true });
  await wait(150);
  const bidMin = omega.data.latest?.state.auction.nextMinimumBid ?? 100;
  await send(omega, 'bid:place', { amount: bidMin });
  await wait(250);
  check('a bid clears the skip tally', (alpha.data.latest?.viewer?.passVotes ?? 99) === 0);
  const afterBidVote = await send(alpha, 'vote:pass', { pass: true });
  check('skip refused once a lot has a bid', !afterBidVote.ok, JSON.stringify(afterBidVote.error));
  await send(host, 'host:pass');
  await wait(200);

  /* ------------------------ lot two --------------------------- */
  await send(host, 'host:next');
  await send(host, 'host:reveal', { characterId: 'thor' });
  await send(host, 'host:open');
  await wait(150);

  const thorMin = omega.data.latest?.state.auction.nextMinimumBid;
  await send(omega, 'bid:place', { amount: thorMin });
  const sold = await send(host, 'host:sell');
  check('host can sell immediately', sold.ok, JSON.stringify(sold.error));
  await wait(200);

  /* ------------------ roster limit enforcement ---------------- */
  await send(host, 'host:next');
  await send(host, 'host:reveal', { characterId: 'hulk' });
  await send(host, 'host:open');
  await wait(150);
  const hulkMin = alpha.data.latest?.state.auction.nextMinimumBid;
  await send(alpha, 'bid:place', { amount: hulkMin });
  await send(host, 'host:sell');
  await wait(200);

  await send(host, 'host:next');
  await send(host, 'host:reveal', { characterId: 'wolverine' });
  await send(host, 'host:open');
  await wait(150);
  const blocked = await send(alpha, 'bid:place', {
    amount: alpha.data.latest?.state.auction.nextMinimumBid ?? 100,
  });
  check(
    'full roster blocks further bidding',
    !blocked.ok && blocked.error?.code === 'ROSTER_FULL',
    JSON.stringify(blocked.error),
  );
  check('viewer state reports roster full', alpha.data.latest?.viewer?.rosterFull === true);
  check('viewer state offers no quick bids', (alpha.data.latest?.viewer?.quickBids ?? []).length === 0);

  await send(host, 'host:pass');
  await wait(150);
  check(
    'passed lot leaves the board',
    alpha.data.latest?.state.passedCharacterIds.includes('wolverine'),
  );

  /* ------------------------ finish ---------------------------- */
  await send(host, 'host:next');
  await wait(300);
  const finishedByItself = alpha.data.latest?.state.status === 'FINISHED';
  if (!finishedByItself) {
    const ended = await send(host, 'host:end');
    check('host ends the auction', ended.ok, JSON.stringify(ended.error));
  } else {
    check('auction finished automatically once rosters filled', true);
  }
  await wait(600);

  const finalState = alpha.data.latest?.state;
  check('game is FINISHED', finalState?.status === 'FINISHED', finalState?.status);

  const board = alpha.data.latest?.leaderboard ?? [];
  check('leaderboard ranked', board.length === 2 && board[0].rank === 1);
  check(
    'winner score is fully decomposed',
    board[0] &&
      board[0].total ===
        board[0].characterPower +
          board[0].synergyBonus +
          board[0].balanceBonus +
          board[0].leadershipBonus -
          board[0].penalty,
  );

  const afterEnd = await send(alpha, 'bid:place', { amount: 500 });
  check('bidding rejected after the auction ends', !afterEnd.ok);

  /* ------------------------ archive --------------------------- */
  await wait(1200);
  const archiveResponse = await fetch(`${BASE}/api/archives/${code}`);
  check('archive endpoint returns the finished game', archiveResponse.ok);
  if (archiveResponse.ok) {
    const archive = await archiveResponse.json();
    check('archive carries the full bid log', archive.game.bids.length >= 5, String(archive.game.bids.length));
    check('archive carries analytics', typeof archive.analytics.averagePrice === 'number');
    check('archive ships only the characters used', archive.characters.length <= 6);
    check('archive rankings present', archive.rankings.length === 2);
  }

  const profiles = await fetch(`${BASE}/api/profiles`).then((response) => response.json());
  check('career profiles recorded', profiles.profiles.length >= 2);

  /* --------------------- admin boundary ----------------------- */
  const unauth = await fetch(`${BASE}/api/characters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'x', name: 'X' }),
  });
  check('admin write rejected without a token', unauth.status === 401);

  const badPayload = await fetch(`${BASE}/api/characters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
    body: JSON.stringify({ id: 'BAD ID!', name: '' }),
  });
  check('admin write validates its payload', badPayload.status === 400, `status=${badPayload.status}`);

  /* --------------------- rate limiting ------------------------ */
  const burst = await Promise.all(
    Array.from({ length: 14 }, () => send(omega, 'bid:place', { amount: 10 })),
  );
  check(
    'bid spam is rate limited',
    burst.some((response) => response.error?.code === 'RATE_LIMITED'),
  );

  host.disconnect();
  alpha.disconnect();
  omega.disconnect();

  console.log(`\n${failures === 0 ? 'ALL LIVE CHECKS PASSED' : `${failures} LIVE CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('e2e crashed:', error);
  process.exit(1);
});
