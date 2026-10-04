import { describe, expect, it } from 'vitest';
import { KIND_ORDER, QUEUE_SIZE, SPAWN_X, SPAWN_Y, cellFor } from './constants';
import {
  absoluteCells,
  createGame,
  gravityTick,
  hardDrop,
  isValidPosition,
  lockActive,
  move,
  rotate,
} from './engine';
import { createBagState, drawFromBag, mulberry32 } from './rng';
import { COLS, ROWS } from './types';
import type {
  ActivePiece,
  Board,
  CellValue,
  EngineState,
  PieceKind,
} from './types';

function emptyRow(): CellValue[] {
  return Array.from({ length: COLS }, () => 0 as CellValue);
}

function boardWith(fills: [number, number, CellValue][]): Board {
  const board: Board = Array.from({ length: ROWS }, () => emptyRow());
  for (const [x, y, v] of fills) board[y][x] = v;
  return board;
}

function fillRow(y: number, cols: number[], v: CellValue = 1): Board {
  return boardWith(cols.map((x): [number, number, CellValue] => [x, y, v]));
}

// Base state with caller-controlled board/active; queue+bg come from a seed.
function makeState(
  seed: number,
  active: ActivePiece,
  board: Board,
  patch: Partial<EngineState> = {},
): EngineState {
  const base = createGame(seed);
  return { ...base, board, active, status: 'playing', ...patch };
}

function drawMany(seed: number, n: number): PieceKind[] {
  let bag = createBagState(seed);
  const out: PieceKind[] = [];
  for (let i = 0; i < n; i++) {
    const d = drawFromBag(bag);
    bag = d.bag;
    out.push(d.piece);
  }
  return out;
}

describe('rng', () => {
  it('mulberry32 stays in [0, 1) and is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const va = a();
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
      expect(va).toBe(b());
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('does not mutate the input bag', () => {
    const before = createBagState(5);
    const snapshot = { ...before };
    drawFromBag(before);
    expect(before).toEqual(snapshot);
  });

  it('deals a permutation of all 7 kinds per bag', () => {
    for (const seed of [1, 7, 12345]) {
      expect([...drawMany(seed, 7)].sort()).toEqual([...KIND_ORDER].sort());
      expect([...drawMany(seed, 7).slice(0)].sort()).toEqual(
        [...drawMany(seed, 14).slice(7)].sort(),
      );
    }
  });
});

describe('createGame', () => {
  it('starts empty with a spawned piece and full queue', () => {
    const s = createGame(1);
    expect(s.board.flat().every((c) => c === 0)).toBe(true);
    expect(s.active).toMatchObject({ x: SPAWN_X, y: SPAWN_Y, rot: 0 });
    expect(s.active).not.toBeNull();
    expect(s.queue).toHaveLength(QUEUE_SIZE);
    expect(s.score).toBe(0);
    expect(s.lines).toBe(0);
    expect(s.level).toBe(0);
    expect(s.pieces).toBe(0);
    expect(s.status).toBe('playing');
  });

  it('same seed yields identical evolution', () => {
    expect(createGame(42)).toEqual(createGame(42));
    const a = hardDrop(createGame(42));
    const b = hardDrop(createGame(42));
    expect(a.state).toEqual(b.state);
    expect(a.distance).toBe(b.distance);
  });

  it('different seeds diverge', () => {
    expect(createGame(1).queue).not.toEqual(createGame(2).queue);
  });
});

describe('move', () => {
  it('slides on empty board and stops at the left wall', () => {
    const s = makeState(1, { kind: 'I', rot: 1, x: -2, y: 0 }, boardWith([]));
    // Vertical I occupies column x+2 = 0.
    expect(move(s, -1, 0).moved).toBe(false);
    const right = move(s, 1, 0);
    expect(right.moved).toBe(true);
    expect(right.state.active?.x).toBe(-1);
    // Input state is untouched.
    expect(s.active?.x).toBe(-2);
  });

  it('is blocked by the floor and by stacked blocks', () => {
    const bottom = makeState(
      1,
      { kind: 'O', rot: 0, x: 3, y: 17 },
      boardWith([]),
    );
    expect(move(bottom, 0, 1).moved).toBe(false);

    const stacked = makeState(
      1,
      { kind: 'O', rot: 0, x: 3, y: 16 },
      boardWith([[4, 19, 1]]),
    );
    expect(move(stacked, 0, 1).moved).toBe(false);
    expect(move(stacked, 1, 0).moved).toBe(true);
  });

  it('does nothing when the game is over', () => {
    const s = { ...createGame(1), status: 'over' as const, active: null };
    expect(move(s, 0, 1)).toEqual({ state: s, moved: false });
  });
});

describe('rotate', () => {
  it('uses a wall kick when the direct rotation is blocked', () => {
    const s = makeState(1, { kind: 'I', rot: 1, x: 7, y: 0 }, boardWith([]));
    // Rotating to horizontal in place would exit the right wall.
    expect(
      isValidPosition(
        s.board,
        absoluteCells({ kind: 'I', rot: 2, x: 7, y: 0 }),
      ),
    ).toBe(false);
    const r = rotate(s, 1);
    expect(r.rotated).toBe(true);
    expect(r.state.active).toMatchObject({ kind: 'I', rot: 2, x: 6, y: 0 });
  });

  it('rotates freely on an empty board, both directions', () => {
    const s = makeState(1, { kind: 'T', rot: 0, x: 3, y: 5 }, boardWith([]));
    const cw = rotate(s, 1);
    expect(cw.rotated).toBe(true);
    expect(cw.state.active?.rot).toBe(1);
    const back = rotate(cw.state, -1);
    expect(back.rotated).toBe(true);
    expect(back.state.active).toEqual(s.active);
  });
});

describe('locking and scoring', () => {
  it('clears a single line for 100 x (level+1)', () => {
    const board = fillRow(ROWS - 1, [0, 1, 2, 3, 4, 5]);
    const s = makeState(1, { kind: 'I', rot: 0, x: 6, y: ROWS - 2 }, board);
    const { state: next, events } = lockActive(s);
    expect(next.lines).toBe(1);
    expect(next.score).toBe(100);
    expect(next.level).toBe(0);
    expect(next.pieces).toBe(1);
    expect(events).toContainEqual({ type: 'lock', kind: 'I' });
    expect(events).toContainEqual({ type: 'clear', cleared: 1, points: 100 });
    expect(events.some((e) => e.type === 'levelup')).toBe(false);
    expect(events.some((e) => e.type === 'spawn')).toBe(true);
    // Cleared row is gone; nothing of the locked piece remains.
    expect(next.board.flat().every((c) => c === 0)).toBe(true);
  });

  it('scales single points by level', () => {
    const board = fillRow(ROWS - 1, [0, 1, 2, 3, 4, 5]);
    const s = makeState(
      1,
      { kind: 'I', rot: 0, x: 6, y: ROWS - 2 },
      board,
      { lines: 20, level: 2, score: 500 },
    );
    const { state: next } = lockActive(s);
    expect(next.score).toBe(500 + 300);
    expect(next.lines).toBe(21);
    expect(next.level).toBe(2);
  });

  it('clears four lines (tetris) for 800 x (level+1)', () => {
    const board = boardWith([]);
    for (let y = ROWS - 4; y < ROWS; y++) {
      for (let x = 0; x < COLS - 1; x++) board[y][x] = 3;
    }
    // Vertical I fills column 9 across the four prepared rows.
    const s = makeState(1, { kind: 'I', rot: 1, x: 7, y: ROWS - 4 }, board);
    const { state: next, events } = lockActive(s);
    expect(next.lines).toBe(4);
    expect(next.score).toBe(800);
    expect(events).toContainEqual({ type: 'clear', cleared: 4, points: 800 });
  });

  it('levels up every 10 lines', () => {
    const board = fillRow(ROWS - 1, [0, 1, 2, 3, 4, 5]);
    const s = makeState(
      1,
      { kind: 'I', rot: 0, x: 6, y: ROWS - 2 },
      board,
      { lines: 9, level: 0 },
    );
    const { state: next, events } = lockActive(s);
    expect(next.lines).toBe(10);
    expect(next.level).toBe(1);
    expect(events).toContainEqual({ type: 'levelup', level: 1 });
  });
});

describe('gravity and hard drop', () => {
  it('gravityTick falls one row, then locks at the floor', () => {
    let s = makeState(1, { kind: 'O', rot: 0, x: 3, y: 0 }, boardWith([]));
    const tick = gravityTick(s);
    expect(tick.events).toEqual([]);
    expect(tick.state.active?.y).toBe(1);
    // Drop to the floor: O occupies rows y+1..y+2, so it rests at y=17.
    s = tick.state;
    for (let i = 0; i < 16; i++) s = gravityTick(s).state;
    expect(s.active?.y).toBe(17);
    const landed = gravityTick(s);
    expect(landed.state.pieces).toBe(1);
    expect(landed.state.board[ROWS - 1][4]).toBe(cellFor('O'));
    expect(landed.events[0]).toEqual({ type: 'lock', kind: 'O' });
  });

  it('hardDrop returns the travelled distance and locks', () => {
    const s = makeState(1, { kind: 'O', rot: 0, x: 3, y: 0 }, boardWith([]));
    const { state: next, distance } = hardDrop(s);
    // Cells start on rows 1-2 and land on rows 18-19.
    expect(distance).toBe(17);
    expect(next.pieces).toBe(1);
    expect(next.board[ROWS - 2][4]).toBe(cellFor('O'));
    expect(next.board[ROWS - 1][5]).toBe(cellFor('O'));
  });

  it('hardDrop on a finished game does nothing', () => {
    const s = { ...createGame(1), status: 'over' as const, active: null };
    expect(hardDrop(s)).toEqual({ state: s, distance: 0 });
  });
});

describe('game over', () => {
  it('ends the game when the next spawn is blocked', () => {
    const start = createGame(7);
    const spawnKind = start.queue[0];
    const [bx, by] = absoluteCells({
      kind: spawnKind,
      rot: 0,
      x: SPAWN_X,
      y: SPAWN_Y,
    })[0];
    // Block the spawn cell but complete no line.
    const board = boardWith([[bx, by, 1]]);
    const s: EngineState = {
      ...start,
      board,
      active: { kind: 'I', rot: 0, x: 0, y: ROWS - 2 },
    };
    const { state: next, events } = lockActive(s);
    expect(next.status).toBe('over');
    expect(next.active).toBeNull();
    expect(events).toContainEqual({ type: 'gameover' });
    // A finished game stays frozen.
    expect(gravityTick(next).state).toEqual(next);
    expect(lockActive(next).events).toEqual([]);
  });
});
