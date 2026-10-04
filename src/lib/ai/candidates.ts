import { COLS, ROWS, cellFor, cellsOf } from '../tetris/constants';
import { isValidPosition } from '../tetris/engine';
import type {
  ActivePiece,
  Board,
  RotationState,
} from '../tetris/types';
import type {
  CandidateFeatures,
  CandidateMove,
  EngineAction,
} from './types';

function cellsAt(
  kind: ActivePiece['kind'],
  rot: RotationState,
  x: number,
  y: number,
): [number, number][] {
  return cellsOf(kind, rot).map(
    ([cx, cy]): [number, number] => [x + cx, y + cy],
  );
}

// Rotation states whose 4x4-box cell sets are identical (e.g. O) are one placement shape.
function uniqueRotations(
  kind: ActivePiece['kind'],
): RotationState[] {
  const seen = new Set<string>();
  const out: RotationState[] = [];
  for (const rot of [0, 1, 2, 3] as const) {
    const key = cellsOf(kind, rot)
      .map(([cx, cy]) => `${cx},${cy}`)
      .sort()
      .join('|');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(rot);
    }
  }
  return out;
}

function measureFeatures(
  clearedBoard: Board,
  rot: RotationState,
  x: number,
  landingY: number,
  linesCleared: number,
): CandidateFeatures {
  const heights: number[] = [];
  for (let c = 0; c < COLS; c++) {
    let h = 0;
    for (let r = 0; r < ROWS; r++) {
      if (clearedBoard[r][c] !== 0) {
        h = ROWS - r;
        break;
      }
    }
    heights.push(h);
  }
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let seenBlock = false;
    for (let r = 0; r < ROWS; r++) {
      if (clearedBoard[r][c] !== 0) {
        seenBlock = true;
      } else if (seenBlock) {
        holes += 1;
      }
    }
  }
  let bumpiness = 0;
  for (let c = 0; c + 1 < COLS; c++) {
    bumpiness += Math.abs(heights[c] - heights[c + 1]);
  }
  return {
    rot,
    x,
    landingY,
    linesCleared,
    holes,
    aggregateHeight: heights.reduce((a, b) => a + b, 0),
    bumpiness,
    maxHeight: Math.max(...heights),
  };
}

export function enumerateCandidates(
  board: Board,
  active: ActivePiece,
): CandidateMove[] {
  const out: CandidateMove[] = [];
  for (const rot of uniqueRotations(active.kind)) {
    for (let x = -4; x <= COLS; x++) {
      if (!isValidPosition(board, cellsAt(active.kind, rot, x, 0))) {
        continue;
      }
      let y = 0;
      while (isValidPosition(board, cellsAt(active.kind, rot, x, y + 1))) {
        y += 1;
      }
      const locked: Board = board.map((row) => [...row]);
      for (const [ax, ay] of cellsAt(active.kind, rot, x, y)) {
        locked[ay][ax] = cellFor(active.kind);
      }
      const kept = locked.filter((row) => row.some((c) => c === 0));
      const linesCleared = ROWS - kept.length;
      const empty: Board = Array.from({ length: linesCleared }, () =>
        Array.from({ length: COLS }, () => 0 as Board[number][number]),
      );
      const after: Board = [...empty, ...kept];
      const features = measureFeatures(after, rot, x, y, linesCleared);

      const actions: EngineAction[] = [];
      const turns = (((rot - active.rot) % 4) + 4) % 4;
      for (let i = 0; i < turns; i++) {
        actions.push({ type: 'rotate', dir: 1 });
      }
      const dx = x - active.x;
      for (let i = 0; i < Math.abs(dx); i++) {
        actions.push({ type: dx > 0 ? 'right' : 'left' });
      }
      actions.push({ type: 'drop' });

      out.push({ id: `r${rot}x${x}`, rot, x, features, actions });
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
