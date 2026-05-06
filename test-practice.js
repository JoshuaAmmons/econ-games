/**
 * Integration test for solo + bots practice mode.
 *
 *   node test-practice.js [gameType] [runs] [action] [backend]
 *
 * Defaults: gameType=prisoner_dilemma, runs=5, action=cooperate, backend=production.
 *
 * Each run:
 *   1. POST /api/practice/<gameType>/start         → { sessionCode, playerId }
 *   2. Connect to socket.io and join market room
 *   3. Wait for the active round to appear in the rounds API
 *   4. Submit one action via 'submit-action'
 *   5. Wait for 'round-ended' (or time out after timePerRound + 10s)
 *   6. Disconnect
 *
 * Reports per-run pass/fail and a final summary. Exit code is non-zero
 * if any run fails.
 */

const io = require('./frontend/node_modules/socket.io-client');
const https = require('https');
const http = require('http');

const GAME_TYPE = process.argv[2] || 'prisoner_dilemma';
const RUNS = parseInt(process.argv[3] || '5', 10);
const ACTION_ARG = process.argv[4] || 'cooperate';
const BACKEND = process.argv[5] || 'https://econ-games-production.up.railway.app';

const isHttps = BACKEND.startsWith('https://');
const httpLib = isHttps ? https : http;

// ─── Per-game default action used by this test ─────────────────────────────
function defaultActionFor(gameType, hint) {
  if (gameType === 'prisoner_dilemma') return { choice: hint === 'defect' ? 'defect' : 'cooperate' };
  if (gameType === 'stag_hunt') return { choice: hint === 'hare' ? 'hare' : 'stag' };
  if (gameType === 'ultimatum') return { offer: 5 };
  if (gameType === 'beauty_contest') return { number: 33 };
  if (gameType === 'cournot') return { quantity: 30 };
  if (gameType === 'bertrand') return { price: 12 };
  if (gameType === 'public_goods') return { contribution: 10 };
  if (gameType === 'dictator') return { give: 4 };
  if (gameType === 'newsvendor') return { orderQuantity: 50 };
  if (gameType === 'trust_game') return { amountSent: 5 };
  if (gameType === 'comparative_advantage') return { laborGood1: 60 };
  return { choice: hint };
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND + path);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = httpLib.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (e) {
          reject(new Error(`Parse error from ${method} ${path}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Single run ────────────────────────────────────────────────────────────
async function runOnce(runIdx, gameType, action) {
  const log = (...args) => console.log(`[run ${runIdx}]`, ...args);

  // 1. Start practice session
  const startRes = await request('POST', `/api/practice/${gameType}/start`, { name: `Tester ${runIdx}` });
  if (startRes.status !== 201 || !startRes.body?.success) {
    throw new Error(`start failed (${startRes.status}): ${JSON.stringify(startRes.body)}`);
  }
  const { sessionCode, sessionId, playerId, marketSize, numRounds, timePerRound } =
    startRes.body.data;
  log(`session ${sessionCode}, ${marketSize} seats, ${numRounds} rounds × ${timePerRound}s, playerId=${playerId.slice(0, 8)}…`);

  // 2. Connect socket
  const socket = io(BACKEND, {
    transports: ['websocket'],
    forceNew: true,
    timeout: 8000,
  });

  let socketError = null;
  socket.on('error', (e) => { socketError = e; });
  socket.on('connect_error', (e) => { socketError = e; });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (e) => {
      clearTimeout(timer);
      reject(new Error(`socket connect_error: ${e.message || e}`));
    });
  });
  log(`socket connected (id=${socket.id})`);

  // Join the rooms the server expects
  socket.emit('join-session', { sessionCode, playerId });
  socket.emit('join-market', { sessionCode, playerId });

  // 3. Wait for the active round (poll the rounds API; the round is
  // started by the practice endpoint before it returns, so this is fast)
  let activeRound = null;
  for (let i = 0; i < 20; i++) {
    const r = await request('GET', `/api/sessions/${sessionId}/rounds`);
    const rounds = r.body?.data || [];
    activeRound = rounds.find((rd) => rd.status === 'active');
    if (activeRound) break;
    await new Promise((res) => setTimeout(res, 250));
  }
  if (!activeRound) {
    socket.disconnect();
    throw new Error('no active round appeared within 5s');
  }
  log(`active round ${activeRound.round_number} (id=${activeRound.id.slice(0, 8)}…)`);

  // 4. Submit one action and wait for round-ended
  const result = await new Promise((resolve, reject) => {
    const timeoutMs = (timePerRound + 15) * 1000;
    const timer = setTimeout(() => {
      reject(new Error(`round-ended not received within ${timeoutMs}ms`));
    }, timeoutMs);

    socket.on('round-ended', (data) => {
      clearTimeout(timer);
      resolve(data);
    });

    socket.emit('submit-action', {
      roundId: activeRound.id,
      playerId,
      sessionCode,
      action,
    });
    log(`submitted action ${JSON.stringify(action)}`);
  });

  // 5. Verify the result has the expected shape
  if (!result || !result.results || !Array.isArray(result.results.playerResults)) {
    socket.disconnect();
    throw new Error(`malformed round-ended payload: ${JSON.stringify(result).slice(0, 200)}`);
  }
  const myResult = result.results.playerResults.find((p) => p.playerId === playerId);
  if (!myResult) {
    socket.disconnect();
    throw new Error('my playerId missing from round results');
  }
  log(`round ended: my profit=${myResult.profit}, ${result.results.playerResults.length} players reported`);

  // 6. Tear down — disconnect cleanly
  socket.disconnect();

  if (socketError) {
    throw new Error(`socket error during run: ${socketError.message || socketError}`);
  }

  return { ok: true, sessionCode, profit: myResult.profit };
}

// ─── Top-level driver ──────────────────────────────────────────────────────
(async () => {
  console.log(`Practice-mode test: ${RUNS} runs of ${GAME_TYPE} against ${BACKEND}`);
  console.log(`Action per run: ${ACTION_ARG}`);
  console.log('---');

  const results = [];
  for (let i = 1; i <= RUNS; i++) {
    const action = defaultActionFor(GAME_TYPE, ACTION_ARG);
    try {
      const r = await runOnce(i, GAME_TYPE, action);
      results.push({ run: i, ok: true, ...r });
      console.log(`[run ${i}] ✅  PASS\n`);
    } catch (err) {
      results.push({ run: i, ok: false, error: err.message });
      console.log(`[run ${i}] ❌  FAIL: ${err.message}\n`);
    }
    // brief gap between runs
    await new Promise((res) => setTimeout(res, 500));
  }

  console.log('---');
  console.log('Summary:');
  for (const r of results) {
    if (r.ok) {
      console.log(`  run ${r.run}: PASS  session=${r.sessionCode}  profit=${r.profit}`);
    } else {
      console.log(`  run ${r.run}: FAIL  ${r.error}`);
    }
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${RUNS} runs passed.`);
  process.exit(passed === RUNS ? 0 : 1);
})();
