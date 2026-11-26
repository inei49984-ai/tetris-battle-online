const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ALLOWED_EMOTES = new Set(['よろしく！', 'ナイス！', '熱い！', 'やばい！', 'GG！']);

function generateRoomCode(existingRooms) {
  for (let attempt = 0; attempt < 30; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CHARS[crypto.randomInt(0, ROOM_CHARS.length)];
    }
    if (!existingRooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function generateSeed() {
  return crypto.randomInt(1, 2147483647);
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Player';
  const cleaned = name.replace(/[\r\n\t<>]/g, '').trim().slice(0, 16);
  return cleaned || 'Player';
}

function sanitizeSettings(raw = {}) {
  const startLevel = Math.min(15, Math.max(1, Number(raw.startLevel) || 1));
  const targetWins = [1, 2, 3].includes(Number(raw.targetWins)) ? Number(raw.targetWins) : 2;
  const garbageMultiplier = [0.5, 1, 1.5, 2].includes(Number(raw.garbageMultiplier))
    ? Number(raw.garbageMultiplier)
    : 1;
  return { startLevel, targetWins, garbageMultiplier };
}

function createRoomManager(io) {
  const rooms = new Map();
  const quickQueue = [];
  const socketMeta = new Map(); // socketId -> { name, roomId }

  function getLobbyStats() {
    let activeBattles = 0;
    for (const room of rooms.values()) {
      if (room.state === 'playing' || room.state === 'countdown') {
        activeBattles++;
      }
    }
    return {
      onlineCount: io.engine ? io.engine.clientsCount : socketMeta.size,
      queueCount: quickQueue.length,
      activeBattles,
      roomCount: rooms.size,
    };
  }

  function broadcastLobbyStats() {
    io.emit('lobby_stats', getLobbyStats());
  }

  function serializeRoom(room) {
    return {
      id: room.id,
      isQuickMatch: room.isQuickMatch,
      hostId: room.hostId,
      state: room.state,
      roundNumber: room.roundNumber,
      settings: room.settings,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        wins: p.wins,
        rematch: p.rematch,
      })),
    };
  }

  function emitRoomState(room) {
    io.to(room.id).emit('room_state', serializeRoom(room));
  }

  function clearRoomTimers(room) {
    if (room.nextRoundTimer) {
      clearTimeout(room.nextRoundTimer);
      room.nextRoundTimer = null;
    }
    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
    }
  }

  function startRound(room) {
    if (room.players.length < 2) return;
    clearRoomTimers(room);
    room.roundNumber += 1;
    room.state = 'countdown';
    room.roundResolved = false;
    for (const p of room.players) {
      p.ready = false;
      p.rematch = false;
    }
    const seed = generateSeed();
    room.currentSeed = seed;

    io.to(room.id).emit('round_start', {
      roomId: room.id,
      roundNumber: room.roundNumber,
      seed,
      settings: room.settings,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        wins: p.wins,
      })),
    });

    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      if (rooms.has(room.id) && room.state === 'countdown') {
        room.state = 'playing';
        emitRoomState(room);
      }
    }, 3200);

    emitRoomState(room);
    broadcastLobbyStats();
  }

  function removeFromQueue(socketId) {
    const idx = quickQueue.findIndex((entry) => entry.id === socketId);
    if (idx !== -1) {
      quickQueue.splice(idx, 1);
      return true;
    }
    return false;
  }

  function leaveCurrentRoom(socket, reason = 'leave') {
    const meta = socketMeta.get(socket.id);
    if (!meta || !meta.roomId) return;

    const room = rooms.get(meta.roomId);
    meta.roomId = null;
    socket.leave(room ? room.id : '');

    if (!room) return;

    const leavingPlayer = room.players.find((p) => p.id === socket.id);
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      clearRoomTimers(room);
      rooms.delete(room.id);
      broadcastLobbyStats();
      return;
    }

    const remaining = room.players[0];
    if (room.hostId === socket.id) {
      room.hostId = remaining.id;
    }

    if (room.state === 'playing' || room.state === 'countdown') {
      clearRoomTimers(room);
      room.state = 'finished';
      remaining.wins = room.settings.targetWins;
      io.to(room.id).emit('match_over', {
        winnerId: remaining.id,
        winnerName: remaining.name,
        reason: reason === 'disconnect' ? 'disconnect' : 'forfeit',
        loserName: leavingPlayer ? leavingPlayer.name : 'Opponent',
        players: room.players.map((p) => ({
          id: p.id,
          name: p.name,
          wins: p.wins,
          rematch: false,
        })),
      });
    }

    // Reset back to waiting room if opponent stays (for custom rooms)
    if (!room.isQuickMatch && room.state !== 'finished') {
      room.state = 'waiting';
      remaining.ready = false;
      remaining.wins = 0;
      remaining.rematch = false;
    }

    io.to(room.id).emit('opponent_left', {
      leftName: leavingPlayer ? leavingPlayer.name : '相手',
      reason,
    });
    emitRoomState(room);
    broadcastLobbyStats();
  }

  function handleConnection(socket) {
    socketMeta.set(socket.id, { name: 'Player', roomId: null });
    socket.emit('lobby_stats', getLobbyStats());
    broadcastLobbyStats();

    socket.on('quick_match_join', (payload = {}) => {
      const name = sanitizeName(payload.name);
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      meta.name = name;

      if (meta.roomId) {
        leaveCurrentRoom(socket, 'leave');
      }
      removeFromQueue(socket.id);

      // Clean disconnected entries from queue
      while (quickQueue.length > 0 && !io.sockets.sockets.get(quickQueue[0].id)) {
        quickQueue.shift();
      }

      if (quickQueue.length > 0) {
        const opponentEntry = quickQueue.shift();
        const opponentSocket = io.sockets.sockets.get(opponentEntry.id);
        if (!opponentSocket) {
          quickQueue.push({ id: socket.id, name });
          socket.emit('quick_match_waiting', { position: quickQueue.length });
          broadcastLobbyStats();
          return;
        }

        const roomId = `QM-${generateRoomCode(rooms)}`;
        const room = {
          id: roomId,
          isQuickMatch: true,
          hostId: opponentEntry.id,
          state: 'waiting',
          roundNumber: 0,
          roundResolved: false,
          settings: { startLevel: 1, targetWins: 1, garbageMultiplier: 1 },
          players: [
            { id: opponentEntry.id, name: opponentEntry.name, ready: true, wins: 0, rematch: false },
            { id: socket.id, name, ready: true, wins: 0, rematch: false },
          ],
          createdAt: Date.now(),
          nextRoundTimer: null,
          countdownTimer: null,
        };
        rooms.set(roomId, room);

        const oppMeta = socketMeta.get(opponentEntry.id);
        if (oppMeta) oppMeta.roomId = roomId;
        meta.roomId = roomId;

        opponentSocket.join(roomId);
        socket.join(roomId);

        io.to(roomId).emit('match_found', serializeRoom(room));
        startRound(room);
      } else {
        quickQueue.push({ id: socket.id, name });
        socket.emit('quick_match_waiting', { position: quickQueue.length });
        broadcastLobbyStats();
      }
    });

    socket.on('quick_match_leave', () => {
      if (removeFromQueue(socket.id)) {
        socket.emit('quick_match_cancelled');
        broadcastLobbyStats();
      }
    });

    socket.on('room_create', (payload = {}) => {
      const name = sanitizeName(payload.name);
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      meta.name = name;

      removeFromQueue(socket.id);
      if (meta.roomId) leaveCurrentRoom(socket, 'leave');

      const roomId = generateRoomCode(rooms);
      const room = {
        id: roomId,
        isQuickMatch: false,
        hostId: socket.id,
        state: 'waiting',
        roundNumber: 0,
        roundResolved: false,
        settings: sanitizeSettings(payload.settings),
        players: [{ id: socket.id, name, ready: false, wins: 0, rematch: false }],
        createdAt: Date.now(),
        nextRoundTimer: null,
        countdownTimer: null,
      };
      rooms.set(roomId, room);
      meta.roomId = roomId;
      socket.join(roomId);

      socket.emit('room_joined', serializeRoom(room));
      emitRoomState(room);
      broadcastLobbyStats();
    });

    socket.on('room_join', (payload = {}) => {
      const name = sanitizeName(payload.name);
      const rawCode = typeof payload.roomId === 'string' ? payload.roomId.trim().toUpperCase() : '';
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      meta.name = name;

      if (!rawCode) {
        socket.emit('room_error', { message: 'ルームIDを入力してください。' });
        return;
      }

      const room = rooms.get(rawCode);
      if (!room) {
        socket.emit('room_error', { message: `ルーム「${rawCode}」が見つかりません。` });
        return;
      }
      if (room.players.some((p) => p.id === socket.id)) {
        socket.emit('room_joined', serializeRoom(room));
        return;
      }
      if (room.players.length >= 2) {
        socket.emit('room_error', { message: `ルーム「${rawCode}」は満員です。` });
        return;
      }

      removeFromQueue(socket.id);
      if (meta.roomId) leaveCurrentRoom(socket, 'leave');

      room.state = 'waiting';
      room.roundNumber = 0;
      room.players.forEach((p) => {
        p.ready = false;
        p.wins = 0;
        p.rematch = false;
      });
      room.players.push({ id: socket.id, name, ready: false, wins: 0, rematch: false });
      meta.roomId = rawCode;
      socket.join(rawCode);

      socket.emit('room_joined', serializeRoom(room));
      emitRoomState(room);
      broadcastLobbyStats();
    });

    socket.on('room_leave', () => {
      leaveCurrentRoom(socket, 'leave');
    });

    socket.on('room_settings', (payload = {}) => {
      const meta = socketMeta.get(socket.id);
      if (!meta || !meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room || room.hostId !== socket.id || room.state !== 'waiting') return;

      room.settings = sanitizeSettings(payload);
      emitRoomState(room);
    });

    socket.on('room_ready', (payload = {}) => {
      const meta = socketMeta.get(socket.id);
      if (!meta || !meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room || room.state !== 'waiting') return;

      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      player.ready = typeof payload.ready === 'boolean' ? payload.ready : !player.ready;
      emitRoomState(room);

      if (room.players.length === 2 && room.players.every((p) => p.ready)) {
        room.players.forEach((p) => {
          p.wins = 0;
        });
        room.roundNumber = 0;
        startRound(room);
      }
    });

    socket.on('board_update', (payload = {}) => {
      const meta = socketMeta.get(socket.id);
      if (!meta || !meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room || (room.state !== 'playing' && room.state !== 'countdown')) return;

      socket.to(room.id).emit('opponent_update', {
        from: socket.id,
        board: Array.isArray(payload.board) ? payload.board.slice(0, 22) : null,
        active: payload.active || null,
        hold: payload.hold || null,
        next: Array.isArray(payload.next) ? payload.next.slice(0, 5) : [],
        score: Number(payload.score) || 0,
        lines: Number(payload.lines) || 0,
        level: Number(payload.level) || 1,
        pendingGarbage: Math.max(0, Math.min(30, Number(payload.pendingGarbage) || 0)),
        attackTotal: Number(payload.attackTotal) || 0,
        combo: Number(payload.combo) || 0,
        b2b: Boolean(payload.b2b),
        lastAction: typeof payload.lastAction === 'string' ? payload.lastAction.slice(0, 32) : '',
      });
    });

    socket.on('send_garbage', (payload = {}) => {
      const meta = socketMeta.get(socket.id);
      if (!meta || !meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room || room.state !== 'playing') return;

      const lines = Math.floor(Number(payload.lines) || 0);
      if (lines <= 0 || lines > 24) return;

      socket.to(room.id).emit('receive_garbage', {
        from: socket.id,
        lines,
        attackType: typeof payload.attackType === 'string' ? payload.attackType.slice(0, 32) : '',
        combo: Number(payload.combo) || 0,
        b2b: Boolean(payload.b2b),
      });
    });

    socket.on('player_top_out', (payload = {}) => {
      const meta = socketMeta.get(socket.id);
      if (!meta || !meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room || (room.state !== 'playing' && room.state !== 'countdown')) return;
      if (room.roundResolved) return;

      const winner = room.players.find((p) => p.id !== socket.id);
      const loser = room.players.find((p) => p.id === socket.id);
      if (!winner || !loser) return;

      room.roundResolved = true;
      clearRoomTimers(room);
      winner.wins += 1;

      if (winner.wins >= room.settings.targetWins) {
        room.state = 'finished';
        io.to(room.id).emit('match_over', {
          winnerId: winner.id,
          winnerName: winner.name,
          reason: 'top_out',
          stats: payload.stats || null,
          players: room.players.map((p) => ({
            id: p.id,
            name: p.name,
            wins: p.wins,
            rematch: p.rematch,
          })),
        });
        emitRoomState(room);
        broadcastLobbyStats();
      } else {
        room.state = 'between_rounds';
        io.to(room.id).emit('round_over', {
          roundNumber: room.roundNumber,
          roundWinnerId: winner.id,
          roundWinnerName: winner.name,
          nextRoundInMs: 3000,
          players: room.players.map((p) => ({
            id: p.id,
            name: p.name,
            wins: p.wins,
          })),
        });
        emitRoomState(room);

        room.nextRoundTimer = setTimeout(() => {
          room.nextRoundTimer = null;
          if (rooms.has(room.id) && room.players.length === 2) {
            startRound(room);
          }
        }, 3000);
      }
    });

    socket.on('rematch_vote', () => {
      const meta = socketMeta.get(socket.id);
      if (!meta || !meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room || room.state !== 'finished' || room.players.length < 2) return;

      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      player.rematch = !player.rematch;
      emitRoomState(room);

      if (room.players.every((p) => p.rematch)) {
        room.players.forEach((p) => {
          p.wins = 0;
          p.rematch = false;
        });
        room.roundNumber = 0;
        startRound(room);
      }
    });

    socket.on('send_emote', (payload = {}) => {
      const meta = socketMeta.get(socket.id);
      if (!meta || !meta.roomId) return;
      const text = typeof payload.text === 'string' ? payload.text : '';
      if (!ALLOWED_EMOTES.has(text)) return;

      io.to(meta.roomId).emit('emote_received', {
        from: socket.id,
        name: meta.name,
        text,
      });
    });

    socket.on('ping_check', (ts, cb) => {
      if (typeof cb === 'function') cb(ts);
    });

    socket.on('disconnect', () => {
      removeFromQueue(socket.id);
      leaveCurrentRoom(socket, 'disconnect');
      socketMeta.delete(socket.id);
      broadcastLobbyStats();
    });
  }

  // Periodic cleanup of abandoned empty rooms
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.length === 0 || (room.state === 'waiting' && now - room.createdAt > 1000 * 60 * 60)) {
        clearRoomTimers(room);
        rooms.delete(roomId);
      }
    }
  }, 60 * 1000);
  cleanupInterval.unref();

  return {
    rooms,
    quickQueue,
    getLobbyStats,
    handleConnection,
  };
}

function createApp() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    pingInterval: 15000,
    pingTimeout: 20000,
  });

  const manager = createRoomManager(io);
  io.on('connection', manager.handleConnection);

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, ...manager.getLobbyStats(), uptime: Math.floor(process.uptime()) });
  });

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return { app, server, io, manager };
}

if (require.main === module) {
  const { server } = createApp();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tetris Battle Online server listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = { createApp, sanitizeName, sanitizeSettings };
