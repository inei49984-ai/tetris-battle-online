import { COLS, TOTAL_ROWS, PIECE_SHAPES } from './tetris-engine.js';

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function isValidOnBoard(board, matrix, x, y) {
  const n = matrix.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c]) continue;
      const bx = x + c;
      const by = y + r;
      if (bx < 0 || bx >= COLS || by >= TOTAL_ROWS) return false;
      if (by >= 0 && board[by][bx] !== null) return false;
    }
  }
  return true;
}

function evaluateBoard(board, linesCleared) {
  const heights = Array(COLS).fill(0);
  let holes = 0;
  let aggregateHeight = 0;

  for (let c = 0; c < COLS; c++) {
    let foundTop = false;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (board[r][c] !== null) {
        if (!foundTop) {
          heights[c] = TOTAL_ROWS - r;
          foundTop = true;
        }
      } else if (foundTop) {
        holes++;
      }
    }
    aggregateHeight += heights[c];
  }

  let bumpiness = 0;
  for (let c = 0; c < COLS - 1; c++) {
    bumpiness += Math.abs(heights[c] - heights[c + 1]);
  }

  const maxHeight = Math.max(...heights);
  const lineScore = linesCleared === 4 ? 6.0 : linesCleared === 3 ? 2.8 : linesCleared === 2 ? 1.4 : linesCleared === 1 ? 0.5 : 0;

  return (
    lineScore * 1.4 -
    aggregateHeight * 0.51 -
    holes * 0.78 -
    bumpiness * 0.22 -
    Math.max(0, maxHeight - 13) * 0.65
  );
}

export function findBestMove(engine, difficulty = 'normal') {
  if (!engine.active || engine.gameOver) return null;
  const type = engine.active.type;
  const rotLimit = type === 'O' ? 1 : 4;
  const candidates = [];

  for (let rot = 0; rot < rotLimit; rot++) {
    const matrix = PIECE_SHAPES[type][rot];
    for (let x = -2; x < COLS + 1; x++) {
      if (!isValidOnBoard(engine.board, matrix, x, engine.active.y)) {
        if (!isValidOnBoard(engine.board, matrix, x, 0)) continue;
      }
      let y = 0;
      if (!isValidOnBoard(engine.board, matrix, x, y)) continue;
      while (isValidOnBoard(engine.board, matrix, x, y + 1)) {
        y++;
      }

      const sim = cloneBoard(engine.board);
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] && y + r >= 0 && y + r < TOTAL_ROWS) {
            sim[y + r][x + c] = type;
          }
        }
      }

      let cleared = 0;
      for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
        if (sim[r].every((cell) => cell !== null)) {
          sim.splice(r, 1);
          sim.unshift(Array(COLS).fill(null));
          cleared++;
          r++;
        }
      }

      const score = evaluateBoard(sim, cleared);
      candidates.push({ rot, x, score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  if (difficulty === 'easy' && candidates.length > 2) {
    const pickIdx = Math.floor(Math.random() * Math.min(4, candidates.length));
    return candidates[pickIdx];
  }
  if (difficulty === 'normal' && candidates.length > 1 && Math.random() < 0.15) {
    return candidates[1];
  }
  return candidates[0];
}

export class AiController {
  constructor(engine, difficulty = 'normal') {
    this.engine = engine;
    this.difficulty = difficulty;
    this.accMs = 0;
    this.plan = null;
  }

  getStepIntervalMs() {
    if (this.difficulty === 'easy') return 420;
    if (this.difficulty === 'hard') return 145;
    return 260;
  }

  tick(dtMs) {
    if (this.engine.gameOver || !this.engine.active) return;
    this.accMs += dtMs;
    const interval = this.getStepIntervalMs();
    if (this.accMs < interval) return;
    this.accMs -= interval;

    if (!this.plan) {
      this.plan = findBestMove(this.engine, this.difficulty);
    }
    if (!this.plan) {
      this.engine.hardDrop();
      return;
    }

    if (this.engine.active.rot !== this.plan.rot) {
      if (!this.engine.rotate(1)) {
        this.plan = null;
      }
      return;
    }

    if (this.engine.active.x < this.plan.x) {
      if (!this.engine.move(1, 0)) {
        this.engine.hardDrop();
        this.plan = null;
      }
      return;
    }

    if (this.engine.active.x > this.plan.x) {
      if (!this.engine.move(-1, 0)) {
        this.engine.hardDrop();
        this.plan = null;
      }
      return;
    }

    this.engine.hardDrop();
    this.plan = null;
  }
}
