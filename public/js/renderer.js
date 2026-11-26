import { COLS, VISIBLE_ROWS, BUFFER_ROWS, PIECE_COLORS, PIECE_SHAPES } from './tetris-engine.js';

function drawBlock(ctx, x, y, size, color, alpha = 1, ghost = false) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (ghost) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillStyle = `${color}22`;
    ctx.fillRect(x + 1.5, y + 1.5, size - 3, size - 3);
    ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
    ctx.restore();
    return;
  }

  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

  // Subtle top/left highlight and bottom/right bevel
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(x + 1, y + 1, size - 2, Math.max(2, Math.floor(size * 0.16)));
  ctx.fillRect(x + 1, y + 1, Math.max(2, Math.floor(size * 0.14)), size - 2);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.fillRect(x + 1, y + size - Math.max(2, Math.floor(size * 0.18)), size - 2, Math.max(2, Math.floor(size * 0.16)));

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
  ctx.restore();
}

export function renderBoard(canvas, snapshot, options = {}) {
  if (!canvas || !snapshot || !snapshot.board) return;
  const ctx = canvas.getContext('2d');
  const cellSize = canvas.width / COLS;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background grid
  ctx.fillStyle = '#090d1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(130, 160, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    const px = Math.floor(c * cellSize) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  }
  for (let r = 1; r < VISIBLE_ROWS; r++) {
    const py = Math.floor(r * cellSize) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
    ctx.stroke();
  }

  // Locked blocks (rows BUFFER_ROWS .. TOTAL_ROWS-1)
  for (let r = BUFFER_ROWS; r < snapshot.board.length; r++) {
    const row = snapshot.board[r];
    const visRow = r - BUFFER_ROWS;
    for (let c = 0; c < COLS; c++) {
      const cell = row[c];
      if (!cell) continue;
      drawBlock(ctx, c * cellSize, visRow * cellSize, cellSize, PIECE_COLORS[cell] || '#888');
    }
  }

  // Ghost piece
  if (snapshot.active && typeof snapshot.ghostY === 'number') {
    const matrix = PIECE_SHAPES[snapshot.active.type]?.[snapshot.active.rot];
    if (matrix) {
      const color = PIECE_COLORS[snapshot.active.type] || '#fff';
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const visRow = snapshot.ghostY + r - BUFFER_ROWS;
          if (visRow < 0) continue;
          drawBlock(ctx, (snapshot.active.x + c) * cellSize, visRow * cellSize, cellSize, color, 0.65, true);
        }
      }
    }
  }

  // Active piece
  if (snapshot.active) {
    const matrix = PIECE_SHAPES[snapshot.active.type]?.[snapshot.active.rot];
    if (matrix) {
      const color = PIECE_COLORS[snapshot.active.type] || '#fff';
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const visRow = snapshot.active.y + r - BUFFER_ROWS;
          if (visRow < 0) continue;
          drawBlock(ctx, (snapshot.active.x + c) * cellSize, visRow * cellSize, cellSize, color, 1, false);
        }
      }
    }
  }

  // Top-out / danger overlay near top
  if (options.isDead) {
    ctx.fillStyle = 'rgba(10, 12, 22, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

export function renderMiniPiece(ctx, type, centerX, centerY, cellSize, dimmed = false) {
  if (!type || !PIECE_SHAPES[type]) return;
  const matrix = PIECE_SHAPES[type][0];
  let minC = 4;
  let maxC = -1;
  let minR = 4;
  let maxR = -1;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
      }
    }
  }
  const w = (maxC - minC + 1) * cellSize;
  const h = (maxR - minR + 1) * cellSize;
  const startX = centerX - w / 2;
  const startY = centerY - h / 2;
  const color = PIECE_COLORS[type] || '#fff';

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!matrix[r][c]) continue;
      drawBlock(
        ctx,
        startX + (c - minC) * cellSize,
        startY + (r - minR) * cellSize,
        cellSize,
        color,
        dimmed ? 0.35 : 1,
        false
      );
    }
  }
}

export function renderHoldCanvas(canvas, holdType, canHold = true) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!holdType) return;
  renderMiniPiece(ctx, holdType, canvas.width / 2, canvas.height / 2, 18, !canHold);
}

export function renderNextCanvas(canvas, nextList) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!Array.isArray(nextList)) return;

  const count = Math.min(5, nextList.length);
  const slotHeight = canvas.height / 5;
  for (let i = 0; i < count; i++) {
    const size = i === 0 ? 18 : 15;
    renderMiniPiece(ctx, nextList[i], canvas.width / 2, slotHeight * i + slotHeight / 2, size, false);
  }
}

export function renderGarbageBar(el, lines) {
  if (!el) return;
  const clamped = Math.max(0, Math.min(20, lines || 0));
  const pct = (clamped / 20) * 100;
  el.style.height = `${pct}%`;
  el.dataset.count = String(clamped);
}
