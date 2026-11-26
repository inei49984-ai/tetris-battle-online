const assert = require('assert');
const http = require('http');
const { EventEmitter } = require('events');
const { createApp, sanitizeName, sanitizeSettings } = require('../server');

function createMockSocket(id) {
  const emitter = new EventEmitter();
  const emitted = [];
  const joinedRooms = new Set();

  return {
    id,
    emitted,
    joinedRooms,
    on: (ev, fn) => emitter.on(ev, fn),
    trigger: (ev, ...args) => emitter.emit(ev, ...args),
    emit: (ev, data) => emitted.push({ ev, data }),
    join: (roomId) => joinedRooms.add(roomId),
    leave: (roomId) => joinedRooms.delete(roomId),
    to: (roomId) => ({
      emit: (ev, data) => emitted.push({ targetRoom: roomId, ev, data }),
    }),
  };
}

async function runTests() {
  // 1. Test TetrisEngine (ESM dynamic import)
  const engineMod = await import('../public/js/tetris-engine.js');
  const { TetrisEngine, COLS, TOTAL_ROWS } = engineMod;

  const e1 = new TetrisEngine({ seed: 424242 });
  const e2 = new TetrisEngine({ seed: 424242 });
  assert.strictEqual(e1.active.type, e2.active.type, 'Same seed should spawn same first piece');
  assert.deepStrictEqual(e1.queue, e2.queue, 'Same seed should produce identical next queue');

  // Test hold piece
  const firstType = e1.active.type;
  assert.strictEqual(e1.holdPiece(), true, 'First hold should succeed');
  assert.strictEqual(e1.hold, firstType, 'Hold slot should store first piece');
  assert.strictEqual(e1.holdPiece(), false, 'Cannot hold twice on same piece');

  // Test garbage cancellation & attack
  let attackedLines = 0;
  const eAttack = new TetrisEngine({
    seed: 12345,
    onAttack: (atk) => {
      attackedLines += atk.lines;
    },
  });
  // Fill bottom 4 rows leaving col 0 empty, plus 1 leftover block above so it's not a Perfect Clear
  for (let r = TOTAL_ROWS - 4; r < TOTAL_ROWS; r++) {
    for (let c = 1; c < COLS; c++) {
      eAttack.board[r][c] = 'J';
    }
  }
  eAttack.board[TOTAL_ROWS - 5][5] = 'T';
  eAttack.queueGarbage(2);
  eAttack.active = { type: 'I', rot: 1, x: -2, y: TOTAL_ROWS - 4 };
  assert.strictEqual(eAttack.isValidPosition(eAttack.active), true, 'Vertical I piece should fit in col 0');
  const clearRes = eAttack.hardDrop();
  assert.strictEqual(clearRes.cleared, 4, 'Should clear 4 lines (Tetris)');
  assert.strictEqual(clearRes.garbageCancelled, 2, 'Should cancel 2 pending garbage lines');
  assert.strictEqual(clearRes.attackSent, 2, 'Remaining 2 lines should be sent as attack');
  assert.strictEqual(attackedLines, 2, 'onAttack callback should receive 2 lines');
  assert.strictEqual(eAttack.pendingGarbage, 0, 'Pending garbage should be 0 after cancellation');

  // Test AI Bot move finder
  const aiMod = await import('../public/js/ai-bot.js');
  const aiEngine = new TetrisEngine({ seed: 999 });
  const bestMove = aiMod.findBestMove(aiEngine, 'hard');
  assert.ok(bestMove && typeof bestMove.x === 'number', 'AI should find a valid move');

  // Test applying pending garbage when no line is cleared
  eAttack.queueGarbage(3);
  eAttack.hardDrop();
  let garbageCount = 0;
  for (let r = TOTAL_ROWS - 3; r < TOTAL_ROWS; r++) {
    const gCells = eAttack.board[r].filter((cell) => cell === 'G').length;
    if (gCells === COLS - 1) garbageCount++;
  }
  assert.strictEqual(garbageCount, 3, 'Should add 3 garbage rows with 1 hole each');

  // 2. Test server sanitizers
  assert.strictEqual(sanitizeName('  <b>Alice</b>\n '), 'bAlice/b');
  assert.strictEqual(sanitizeName(''), 'Player');
  assert.deepStrictEqual(sanitizeSettings({ startLevel: 99, targetWins: 5, garbageMultiplier: 2 }), {
    startLevel: 15,
    targetWins: 2,
    garbageMultiplier: 2,
  });

  // 3. Test Express HTTP server + /healthz + static index.html
  const { server, io, manager } = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const healthRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/healthz`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.body.ok, true);

  const indexRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
  assert.strictEqual(indexRes.status, 200);
  assert.ok(indexRes.body.includes('TETRIS BATTLE ONLINE'), 'Root should serve index.html');

  // 4. Test Room Manager matchmaking & battle flow
  const s1 = createMockSocket('sock-1');
  const s2 = createMockSocket('sock-2');
  io.sockets.sockets.set('sock-1', s1);
  io.sockets.sockets.set('sock-2', s2);

  manager.handleConnection(s1);
  manager.handleConnection(s2);

  s1.trigger('room_create', { name: 'Taro', settings: { targetWins: 2 } });
  const joinedEv = s1.emitted.find((e) => e.ev === 'room_joined');
  assert.ok(joinedEv, 'Host should receive room_joined');
  const roomId = joinedEv.data.id;

  s2.trigger('room_join', { roomId, name: 'Hanako' });
  const s2Joined = s2.emitted.find((e) => e.ev === 'room_joined');
  assert.ok(s2Joined, 'Guest should join room');
  assert.strictEqual(s2Joined.data.players.length, 2);

  s1.trigger('room_ready', { ready: true });
  s2.trigger('room_ready', { ready: true });
  const room = manager.rooms.get(roomId);
  assert.ok(room, 'Room should exist');
  assert.strictEqual(room.roundNumber, 1, 'Round 1 should start when both players are ready');

  // Simulate playing state & garbage relay & top out
  room.state = 'playing';
  s1.trigger('send_garbage', { lines: 4, attackType: 'TETRIS!' });
  const relayGarbage = s1.emitted.find((e) => e.ev === 'receive_garbage' && e.targetRoom === roomId);
  assert.ok(relayGarbage, 'Garbage should be relayed to opponent in room');
  assert.strictEqual(relayGarbage.data.lines, 4);

  s2.trigger('player_top_out', { stats: { score: 1000 } });
  assert.strictEqual(room.players.find((p) => p.id === 'sock-1').wins, 1, 'Winner should get 1 win');

  // Cleanup timers and server
  s1.trigger('disconnect');
  s2.trigger('disconnect');
  await new Promise((resolve) => server.close(resolve));

  console.log('ALL TESTS PASSED!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
