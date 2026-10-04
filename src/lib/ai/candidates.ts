import { COLS, KICKS, ROWS, cellFor, cellsOf } from '../tetris/constants';
import { isValidPosition } from '../tetris/engine';
import type {
  ActivePiece,
  Board,
  RotationDir,
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

interface Pose {
  x: number;
  y: number;
  rot: RotationState;
}

// Engine-identical rotation: same kick table and trial order as rotate() in
// engine.ts, so a found path always replays exactly through the engine.
function kickedRotation(
  board: Board,
  kind: ActivePiece['kind'],
  node: Pose,
  dir: RotationDir,
): Pose | null {
  const rot = ((node.rot + dir + 4) % 4) as RotationState;
  for (const [kx, ky] of KICKS) {
    const x = node.x + kx;
    const y = node.y + ky;
    if (isValidPosition(board, cellsAt(kind, rot, x, y))) {
      return { x, y, rot };
    }
  }
  return null;
}

function neighbors(
  board: Board,
  kind: ActivePiece['kind'],
  node: Pose,
): { node: Pose; action: EngineAction }[] {
  const out: { node: Pose; action: EngineAction }[] = [];
  for (const dx of [-1, 1]) {
    const next: Pose = { x: node.x + dx, y: node.y, rot: node.rot };
    if (isValidPosition(board, cellsAt(kind, next.rot, next.x, next.y))) {
      out.push({ node: next, action: dx < 0 ? { type: 'left' } : { type: 'right' } });
    }
  }
  const down: Pose = { x: node.x, y: node.y + 1, rot: node.rot };
  if (isValidPosition(board, cellsAt(kind, down.rot, down.x, down.y))) {
    out.push({ node: down, action: { type: 'down' } });
  }
  for (const dir of [1, -1] as const) {
    const turned = kickedRotation(board, kind, node, dir);
    if (turned !== null) {
      out.push({ node: turned, action: { type: 'rotate', dir } });
    }
  }
  return out;
}

// Shortest executable action sequence from the current pose to the rest pose.
// Null when the landing is geometrically droppable but unreachable on foot
// (e.g. sealed behind a full-height wall). Such options are excluded so the
// model only ever chooses landings the simulator reproduces exactly.
function findPath(
  board: Board,
  kind: ActivePiece['kind'],
  from: Pose,
  to: Pose,
): EngineAction[] | null {
  const keyOf = (n: Pose): string => `${n.x},${n.y},${n.rot}`;
  const startKey = keyOf(from);
  const prev = new Map<string, { from: string; action: EngineAction }>();
  const seen = new Set<string>([startKey]);
  const queue: Pose[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head] as Pose;
    if (node.x === to.x && node.y === to.y && node.rot === to.rot) {
      const actions: EngineAction[] = [];
      let key = keyOf(node);
      while (key !== startKey) {
        const step = prev.get(key);
        if (step === undefined) break;
        actions.unshift(step.action);
        key = step.from;
      }
      return actions;
    }
    for (const { node: next, action } of neighbors(board, kind, node)) {
      const key = keyOf(next);
      if (seen.has(key)) continue;
      seen.add(key);
      prev.set(key, { from: keyOf(node), action });
      queue.push(next);
    }
  }
  return null;
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

      const path = findPath(
        board,
        active.kind,
        { x: active.x, y: active.y, rot: active.rot },
        { x, y, rot },
      );
      if (path === null) {
        continue;
      }
      const actions: EngineAction[] = [...path, { type: 'drop' }];

      out.push({ id: `r${rot}x${x}`, rot, x, features, actions });
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
