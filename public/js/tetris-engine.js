export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const BUFFER_ROWS = 2;
export const TOTAL_ROWS = VISIBLE_ROWS + BUFFER_ROWS; // 22 rows; rows 0..1 are hidden buffer

export const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const PIECE_COLORS = {
  I: '#00e5ff',
  O: '#ffd500',
  T: '#c04dff',
  S: '#39e75f',
  Z: '#ff3b5c',
  J: '#3b7dff',
  L: '#ff922b',
  G: '#6c7589', // Garbage block
};

// Base rotation matrices (4x4 for I/O, 3x3 for others) in SRS spawn orientation
const BASE_MATRICES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

function rotateMatrixCW(matrix) {
  const n = matrix.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out[c][n - 1 - r] = matrix[r][c];
    }
  }
  return out;
}

export const PIECE_SHAPES = {};
for (const type of PIECE_TYPES) {
  const states = [BASE_MATRICES[type]];
  for (let i = 1; i < 4; i++) {
    states.push(type === 'O' ? BASE_MATRICES.O : rotateMatrixCW(states[i - 1]));
  }
  PIECE_SHAPES[type] = states;
}

// SRS Wall Kick data (dx, dy where +dy is downward in grid coordinates)
const JLSTZ_KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

const COMBO_TABLE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5];

export function createSeededRng(seed) {
  let a = (seed >>> 0) || 123456789;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEmptyBoard() {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
}

export function getGravityMs(level) {
  const clamped = Math.max(1, Math.min(20, level));
  return Math.max(45, Math.round(Math.pow(0.82 - (clamped - 1) * 0.007, clamped - 1) * 900));
}

export class TetrisEngine {
  constructor(options = {}) {
    this.seed = options.seed ?? Math.floor(Math.random() * 2147483647);
    this.startLevel = Math.max(1, Math.min(15, options.startLevel || 1));
    this.garbageMultiplier = options.garbageMultiplier || 1;
    this.onAttack = options.onAttack || null;
    this.onEvent = options.onEvent || null;
    this.onTopOut = options.onTopOut || null;

    this.rng = createSeededRng(this.seed);
    this.garbageRng = createSeededRng((this.seed ^ 0x9e3779b9) >>> 0);
    this.reset(this.seed);
  }

  reset(newSeed = this.seed) {
    this.seed = newSeed;
    this.rng = createSeededRng(this.seed);
    this.garbageRng = createSeededRng((this.seed ^ 0x9e3779b9) >>> 0);

    this.board = createEmptyBoard();
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.canHold = true;
    this.active = null;

    this.score = 0;
    this.lines = 0;
    this.level = this.startLevel;
    this.combo = -1;
    this.b2b = false;
    this.piecesPlaced = 0;
    this.attackTotal = 0;
    this.pendingGarbage = 0;
    this.elapsedMs = 0;

    this.gravityAccMs = 0;
    this.lockTimerMs = 0;
    this.lockResets = 0;
    this.isGrounded = false;
    this.lastMoveWasRotation = false;
    this.lastKickIndex = 0;
    this.gameOver = false;
    this.lastActionText = '';

    this.fillQueue();
    this.spawnNext();
  }

  fillQueue() {
    while (this.queue.length < 7) {
      if (this.bag.length === 0) {
        this.bag = [...PIECE_TYPES];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.shift());
    }
  }

  spawnPiece(type) {
    const matrix = PIECE_SHAPES[type][0];
    const x = type === 'O' ? 3 : type === 'I' ? 3 : 3;
    const y = type === 'I' ? 0 : 0;
    const piece = { type, rot: 0, x, y };
    if (!this.isValidPosition(piece, matrix)) {
      this.active = piece;
      this.triggerTopOut();
      return false;
    }
    this.active = piece;
    this.gravityAccMs = 0;
    this.lockTimerMs = 0;
    this.lockResets = 0;
    this.lastMoveWasRotation = false;
    this.lastKickIndex = 0;
    this.updateGroundedState();
    return true;
  }

  spawnNext() {
    this.fillQueue();
    const nextType = this.queue.shift();
    this.fillQueue();
    this.canHold = true;
    return this.spawnPiece(nextType);
  }

  triggerTopOut() {
    if (this.gameOver) return;
    this.gameOver = true;
    if (this.onEvent) this.onEvent('top_out', {});
    if (this.onTopOut) this.onTopOut(this.getStats());
  }

  getShape(piece = this.active) {
    return PIECE_SHAPES[piece.type][piece.rot];
  }

  isValidPosition(piece, matrix = this.getShape(piece), board = this.board) {
    const n = matrix.length;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix[r][c]) continue;
        const bx = piece.x + c;
        const by = piece.y + r;
        if (bx < 0 || bx >= COLS || by >= TOTAL_ROWS) return false;
        if (by >= 0 && board[by][bx] !== null) return false;
      }
    }
    return true;
  }

  updateGroundedState() {
    if (!this.active) {
      this.isGrounded = false;
      return;
    }
    const test = { ...this.active, y: this.active.y + 1 };
    this.isGrounded = !this.isValidPosition(test);
  }

  resetLockDelayIfNeeded() {
    if (this.isGrounded && this.lockResets < 15) {
      this.lockTimerMs = 0;
      this.lockResets += 1;
    }
  }

  move(dx, dy) {
    if (this.gameOver || !this.active) return false;
    const candidate = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (!this.isValidPosition(candidate)) return false;

    this.active = candidate;
    this.lastMoveWasRotation = false;
    if (dy > 0) {
      this.gravityAccMs = 0;
    }
    this.updateGroundedState();
    if (dx !== 0) {
      this.resetLockDelayIfNeeded();
      if (this.onEvent) this.onEvent('move', { dx });
    }
    return true;
  }

  rotate(dir = 1) {
    if (this.gameOver || !this.active) return false;
    const fromRot = this.active.rot;
    const toRot = (fromRot + dir + 4) % 4;
    if (this.active.type === 'O') {
      this.active.rot = toRot;
      return true;
    }

    const matrix = PIECE_SHAPES[this.active.type][toRot];
    const kickTable = this.active.type === 'I' ? I_KICKS : JLSTZ_KICKS;
    const kicks = kickTable[`${fromRot}>${toRot}`] || [[0, 0]];

    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      const candidate = {
        ...this.active,
        rot: toRot,
        x: this.active.x + kx,
        y: this.active.y + ky,
      };
      if (this.isValidPosition(candidate, matrix)) {
        this.active = candidate;
        this.lastMoveWasRotation = true;
        this.lastKickIndex = i;
        this.updateGroundedState();
        this.resetLockDelayIfNeeded();
        if (this.onEvent) this.onEvent('rotate', { dir });
        return true;
      }
    }
    return false;
  }

  holdPiece() {
    if (this.gameOver || !this.active || !this.canHold) return false;
    const currentType = this.active.type;
    this.canHold = false;
    if (this.hold === null) {
      this.hold = currentType;
      this.spawnNext();
      this.canHold = false;
    } else {
      const swapType = this.hold;
      this.hold = currentType;
      this.spawnPiece(swapType);
    }
    if (this.onEvent) this.onEvent('hold', { piece: this.hold });
    return true;
  }

  getGhostY() {
    if (!this.active) return 0;
    let gy = this.active.y;
    const matrix = this.getShape();
    while (this.isValidPosition({ ...this.active, y: gy + 1 }, matrix)) {
      gy++;
    }
    return gy;
  }

  softDropStep() {
    if (this.move(0, 1)) {
      this.score += 1;
      return true;
    }
    return false;
  }

  hardDrop() {
    if (this.gameOver || !this.active) return null;
    const ghostY = this.getGhostY();
    const droppedRows = Math.max(0, ghostY - this.active.y);
    this.active.y = ghostY;
    this.score += droppedRows * 2;
    if (droppedRows > 0) {
      this.lastMoveWasRotation = false;
    }
    if (this.onEvent) this.onEvent('hard_drop', { droppedRows });
    return this.lockCurrentPiece();
  }

  detectTSpin() {
    if (!this.active || this.active.type !== 'T' || !this.lastMoveWasRotation) {
      return 'none';
    }
    const cx = this.active.x + 1;
    const cy = this.active.y + 1;
    const corners = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx - 1, cy + 1],
      [cx + 1, cy + 1],
    ];
    let occupied = 0;
    const cornerOccupied = corners.map(([x, y]) => {
      if (x < 0 || x >= COLS || y >= TOTAL_ROWS) return true;
      if (y < 0) return false;
      return this.board[y][x] !== null;
    });
    for (const flag of cornerOccupied) {
      if (flag) occupied++;
    }
    if (occupied < 3) return 'none';

    // Front two corners depend on rotation state
    const frontIndices = {
      0: [0, 1],
      1: [1, 3],
      2: [2, 3],
      3: [0, 2],
    }[this.active.rot];
    const frontCount = (cornerOccupied[frontIndices[0]] ? 1 : 0) + (cornerOccupied[frontIndices[1]] ? 1 : 0);
    if (frontCount === 2 || this.lastKickIndex === 4) {
      return 'full';
    }
    return 'mini';
  }

  queueGarbage(lines) {
    const count = Math.max(0, Math.floor(lines));
    if (count <= 0) return;
    this.pendingGarbage = Math.min(24, this.pendingGarbage + count);
    if (this.onEvent) this.onEvent('garbage_queued', { lines: count, total: this.pendingGarbage });
  }

  applyPendingGarbage(maxLines = 8) {
    if (this.pendingGarbage <= 0) return 0;
    const count = Math.min(this.pendingGarbage, maxLines);
    this.pendingGarbage -= count;

    const holeCol = Math.floor(this.garbageRng() * COLS);
    // Check if top rows have blocks that would overflow
    for (let r = 0; r < count; r++) {
      if (this.board[r].some((cell) => cell !== null)) {
        // Push up anyway and top out on spawn or immediately
      }
      this.board.shift();
      const row = Array(COLS).fill('G');
      row[holeCol] = null;
      this.board.push(row);
    }
    if (this.onEvent) this.onEvent('garbage_applied', { lines: count });
    return count;
  }

  lockCurrentPiece() {
    if (this.gameOver || !this.active) return null;
    const tSpin = this.detectTSpin();
    const matrix = this.getShape();
    let lockedEntirelyAboveVisible = true;

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const bx = this.active.x + c;
        const by = this.active.y + r;
        if (by >= BUFFER_ROWS) lockedEntirelyAboveVisible = false;
        if (by >= 0 && by < TOTAL_ROWS && bx >= 0 && bx < COLS) {
          this.board[by][bx] = this.active.type;
        }
      }
    }

    this.piecesPlaced += 1;

    // Clear full lines
    let cleared = 0;
    for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
      if (this.board[r].every((cell) => cell !== null)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }

    const isPerfectClear = cleared > 0 && this.board.every((row) => row.every((cell) => cell === null));
    let baseAttack = 0;
    let baseScore = 0;
    let actionLabel = '';
    let isDifficult = false;

    if (tSpin === 'full') {
      isDifficult = cleared > 0;
      const scores = [400, 800, 1200, 1600];
      const attacks = [0, 2, 4, 6];
      baseScore = scores[cleared] || 1600;
      baseAttack = attacks[cleared] || 6;
      actionLabel = cleared === 0 ? 'T-SPIN' : ['', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'][cleared];
    } else if (tSpin === 'mini') {
      isDifficult = cleared > 0;
      const scores = [100, 200, 400];
      const attacks = [0, 0, 1];
      baseScore = scores[cleared] || 400;
      baseAttack = attacks[cleared] || 1;
      actionLabel = cleared === 0 ? 'T-SPIN MINI' : `T-SPIN MINI ${cleared === 1 ? 'SINGLE' : 'DOUBLE'}`;
    } else if (cleared > 0) {
      const scores = [0, 100, 300, 500, 800];
      const attacks = [0, 0, 1, 2, 4];
      baseScore = scores[cleared] || 800;
      baseAttack = attacks[cleared] || 4;
      isDifficult = cleared === 4;
      if (cleared === 4) actionLabel = 'TETRIS!';
      else if (cleared === 3) actionLabel = 'TRIPLE';
      else if (cleared === 2) actionLabel = 'DOUBLE';
    }

    let b2bBonus = 0;
    if (cleared > 0) {
      this.combo += 1;
      if (isDifficult) {
        if (this.b2b) {
          b2bBonus = 1;
          baseScore = Math.round(baseScore * 1.5);
        }
        this.b2b = true;
      } else {
        this.b2b = false;
      }
    } else {
      this.combo = -1;
    }

    const comboBonus = this.combo > 0 ? COMBO_TABLE[Math.min(this.combo, COMBO_TABLE.length - 1)] : 0;
    const pcBonus = isPerfectClear ? 10 : 0;
    if (isPerfectClear) {
      actionLabel = 'PERFECT CLEAR!';
      baseScore += 1800;
    }

    let rawAttack = baseAttack + (cleared > 0 ? b2bBonus + comboBonus + pcBonus : 0);
    if (rawAttack > 0 && this.garbageMultiplier !== 1) {
      rawAttack = Math.max(1, Math.round(rawAttack * this.garbageMultiplier));
    }

    this.lines += cleared;
    this.level = Math.min(20, this.startLevel + Math.floor(this.lines / 10));
    this.score += baseScore * this.level + Math.max(0, this.combo) * 50 * this.level;

    let garbageCancelled = 0;
    let attackSent = 0;
    let garbageApplied = 0;

    if (cleared > 0) {
      if (rawAttack > 0 && this.pendingGarbage > 0) {
        garbageCancelled = Math.min(rawAttack, this.pendingGarbage);
        this.pendingGarbage -= garbageCancelled;
        attackSent = rawAttack - garbageCancelled;
      } else {
        attackSent = rawAttack;
      }

      if (attackSent > 0) {
        this.attackTotal += attackSent;
        if (this.onAttack) {
          this.onAttack({
            lines: attackSent,
            attackType: actionLabel || (this.combo > 0 ? `${this.combo} REN` : 'ATTACK'),
            combo: Math.max(0, this.combo),
            b2b: this.b2b && b2bBonus > 0,
          });
        }
      }
      if (this.onEvent) {
        this.onEvent('line_clear', {
          cleared,
          tSpin,
          b2b: b2bBonus > 0,
          combo: this.combo,
          isPerfectClear,
          attackSent,
          garbageCancelled,
          actionLabel,
        });
      }
    } else {
      garbageApplied = this.applyPendingGarbage(8);
    }

    this.lastActionText = actionLabel || (this.combo > 0 ? `${this.combo} REN` : '');

    if (lockedEntirelyAboveVisible) {
      this.active = null;
      this.triggerTopOut();
      return { cleared, attackSent, garbageCancelled, garbageApplied, topOut: true };
    }

    this.spawnNext();
    return {
      cleared,
      attackSent,
      garbageCancelled,
      garbageApplied,
      actionLabel,
      combo: this.combo,
      b2b: this.b2b,
      topOut: this.gameOver,
    };
  }

  tick(dtMs) {
    if (this.gameOver || !this.active) return;
    this.elapsedMs += dtMs;
    const gravityMs = getGravityMs(this.level);

    this.updateGroundedState();
    if (!this.isGrounded) {
      this.gravityAccMs += dtMs;
      while (this.gravityAccMs >= gravityMs && !this.isGrounded) {
        this.gravityAccMs -= gravityMs;
        if (!this.move(0, 1)) break;
        this.updateGroundedState();
      }
      if (!this.isGrounded) {
        this.lockTimerMs = 0;
      }
    } else {
      this.lockTimerMs += dtMs;
      if (this.lockTimerMs >= 500) {
        this.lockCurrentPiece();
      }
    }
  }

  getStats() {
    const secs = Math.max(0.1, this.elapsedMs / 1000);
    return {
      score: this.score,
      lines: this.lines,
      level: this.level,
      attackTotal: this.attackTotal,
      piecesPlaced: this.piecesPlaced,
      pps: Number((this.piecesPlaced / secs).toFixed(2)),
      apm: Number(((this.attackTotal / secs) * 60).toFixed(1)),
      combo: Math.max(0, this.combo),
      b2b: this.b2b,
    };
  }

  getSnapshot() {
    return {
      board: this.board,
      active: this.active ? { ...this.active } : null,
      ghostY: this.active ? this.getGhostY() : null,
      hold: this.hold,
      next: this.queue.slice(0, 5),
      score: this.score,
      lines: this.lines,
      level: this.level,
      pendingGarbage: this.pendingGarbage,
      attackTotal: this.attackTotal,
      combo: Math.max(0, this.combo),
      b2b: this.b2b,
      lastAction: this.lastActionText,
    };
  }
}
