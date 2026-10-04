import {
  COLS,
  KICKS,
  QUEUE_SIZE,
  ROWS,
  SPAWN_X,
  SPAWN_Y,
  cellFor,
  cellsOf,
  createEmptyBoard,
  levelFor,
  scoreFor,
} from './constants';
import { createBagState, drawFromBag } from './rng';
import type {
  ActivePiece,
  BagState,
  Board,
  CellValue,
  EngineEvent,
  EngineState,
  EngineStep,
  PieceKind,
  RotationDir,
  RotationState,
} from './types';

export function absoluteCells(piece: ActivePiece): [number, number][] {
  return cellsOf(piece.kind, piece.rot).map(
    ([cx, cy]): [number, number] => [piece.x + cx, piece.y + cy],
  );
}

export function isValidPosition(
  board: Board,
  cells: readonly (readonly [number, number])[],
): boolean {
  return cells.every(
    ([x, y]) =>
      x >= 0 && x < COLS && y >= 0 && y < ROWS && board[y][x] === 0,
  );
}

interface SpawnResult {
  active: ActivePiece | null;
  queue: PieceKind[];
  bag: BagState;
}

// Pops queue[0] as the new active piece and refills the back from the bag.
function spawnNext(
  board: Board,
  queue: PieceKind[],
  bag: BagState,
): SpawnResult {
  const [kind, ...rest] = queue;
  const drawn = drawFromBag(bag);
  const nextQueue = [...rest, drawn.piece];
  const active: ActivePiece = { kind, rot: 0, x: SPAWN_X, y: SPAWN_Y };
  if (!isValidPosition(board, absoluteCells(active))) {
    return { active: null, queue: nextQueue, bag: drawn.bag };
  }
  return { active, queue: nextQueue, bag: drawn.bag };
}

export function createGame(seed: number): EngineState {
  const board = createEmptyBoard();
  let bag = createBagState(seed);
  const queue: PieceKind[] = [];
  for (let i = 0; i < QUEUE_SIZE; i++) {
    const drawn = drawFromBag(bag);
    bag = drawn.bag;
    queue.push(drawn.piece);
  }
  const spawned = spawnNext(board, queue, bag);
  return {
    board,
    active: spawned.active,
    queue: spawned.queue,
    bag: spawned.bag,
    score: 0,
    lines: 0,
    level: 0,
    pieces: 0,
    status: spawned.active === null ? 'over' : 'playing',
  };
}

export function move(
  state: EngineState,
  dx: number,
  dy: number,
): { state: EngineState; moved: boolean } {
  if (state.status === 'over' || state.active === null) {
    return { state, moved: false };
  }
  const active: ActivePiece = {
    ...state.active,
    x: state.active.x + dx,
    y: state.active.y + dy,
  };
  if (!isValidPosition(state.board, absoluteCells(active))) {
    return { state, moved: false };
  }
  return { state: { ...state, active }, moved: true };
}

export function rotate(
  state: EngineState,
  dir: RotationDir,
): { state: EngineState; rotated: boolean } {
  if (state.status === 'over' || state.active === null) {
    return { state, rotated: false };
  }
  const rot = ((state.active.rot + dir + 4) % 4) as RotationState;
  for (const [kx, ky] of KICKS) {
    const active: ActivePiece = {
      ...state.active,
      rot,
      x: state.active.x + kx,
      y: state.active.y + ky,
    };
    if (isValidPosition(state.board, absoluteCells(active))) {
      return { state: { ...state, active }, rotated: true };
    }
  }
  return { state, rotated: false };
}

export function lockActive(state: EngineState): EngineStep {
  if (state.status === 'over' || state.active === null) {
    return { state, events: [] };
  }
  const kind = state.active.kind;
  const locked: Board = state.board.map((row) => [...row]);
  for (const [x, y] of absoluteCells(state.active)) {
    locked[y][x] = cellFor(kind);
  }
  const events: EngineEvent[] = [{ type: 'lock', kind }];
  const pieces = state.pieces + 1;

  let board = locked;
  let score = state.score;
  let lines = state.lines;
  let level = state.level;
  const kept = locked.filter((row) => row.some((c) => c === 0));
  const cleared = ROWS - kept.length;
  if (cleared > 0) {
    const points = scoreFor(cleared, level);
    score += points;
    lines += cleared;
    events.push({ type: 'clear', cleared, points });
    const nextLevel = levelFor(lines);
    if (nextLevel > level) {
      level = nextLevel;
      events.push({ type: 'levelup', level });
    }
    const empty: Board = Array.from({ length: cleared }, () =>
      Array.from({ length: COLS }, () => 0 as CellValue),
    );
    board = [...empty, ...kept];
  }

  const spawned = spawnNext(board, state.queue, state.bag);
  if (spawned.active === null) {
    events.push({ type: 'gameover' });
    return {
      state: {
        board,
        active: null,
        queue: spawned.queue,
        bag: spawned.bag,
        score,
        lines,
        level,
        pieces,
        status: 'over',
      },
      events,
    };
  }
  events.push({ type: 'spawn', kind: spawned.active.kind });
  return {
    state: {
      board,
      active: spawned.active,
      queue: spawned.queue,
      bag: spawned.bag,
      score,
      lines,
      level,
      pieces,
      status: 'playing',
    },
    events,
  };
}

export function gravityTick(state: EngineState): EngineStep {
  const { state: moved, moved: ok } = move(state, 0, 1);
  if (ok) return { state: moved, events: [] };
  return lockActive(state);
}

export function hardDrop(state: EngineState): {
  state: EngineState;
  distance: number;
} {
  if (state.status === 'over' || state.active === null) {
    return { state, distance: 0 };
  }
  let y = state.active.y;
  let distance = 0;
  while (
    isValidPosition(state.board, absoluteCells({ ...state.active, y: y + 1 }))
  ) {
    y += 1;
    distance += 1;
  }
  const dropped: EngineState =
    distance === 0
      ? state
      : { ...state, active: { ...state.active, y } };
  return { state: lockActive(dropped).state, distance };
}
