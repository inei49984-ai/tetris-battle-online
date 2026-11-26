import { TetrisEngine } from './tetris-engine.js';
import { AiController } from './ai-bot.js';
import { sound } from './audio.js';
import {
  renderBoard,
  renderHoldCanvas,
  renderNextCanvas,
  renderGarbageBar,
} from './renderer.js';

const $ = (id) => document.getElementById(id);

const els = {
  connDot: $('connDot'),
  connText: $('connText'),
  pingBadge: $('pingBadge'),
  coldStartBanner: $('coldStartBanner'),
  muteBtn: $('muteBtn'),
  settingsBtn: $('settingsBtn'),

  lobbyView: $('lobbyView'),
  roomView: $('roomView'),
  battleView: $('battleView'),

  playerNameInput: $('playerNameInput'),
  statOnline: $('statOnline'),
  statQueue: $('statQueue'),
  statBattles: $('statBattles'),

  quickMatchBtn: $('quickMatchBtn'),
  cancelQueueBtn: $('cancelQueueBtn'),
  queueStatus: $('queueStatus'),

  createRoomBtn: $('createRoomBtn'),
  roomCodeInput: $('roomCodeInput'),
  joinRoomBtn: $('joinRoomBtn'),

  cpuDifficultySelect: $('cpuDifficultySelect'),
  startCpuBtn: $('startCpuBtn'),
  startSoloBtn: $('startSoloBtn'),

  displayRoomCode: $('displayRoomCode'),
  copyRoomUrlBtn: $('copyRoomUrlBtn'),
  leaveRoomBtn: $('leaveRoomBtn'),
  slot0: $('slot0'),
  slot1: $('slot1'),
  settingTargetWins: $('settingTargetWins'),
  settingStartLevel: $('settingStartLevel'),
  settingGarbageMult: $('settingGarbageMult'),
  readyBtn: $('readyBtn'),

  battleModeLabel: $('battleModeLabel'),
  roundLabel: $('roundLabel'),
  myBannerName: $('myBannerName'),
  oppBannerName: $('oppBannerName'),
  myWinPips: $('myWinPips'),
  oppWinPips: $('oppWinPips'),
  exitBattleBtn: $('exitBattleBtn'),

  myBoardCanvas: $('myBoardCanvas'),
  myHoldCanvas: $('myHoldCanvas'),
  myNextCanvas: $('myNextCanvas'),
  myGarbageFill: $('myGarbageFill'),
  myScore: $('myScore'),
  myAttack: $('myAttack'),
  myLinesLevel: $('myLinesLevel'),
  mySpeed: $('mySpeed'),
  b2bBadge: $('b2bBadge'),
  comboBadge: $('comboBadge'),
  comboText: $('comboText'),
  countdownOverlay: $('countdownOverlay'),
  myActionToast: $('myActionToast'),
  myEmoteBubble: $('myEmoteBubble'),

  opponentStage: $('opponentStage'),
  oppBoardCanvas: $('oppBoardCanvas'),
  oppHoldCanvas: $('oppHoldCanvas'),
  oppGarbageFill: $('oppGarbageFill'),
  oppNameLabel: $('oppNameLabel'),
  oppScore: $('oppScore'),
  oppAttack: $('oppAttack'),
  oppLines: $('oppLines'),
  oppActionToast: $('oppActionToast'),
  oppEmoteBubble: $('oppEmoteBubble'),
  emoteBar: $('emoteBar'),

  resultModal: $('resultModal'),
  resultTitle: $('resultTitle'),
  resultSubtitle: $('resultSubtitle'),
  resultStats: $('resultStats'),
  resultLobbyBtn: $('resultLobbyBtn'),
  rematchBtn: $('rematchBtn'),

  settingsModal: $('settingsModal'),
  dasRange: $('dasRange'),
  arrRange: $('arrRange'),
  sdfRange: $('sdfRange'),
  dasValue: $('dasValue'),
  arrValue: $('arrValue'),
  sdfValue: $('sdfValue'),
  closeSettingsBtn: $('closeSettingsBtn'),

  toastNotice: $('toastNotice'),
};

const state = {
  socket: null,
  connected: false,
  myId: null,
  mode: 'lobby', // 'lobby' | 'online' | 'cpu' | 'solo'
  room: null,
  roundActive: false,
  countdownActive: false,
  myEngine: null,
  oppEngine: null, // Used in CPU mode
  aiController: null,
  oppSnapshot: null,
  lastFrameTime: 0,
  rafId: null,
  lastSyncSentAt: 0,
  dirtySync: false,
  cpuWins: 0,
  myLocalWins: 0,
  dasMs: Number(localStorage.getItem('tetris_das')) || 130,
  arrMs: Number(localStorage.getItem('tetris_arr')) || 25,
  sdfMs: Number(localStorage.getItem('tetris_sdf')) || 35,
};

const inputState = {
  left: false,
  right: false,
  down: false,
  horizDir: 0,
  dasTimer: 0,
  arrTimer: 0,
  sdfTimer: 0,
};

let toastTimer = null;
function showNotice(msg, duration = 2800) {
  els.toastNotice.textContent = msg;
  els.toastNotice.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toastNotice.classList.add('hidden');
  }, duration);
}

let actionToastTimers = { my: null, opp: null };
function showActionToast(side, text) {
  if (!text) return;
  const target = side === 'my' ? els.myActionToast : els.oppActionToast;
  target.textContent = text;
  target.classList.remove('hidden');
  clearTimeout(actionToastTimers[side]);
  actionToastTimers[side] = setTimeout(() => {
    target.classList.add('hidden');
  }, 1200);
}

let emoteTimers = { my: null, opp: null };
function showEmoteBubble(side, text) {
  const target = side === 'my' ? els.myEmoteBubble : els.oppEmoteBubble;
  target.textContent = text;
  target.classList.remove('hidden');
  clearTimeout(emoteTimers[side]);
  emoteTimers[side] = setTimeout(() => {
    target.classList.add('hidden');
  }, 2400);
}

function getPlayerName() {
  const val = els.playerNameInput.value.trim();
  const clean = val || 'Player';
  localStorage.setItem('tetris_name', clean);
  return clean;
}

function switchView(viewName) {
  els.lobbyView.classList.toggle('hidden', viewName !== 'lobby');
  els.roomView.classList.toggle('hidden', viewName !== 'room');
  els.battleView.classList.toggle('hidden', viewName !== 'battle');
}

function renderWinPips(container, wins, targetWins) {
  container.innerHTML = '';
  for (let i = 0; i < targetWins; i++) {
    const pip = document.createElement('span');
    pip.className = `pip${i < wins ? ' filled' : ''}`;
    container.appendChild(pip);
  }
}

function setQueueUI(waiting) {
  els.quickMatchBtn.classList.toggle('hidden', waiting);
  els.cancelQueueBtn.classList.toggle('hidden', !waiting);
  els.queueStatus.classList.toggle('hidden', !waiting);
}

function updateRoomUI(room) {
  state.room = room;
  els.displayRoomCode.textContent = room.id;

  const isHost = room.hostId === state.myId;
  els.settingTargetWins.value = String(room.settings.targetWins);
  els.settingStartLevel.value = String(room.settings.startLevel);
  els.settingGarbageMult.value = String(room.settings.garbageMultiplier);
  els.settingTargetWins.disabled = !isHost;
  els.settingStartLevel.disabled = !isHost;
  els.settingGarbageMult.disabled = !isHost;

  const slots = [els.slot0, els.slot1];
  for (let i = 0; i < 2; i++) {
    const p = room.players[i];
    const slot = slots[i];
    const nameEl = slot.querySelector('.slot-name');
    const statusEl = slot.querySelector('.slot-status');
    if (p) {
      nameEl.textContent = `${p.name}${p.id === room.hostId ? ' 👑' : ''}${p.id === state.myId ? ' (あなた)' : ''}`;
      statusEl.textContent = p.ready ? '✅ 準備完了' : '⏳ 待機中';
      slot.classList.toggle('ready', p.ready);
    } else {
      nameEl.textContent = '参加者を待機中...';
      statusEl.textContent = '招待リンクを送ってください';
      slot.classList.remove('ready');
    }
  }

  const me = room.players.find((p) => p.id === state.myId);
  if (me && me.ready) {
    els.readyBtn.textContent = '準備完了を解除';
    els.readyBtn.classList.remove('btn-green');
  } else {
    els.readyBtn.textContent = '準備完了！';
    els.readyBtn.classList.add('btn-green');
  }
}

function bindEngineEvents(engine, isLocalPlayer) {
  engine.onEvent = (type, detail) => {
    if (isLocalPlayer) {
      state.dirtySync = true;
      if (type === 'move') sound.move();
      else if (type === 'rotate') sound.rotate();
      else if (type === 'hold') sound.hold();
      else if (type === 'hard_drop') sound.hardDrop();
      else if (type === 'line_clear') {
        sound.lineClear(detail.cleared, detail.tSpin !== 'none' || detail.isPerfectClear);
        if (detail.actionLabel) showActionToast('my', detail.actionLabel);
        else if (detail.combo > 0) showActionToast('my', `${detail.combo} REN`);
      } else if (type === 'garbage_queued') {
        sound.garbageIncoming();
      }
    } else if (type === 'line_clear' && detail.actionLabel) {
      showActionToast('opp', detail.actionLabel);
    }
  };
}

function runCountdown(callback) {
  state.countdownActive = true;
  state.roundActive = false;
  els.countdownOverlay.classList.remove('hidden');
  const steps = ['3', '2', '1', 'GO!'];
  let idx = 0;

  const stepFn = () => {
    if (!state.countdownActive) return;
    const text = steps[idx];
    els.countdownOverlay.textContent = text;
    sound.countdown(text === 'GO!');
    idx++;
    if (idx < steps.length) {
      setTimeout(stepFn, 800);
    } else {
      setTimeout(() => {
        if (!state.countdownActive) return;
        els.countdownOverlay.classList.add('hidden');
        state.countdownActive = false;
        state.roundActive = true;
        if (callback) callback();
      }, 450);
    }
  };
  stepFn();
}

function stopGameLoop() {
  state.roundActive = false;
  state.countdownActive = false;
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

function startGameLoop() {
  stopGameLoop();
  state.lastFrameTime = performance.now();

  const frame = (now) => {
    const dt = Math.min(100, now - state.lastFrameTime);
    state.lastFrameTime = now;

    if (state.roundActive && state.myEngine && !state.myEngine.gameOver) {
      handleContinuousInput(dt);
      state.myEngine.tick(dt);

      if (state.mode === 'cpu' && state.oppEngine && state.aiController && !state.oppEngine.gameOver) {
        state.oppEngine.tick(dt);
        state.aiController.tick(dt);
      }

      if (state.mode === 'online' && (state.dirtySync || now - state.lastSyncSentAt > 75)) {
        sendMySnapshot();
        state.lastSyncSentAt = now;
        state.dirtySync = false;
      }
    }

    renderAll();
    state.rafId = requestAnimationFrame(frame);
  };
  state.rafId = requestAnimationFrame(frame);
}

function sendMySnapshot() {
  if (!state.socket || !state.connected || !state.myEngine || state.mode !== 'online') return;
  const snap = state.myEngine.getSnapshot();
  state.socket.emit('board_update', {
    board: snap.board,
    active: snap.active,
    hold: snap.hold,
    next: snap.next,
    score: snap.score,
    lines: snap.lines,
    level: snap.level,
    pendingGarbage: snap.pendingGarbage,
    attackTotal: snap.attackTotal,
    combo: snap.combo,
    b2b: snap.b2b,
    lastAction: snap.lastAction,
  });
}

function renderAll() {
  if (state.myEngine) {
    const snap = state.myEngine.getSnapshot();
    renderBoard(els.myBoardCanvas, snap, { isDead: state.myEngine.gameOver });
    renderHoldCanvas(els.myHoldCanvas, snap.hold, state.myEngine.canHold);
    renderNextCanvas(els.myNextCanvas, snap.next);
    renderGarbageBar(els.myGarbageFill, snap.pendingGarbage);

    const stats = state.myEngine.getStats();
    els.myScore.textContent = stats.score.toLocaleString();
    els.myAttack.textContent = String(stats.attackTotal);
    els.myLinesLevel.textContent = `${stats.lines} / Lv.${stats.level}`;
    els.mySpeed.textContent = `${stats.pps.toFixed(1)} / ${Math.round(stats.apm)}`;
    els.b2bBadge.classList.toggle('hidden', !snap.b2b);
    els.comboBadge.classList.toggle('hidden', snap.combo <= 0);
    if (snap.combo > 0) {
      els.comboText.textContent = `${snap.combo} REN`;
    }
  }

  let oppSnap = state.oppSnapshot;
  let oppDead = false;
  if (state.mode === 'cpu' && state.oppEngine) {
    oppSnap = state.oppEngine.getSnapshot();
    oppDead = state.oppEngine.gameOver;
  }

  if (oppSnap) {
    renderBoard(els.oppBoardCanvas, oppSnap, { isDead: oppDead });
    renderHoldCanvas(els.oppHoldCanvas, oppSnap.hold, true);
    renderGarbageBar(els.oppGarbageFill, oppSnap.pendingGarbage);
    els.oppScore.textContent = (oppSnap.score || 0).toLocaleString();
    els.oppAttack.textContent = String(oppSnap.attackTotal || 0);
    els.oppLines.textContent = String(oppSnap.lines || 0);
  }
}

function handleContinuousInput(dt) {
  if (!state.myEngine || !state.roundActive || state.myEngine.gameOver) return;

  if (inputState.horizDir !== 0) {
    inputState.dasTimer += dt;
    if (inputState.dasTimer >= state.dasMs) {
      if (state.arrMs === 0) {
        while (state.myEngine.move(inputState.horizDir, 0)) {
          state.dirtySync = true;
        }
      } else {
        inputState.arrTimer += dt;
        while (inputState.arrTimer >= state.arrMs) {
          inputState.arrTimer -= state.arrMs;
          if (state.myEngine.move(inputState.horizDir, 0)) {
            state.dirtySync = true;
          } else {
            break;
          }
        }
      }
    }
  }

  if (inputState.down) {
    inputState.sdfTimer += dt;
    while (inputState.sdfTimer >= state.sdfMs) {
      inputState.sdfTimer -= state.sdfMs;
      if (state.myEngine.softDropStep()) {
        state.dirtySync = true;
      } else {
        break;
      }
    }
  }
}

function startOnlineRound(data) {
  state.mode = 'online';
  els.resultModal.classList.add('hidden');
  els.opponentStage.classList.remove('hidden');
  els.emoteBar.classList.remove('hidden');
  switchView('battle');

  const me = data.players.find((p) => p.id === state.myId);
  const opp = data.players.find((p) => p.id !== state.myId);
  const targetWins = data.settings?.targetWins || 1;

  els.battleModeLabel.textContent = state.room?.isQuickMatch ? 'QUICK 1v1' : 'FRIEND 1v1';
  els.roundLabel.textContent = `ROUND ${data.roundNumber}`;
  els.myBannerName.textContent = me ? me.name : getPlayerName();
  els.oppBannerName.textContent = opp ? opp.name : 'Opponent';
  els.oppNameLabel.textContent = opp ? opp.name : 'Opponent';
  renderWinPips(els.myWinPips, me ? me.wins : 0, targetWins);
  renderWinPips(els.oppWinPips, opp ? opp.wins : 0, targetWins);

  state.myEngine = new TetrisEngine({
    seed: data.seed,
    startLevel: data.settings?.startLevel || 1,
    garbageMultiplier: data.settings?.garbageMultiplier || 1,
    onAttack: (attack) => {
      if (state.socket && state.connected) {
        state.socket.emit('send_garbage', attack);
      }
    },
    onTopOut: (stats) => {
      state.roundActive = false;
      sendMySnapshot();
      if (state.socket && state.connected) {
        state.socket.emit('player_top_out', { stats });
      }
    },
  });
  bindEngineEvents(state.myEngine, true);

  // Initial empty preview for opponent
  const dummy = new TetrisEngine({ seed: data.seed, startLevel: data.settings?.startLevel || 1 });
  state.oppSnapshot = dummy.getSnapshot();

  startGameLoop();
  runCountdown();
}

function startCpuMatch() {
  const difficulty = els.cpuDifficultySelect.value;
  state.mode = 'cpu';
  els.resultModal.classList.add('hidden');
  els.opponentStage.classList.remove('hidden');
  els.emoteBar.classList.add('hidden');
  switchView('battle');

  const seed = Math.floor(Math.random() * 2147483647);
  const diffLabel = difficulty === 'easy' ? 'かんたん' : difficulty === 'hard' ? 'つよい' : 'ふつう';
  els.battleModeLabel.textContent = `VS CPU (${diffLabel})`;
  els.roundLabel.textContent = '1v1 練習戦';
  els.myBannerName.textContent = getPlayerName();
  els.oppBannerName.textContent = `CPU (${diffLabel})`;
  els.oppNameLabel.textContent = `CPU (${diffLabel})`;
  renderWinPips(els.myWinPips, state.myLocalWins, 1);
  renderWinPips(els.oppWinPips, state.cpuWins, 1);

  state.myEngine = new TetrisEngine({
    seed,
    onAttack: (attack) => {
      if (state.oppEngine && !state.oppEngine.gameOver) {
        state.oppEngine.queueGarbage(attack.lines);
      }
    },
    onTopOut: () => {
      finishLocalMatch(false);
    },
  });
  bindEngineEvents(state.myEngine, true);

  state.oppEngine = new TetrisEngine({
    seed,
    onAttack: (attack) => {
      if (state.myEngine && !state.myEngine.gameOver) {
        state.myEngine.queueGarbage(attack.lines);
        showActionToast('opp', `${attack.lines}段攻撃！`);
      }
    },
    onTopOut: () => {
      finishLocalMatch(true);
    },
  });
  bindEngineEvents(state.oppEngine, false);
  state.aiController = new AiController(state.oppEngine, difficulty);

  startGameLoop();
  runCountdown();
}

function startSoloPractice() {
  state.mode = 'solo';
  els.resultModal.classList.add('hidden');
  els.opponentStage.classList.add('hidden');
  els.emoteBar.classList.add('hidden');
  switchView('battle');

  els.battleModeLabel.textContent = 'SOLO MARATHON';
  els.roundLabel.textContent = 'エンドレス練習';
  els.myBannerName.textContent = getPlayerName();
  els.oppBannerName.textContent = 'SCORE ATTACK';
  els.myWinPips.innerHTML = '';
  els.oppWinPips.innerHTML = '';

  state.oppEngine = null;
  state.aiController = null;
  state.oppSnapshot = null;

  state.myEngine = new TetrisEngine({
    onTopOut: () => {
      finishLocalMatch(false, true);
    },
  });
  bindEngineEvents(state.myEngine, true);

  startGameLoop();
  runCountdown();
}

function finishLocalMatch(playerWon, isSolo = false) {
  state.roundActive = false;
  const stats = state.myEngine ? state.myEngine.getStats() : null;

  if (isSolo) {
    els.resultTitle.textContent = 'GAME OVER';
    els.resultTitle.style.color = 'var(--accent-cyan)';
    els.resultSubtitle.textContent = 'お疲れさまでした！';
  } else if (playerWon) {
    sound.win();
    els.resultTitle.textContent = 'YOU WIN! 🏆';
    els.resultTitle.style.color = 'var(--accent-green)';
    els.resultSubtitle.textContent = 'CPUに勝利しました！';
  } else {
    sound.lose();
    els.resultTitle.textContent = 'YOU LOSE...';
    els.resultTitle.style.color = 'var(--danger)';
    els.resultSubtitle.textContent = 'CPUが勝利しました。次はリベンジ！';
  }

  if (stats) {
    els.resultStats.innerHTML = `
      スコア: <strong>${stats.score.toLocaleString()}</strong><br/>
      消去ライン: <strong>${stats.lines}</strong> / 送信おじゃま: <strong>${stats.attackTotal}</strong><br/>
      スピード: <strong>${stats.pps} PPS</strong> / 火力: <strong>${stats.apm} APM</strong>
    `;
  }
  els.rematchBtn.textContent = 'もう一度プレイ';
  els.rematchBtn.disabled = false;
  els.resultModal.classList.remove('hidden');
}

function showOnlineResult(data) {
  state.roundActive = false;
  const iWon = data.winnerId === state.myId;
  if (iWon) sound.win();
  else sound.lose();

  const targetWins = state.room?.settings?.targetWins || 1;
  const me = data.players.find((p) => p.id === state.myId);
  const opp = data.players.find((p) => p.id !== state.myId);
  renderWinPips(els.myWinPips, me ? me.wins : 0, targetWins);
  renderWinPips(els.oppWinPips, opp ? opp.wins : 0, targetWins);

  els.resultTitle.textContent = iWon ? 'YOU WIN! 🏆' : 'YOU LOSE...';
  els.resultTitle.style.color = iWon ? 'var(--accent-green)' : 'var(--danger)';

  if (data.reason === 'disconnect' || data.reason === 'forfeit') {
    els.resultSubtitle.textContent = iWon ? '相手が退出/切断したため勝利しました！' : '対戦を終了しました。';
  } else {
    els.resultSubtitle.textContent = `${data.winnerName} の勝利！`;
  }

  const stats = state.myEngine ? state.myEngine.getStats() : null;
  if (stats) {
    els.resultStats.innerHTML = `
      スコア: <strong>${stats.score.toLocaleString()}</strong><br/>
      消去ライン: <strong>${stats.lines}</strong> / 送信おじゃま: <strong>${stats.attackTotal}</strong><br/>
      スピード: <strong>${stats.pps} PPS</strong> / 火力: <strong>${stats.apm} APM</strong>
    `;
  }

  const canRematch = state.room && state.room.players.length === 2;
  els.rematchBtn.disabled = !canRematch;
  els.rematchBtn.textContent = canRematch ? '再戦する (0/2)' : '相手がいません';
  els.resultModal.classList.remove('hidden');
}

function exitToLobby() {
  stopGameLoop();
  els.resultModal.classList.add('hidden');
  if (state.mode === 'online' && state.socket && state.connected) {
    state.socket.emit('room_leave');
  }
  state.mode = 'lobby';
  state.room = null;
  state.myEngine = null;
  state.oppEngine = null;
  state.aiController = null;
  setQueueUI(false);
  switchView('lobby');
}

function initSocket() {
  const coldTimer = setTimeout(() => {
    if (!state.connected) {
      els.coldStartBanner.classList.remove('hidden');
    }
  }, 2200);

  const socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  state.socket = socket;

  socket.on('connect', () => {
    clearTimeout(coldTimer);
    state.connected = true;
    state.myId = socket.id;
    els.connDot.className = 'dot online';
    els.connText.textContent = 'オンライン接続済';
    els.coldStartBanner.classList.add('hidden');

    // Auto-join from invite URL (?room=XXXX)
    const params = new URLSearchParams(window.location.search);
    const inviteRoom = params.get('room');
    if (inviteRoom && state.mode === 'lobby') {
      els.roomCodeInput.value = inviteRoom.toUpperCase();
      socket.emit('room_join', { roomId: inviteRoom, name: getPlayerName() });
      window.history.replaceState({}, '', window.location.pathname);
    }
  });

  socket.on('disconnect', () => {
    state.connected = false;
    els.connDot.className = 'dot offline';
    els.connText.textContent = '再接続中...';
    els.pingBadge.textContent = 'Ping: -- ms';
  });

  socket.on('connect_error', () => {
    els.connDot.className = 'dot';
    els.connText.textContent = 'サーバー起動待機中...';
    els.coldStartBanner.classList.remove('hidden');
  });

  socket.on('lobby_stats', (stats) => {
    els.statOnline.textContent = String(stats.onlineCount ?? 0);
    els.statQueue.textContent = String(stats.queueCount ?? 0);
    els.statBattles.textContent = String(stats.activeBattles ?? 0);
  });

  socket.on('quick_match_waiting', () => {
    setQueueUI(true);
  });

  socket.on('quick_match_cancelled', () => {
    setQueueUI(false);
  });

  socket.on('match_found', (room) => {
    setQueueUI(false);
    state.room = room;
    showNotice('対戦相手が見つかりました！');
  });

  socket.on('room_joined', (room) => {
    state.mode = 'online';
    updateRoomUI(room);
    switchView('room');
  });

  socket.on('room_state', (room) => {
    state.room = room;
    if (room.state === 'waiting') {
      updateRoomUI(room);
      if (state.mode !== 'online' || !els.battleView.classList.contains('hidden')) {
        // Stay in battle if finishing, otherwise room view
        if (els.resultModal.classList.contains('hidden')) {
          switchView('room');
        }
      }
    } else if (room.state === 'finished' && !els.resultModal.classList.contains('hidden')) {
      const votes = room.players.filter((p) => p.rematch).length;
      const me = room.players.find((p) => p.id === state.myId);
      if (room.players.length < 2) {
        els.rematchBtn.disabled = true;
        els.rematchBtn.textContent = '相手が退出しました';
      } else {
        els.rematchBtn.disabled = false;
        els.rematchBtn.textContent = me?.rematch ? `再戦キャンセル (${votes}/2)` : `再戦する (${votes}/2)`;
      }
    }
  });

  socket.on('room_error', (err) => {
    showNotice(err?.message || 'ルームエラーが発生しました');
  });

  socket.on('round_start', (data) => {
    startOnlineRound(data);
  });

  socket.on('opponent_update', (snap) => {
    state.oppSnapshot = snap;
    if (snap.lastAction) {
      // Optional subtle display handled on receive_garbage
    }
  });

  socket.on('receive_garbage', (data) => {
    if (!state.myEngine || !state.roundActive || state.myEngine.gameOver) return;
    state.myEngine.queueGarbage(data.lines);
    showActionToast('opp', `${data.attackType || 'ATTACK'} +${data.lines}`);
  });

  socket.on('round_over', (data) => {
    state.roundActive = false;
    const iWonRound = data.roundWinnerId === state.myId;
    if (iWonRound) sound.win();
    else sound.lose();
    showNotice(iWonRound ? 'ラウンド先取！次のラウンドへ...' : 'ラウンドを落としました！次のラウンドへ...', 2800);

    const targetWins = state.room?.settings?.targetWins || 2;
    const me = data.players.find((p) => p.id === state.myId);
    const opp = data.players.find((p) => p.id !== state.myId);
    renderWinPips(els.myWinPips, me ? me.wins : 0, targetWins);
    renderWinPips(els.oppWinPips, opp ? opp.wins : 0, targetWins);
  });

  socket.on('match_over', (data) => {
    showOnlineResult(data);
  });

  socket.on('opponent_left', (info) => {
    showNotice(`${info?.leftName || '相手'} が退出しました`);
  });

  socket.on('emote_received', (data) => {
    const side = data.from === state.myId ? 'my' : 'opp';
    showEmoteBubble(side, data.text);
  });

  // Ping loop
  setInterval(() => {
    if (!state.connected) return;
    const sent = performance.now();
    socket.emit('ping_check', sent, () => {
      const rtt = Math.round(performance.now() - sent);
      els.pingBadge.textContent = `Ping: ${rtt} ms`;
    });
  }, 5000);
}

function setupControls() {
  window.addEventListener('keydown', (e) => {
    if (state.mode !== 'online' && state.mode !== 'cpu' && state.mode !== 'solo') return;
    if (els.battleView.classList.contains('hidden')) return;
    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    const code = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(code)) {
      e.preventDefault();
    }

    if (!state.roundActive || !state.myEngine || state.myEngine.gameOver) return;
    if (e.repeat && code !== 'ArrowDown') return;

    if (code === 'ArrowLeft') {
      inputState.left = true;
      inputState.horizDir = -1;
      inputState.dasTimer = 0;
      inputState.arrTimer = 0;
      state.myEngine.move(-1, 0);
      state.dirtySync = true;
    } else if (code === 'ArrowRight') {
      inputState.right = true;
      inputState.horizDir = 1;
      inputState.dasTimer = 0;
      inputState.arrTimer = 0;
      state.myEngine.move(1, 0);
      state.dirtySync = true;
    } else if (code === 'ArrowDown') {
      inputState.down = true;
      inputState.sdfTimer = 0;
      state.myEngine.softDropStep();
      state.dirtySync = true;
    } else if (code === 'ArrowUp' || code === 'KeyX') {
      state.myEngine.rotate(1);
      state.dirtySync = true;
    } else if (code === 'KeyZ') {
      state.myEngine.rotate(-1);
      state.dirtySync = true;
    } else if (code === 'KeyC' || code === 'ShiftLeft' || code === 'ShiftRight') {
      state.myEngine.holdPiece();
      state.dirtySync = true;
    } else if (code === 'Space') {
      state.myEngine.hardDrop();
      state.dirtySync = true;
      if (state.mode === 'online') sendMySnapshot();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') {
      inputState.left = false;
      inputState.horizDir = inputState.right ? 1 : 0;
      inputState.dasTimer = 0;
    } else if (e.code === 'ArrowRight') {
      inputState.right = false;
      inputState.horizDir = inputState.left ? -1 : 0;
      inputState.dasTimer = 0;
    } else if (e.code === 'ArrowDown') {
      inputState.down = false;
    }
  });

  // Touch buttons for mobile play
  document.querySelectorAll('.touch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.roundActive || !state.myEngine || state.myEngine.gameOver) return;
      const act = btn.dataset.act;
      if (act === 'left') state.myEngine.move(-1, 0);
      else if (act === 'right') state.myEngine.move(1, 0);
      else if (act === 'down') state.myEngine.softDropStep();
      else if (act === 'rotR') state.myEngine.rotate(1);
      else if (act === 'rotL') state.myEngine.rotate(-1);
      else if (act === 'hold') state.myEngine.holdPiece();
      else if (act === 'drop') state.myEngine.hardDrop();
      state.dirtySync = true;
    });
  });
}

function setupUIHandlers() {
  const savedName = localStorage.getItem('tetris_name');
  if (savedName) els.playerNameInput.value = savedName;

  els.muteBtn.addEventListener('click', () => {
    sound.muted = !sound.muted;
    els.muteBtn.textContent = sound.muted ? '🔇 MUTE' : '🔊 SFX ON';
  });

  els.dasRange.value = String(state.dasMs);
  els.arrRange.value = String(state.arrMs);
  els.sdfRange.value = String(state.sdfMs);
  els.dasValue.textContent = String(state.dasMs);
  els.arrValue.textContent = String(state.arrMs);
  els.sdfValue.textContent = String(state.sdfMs);

  els.settingsBtn.addEventListener('click', () => els.settingsModal.classList.remove('hidden'));
  els.closeSettingsBtn.addEventListener('click', () => els.settingsModal.classList.add('hidden'));

  els.dasRange.addEventListener('input', () => {
    state.dasMs = Number(els.dasRange.value);
    els.dasValue.textContent = String(state.dasMs);
    localStorage.setItem('tetris_das', String(state.dasMs));
  });
  els.arrRange.addEventListener('input', () => {
    state.arrMs = Number(els.arrRange.value);
    els.arrValue.textContent = String(state.arrMs);
    localStorage.setItem('tetris_arr', String(state.arrMs));
  });
  els.sdfRange.addEventListener('input', () => {
    state.sdfMs = Number(els.sdfRange.value);
    els.sdfValue.textContent = String(state.sdfMs);
    localStorage.setItem('tetris_sdf', String(state.sdfMs));
  });

  els.quickMatchBtn.addEventListener('click', () => {
    if (!state.connected) {
      showNotice('サーバーに接続中です。起動完了まで少しお待ちください。');
      return;
    }
    state.socket.emit('quick_match_join', { name: getPlayerName() });
  });

  els.cancelQueueBtn.addEventListener('click', () => {
    if (state.socket) state.socket.emit('quick_match_leave');
    setQueueUI(false);
  });

  els.createRoomBtn.addEventListener('click', () => {
    if (!state.connected) {
      showNotice('サーバー接続中です。少しお待ちください。');
      return;
    }
    state.socket.emit('room_create', { name: getPlayerName() });
  });

  els.joinRoomBtn.addEventListener('click', () => {
    if (!state.connected) {
      showNotice('サーバー接続中です。少しお待ちください。');
      return;
    }
    state.socket.emit('room_join', {
      roomId: els.roomCodeInput.value.trim().toUpperCase(),
      name: getPlayerName(),
    });
  });

  els.copyRoomUrlBtn.addEventListener('click', async () => {
    if (!state.room) return;
    const url = `${window.location.origin}/?room=${state.room.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotice(`招待リンクをコピーしました！ (${state.room.id})`);
    } catch {
      showNotice(`ルームID: ${state.room.id}`);
    }
  });

  els.leaveRoomBtn.addEventListener('click', exitToLobby);
  els.exitBattleBtn.addEventListener('click', exitToLobby);
  els.resultLobbyBtn.addEventListener('click', exitToLobby);

  const pushRoomSettings = () => {
    if (!state.socket || !state.room) return;
    state.socket.emit('room_settings', {
      targetWins: Number(els.settingTargetWins.value),
      startLevel: Number(els.settingStartLevel.value),
      garbageMultiplier: Number(els.settingGarbageMult.value),
    });
  };
  els.settingTargetWins.addEventListener('change', pushRoomSettings);
  els.settingStartLevel.addEventListener('change', pushRoomSettings);
  els.settingGarbageMult.addEventListener('change', pushRoomSettings);

  els.readyBtn.addEventListener('click', () => {
    if (state.socket) state.socket.emit('room_ready', {});
  });

  els.rematchBtn.addEventListener('click', () => {
    if (state.mode === 'cpu') startCpuMatch();
    else if (state.mode === 'solo') startSoloPractice();
    else if (state.mode === 'online' && state.socket) {
      state.socket.emit('rematch_vote');
    }
  });

  document.querySelectorAll('.emote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.mode === 'online' && state.socket && state.connected) {
        state.socket.emit('send_emote', { text: btn.dataset.emote });
      }
    });
  });

  els.startCpuBtn.addEventListener('click', startCpuMatch);
  els.startSoloBtn.addEventListener('click', startSoloPractice);
}

setupUIHandlers();
setupControls();
initSocket();
