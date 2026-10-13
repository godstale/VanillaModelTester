import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ActivePiece, Board, PieceKind, RotationState } from '@/lib/tetris/types';
import { COLS, ROWS, cellFor, cellsOf } from '@/lib/tetris/constants';

export interface BoardCanvasProps {
  board: Board;
  active: ActivePiece | null;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}

export const CELL_PX = 24;

// Canvas-only hex palette for block fillStyle. The Canvas 2D API needs raw
// color strings (Tailwind classes cannot apply here); all DOM chrome uses
// semantic tokens instead.
const BLOCK_COLORS: readonly string[] = [
  '#000000',
  '#22d3ee',
  '#facc15',
  '#c084fc',
  '#4ade80',
  '#f87171',
  '#60a5fa',
  '#fb923c',
];

const BOARD_BG = '#0b1220';
const GRID_LINE = 'rgba(148, 163, 184, 0.18)';

function hits(
  board: Board,
  kind: PieceKind,
  rot: RotationState,
  px: number,
  py: number,
): boolean {
  for (const [cx, cy] of cellsOf(kind, rot)) {
    const bx = px + cx;
    const by = py + cy;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && board[by][bx] !== 0) return true;
  }
  return false;
}

function ghostY(board: Board, piece: ActivePiece): number {
  let y = piece.y;
  while (!hits(board, piece.kind, piece.rot, piece.x, y + 1)) {
    y += 1;
  }
  return y;
}

function paintCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x * CELL_PX + 1, y * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);
  ctx.globalAlpha = 1;
}

export function BoardCanvas({ board, active, canvasRef }: BoardCanvasProps) {
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? fallbackRef;

  // Redraw after every render: the engine may reuse board array identity,
  // so snapshot changes cannot rely on reference comparison alone.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = COLS * CELL_PX;
    const h = ROWS * CELL_PX;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const v = board[y][x];
        if (v !== 0) {
          paintCell(ctx, x, y, BLOCK_COLORS[v], 1);
        }
      }
    }

    if (active) {
      const gy = ghostY(board, active);
      if (gy !== active.y) {
        for (const [cx, cy] of cellsOf(active.kind, active.rot)) {
          const by = gy + cy;
          if (by >= 0) {
            paintCell(ctx, active.x + cx, by, BLOCK_COLORS[cellFor(active.kind)], 0.3);
          }
        }
      }
      for (const [cx, cy] of cellsOf(active.kind, active.rot)) {
        const by = active.y + cy;
        if (by >= 0) {
          paintCell(ctx, active.x + cx, by, BLOCK_COLORS[cellFor(active.kind)], 1);
        }
      }
    }

    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x += 1) {
      ctx.moveTo(x * CELL_PX + 0.5, 0);
      ctx.lineTo(x * CELL_PX + 0.5, h);
    }
    for (let y = 1; y < ROWS; y += 1) {
      ctx.moveTo(0, y * CELL_PX + 0.5);
      ctx.lineTo(w, y * CELL_PX + 0.5);
    }
    ctx.stroke();
  });

  return (
    <canvas
      ref={ref}
      data-testid="tetris-board"
      width={COLS * CELL_PX}
      height={ROWS * CELL_PX}
      style={{ width: COLS * CELL_PX, height: ROWS * CELL_PX }}
      className="rounded-md border border-border"
    />
  );
}
