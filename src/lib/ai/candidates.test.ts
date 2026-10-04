import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../tetris/constants';
import {
  absoluteCells,
  createGame,
  isValidPosition,
  move,
  rotate,
} from '../tetris/engine';
import { COLS, ROWS } from '../tetris/types';
import type { ActivePiece, Board, CellValue, EngineState } from '../tetris/types';
import { enumerateCandidates } from './candidates';

function spawn(kind: ActivePiece['kind']): ActivePiece {
  return { kind, rot: 0, x: 3, y: 0 };
}

function toState(board: Board, active: ActivePiece): EngineState {
  const base = createGame(1);
  return { ...base, board, active, status: 'playing' };
}

function landingCells(
  kind: ActivePiece['kind'],
  rot: ActivePiece['rot'],
  x: number,
  y: number,
): [number, number][] {
  return absoluteCells({ kind, rot, x, y });
}

describe('enumerateCandidates', () => {
  it('lists valid landings on an empty board with unique sorted ids', () => {
    const board = createEmptyBoard();
    const cands = enumerateCandidates(board, spawn('T'));
    expect(cands.length).toBeGreaterThan(0);
    expect(new Set(cands.map((c) => c.id)).size).toBe(cands.length);
    expect(cands.map((c) => c.id)).toEqual(
      [...cands.map((c) => c.id)].sort(),
    );
    for (const c of cands) {
      expect(c.id).toBe(`r${c.rot}x${c.x}`);
      expect(c.features.rot).toBe(c.rot);
      expect(c.features.x).toBe(c.x);
      expect(c.features.landingY).toBeGreaterThanOrEqual(0);
      expect(
        isValidPosition(
          board,
          landingCells('T', c.rot, c.x, c.features.landingY),
        ),
      ).toBe(true);
      expect(
        isValidPosition(
          board,
          landingCells('T', c.rot, c.x, c.features.landingY + 1),
        ),
      ).toBe(false);
      expect(c.actions[c.actions.length - 1]).toEqual({ type: 'drop' });
    }
  });

  it('dedupes rotations with identical cell sets (O piece)', () => {
    const cands = enumerateCandidates(createEmptyBoard(), spawn('O'));
    expect(cands.length).toBeGreaterThan(0);
    expect(new Set(cands.map((c) => c.rot))).toEqual(new Set([0]));
    // O cells span box columns 1..2, so box x runs -1..7 on an empty board.
    expect(cands.length).toBe(9);
  });

  it('replays actions through the engine to the exact rest pose', () => {
    const board = createEmptyBoard();
    const active = spawn('T');
    const cands = enumerateCandidates(board, active);
    expect(cands.length).toBeGreaterThan(0);
    for (const cand of cands) {
      let s = toState(board, { ...active });
      for (const a of cand.actions) {
        if (a.type === 'drop') {
          continue;
        } else if (a.type === 'left') {
          const r = move(s, -1, 0);
          expect(r.moved).toBe(true);
          s = r.state;
        } else if (a.type === 'right') {
          const r = move(s, 1, 0);
          expect(r.moved).toBe(true);
          s = r.state;
        } else if (a.type === 'down') {
          const r = move(s, 0, 1);
          expect(r.moved).toBe(true);
          s = r.state;
        } else {
          const r = rotate(s, a.dir);
          expect(r.rotated).toBe(true);
          s = r.state;
        }
      }
      expect(s.active?.rot).toBe(cand.rot);
      expect(s.active?.x).toBe(cand.x);
      expect(s.active?.y).toBe(cand.features.landingY);
    }
  });

  it('reports flat-board features (no holes, no clears)', () => {
    const cands = enumerateCandidates(createEmptyBoard(), spawn('T'));
    for (const c of cands) {
      expect(c.features.holes).toBeGreaterThanOrEqual(0);
      expect(c.features.linesCleared).toBe(0);
      expect(c.features.aggregateHeight).toBeGreaterThan(0);
      expect(c.features.maxHeight).toBeGreaterThan(0);
      expect(c.features.bumpiness).toBeGreaterThanOrEqual(0);
    }
    const flat = cands.find((c) => c.rot === 0);
    expect(flat).toBeDefined();
    // Flat T leaves no overhang cavity on an empty board.
    expect(flat?.features.holes).toBe(0);
    // T rot0 cells bottom out at box row 1, so the box rests at ROWS - 2.
    expect(flat?.features.landingY).toBe(ROWS - 2);
  });

  it('detects a line clear set up on the bottom row', () => {
    const board = createEmptyBoard();
    for (let x = 0; x < COLS - 1; x++) {
      board[ROWS - 1][x] = 1 as CellValue;
    }
    // Vertical I at box x=7 occupies column 9 across rows 16..19.
    const cands = enumerateCandidates(board, spawn('I'));
    const fill = cands.find((c) => c.rot === 1 && c.x === 7);
    expect(fill).toBeDefined();
    expect(fill?.features.linesCleared).toBe(1);
  });

  it('excludes landings sealed behind a full-height wall', () => {
    const board = createEmptyBoard();
    for (let y = 0; y < ROWS; y++) {
      board[y][5] = 1 as CellValue;
    }
    // O cells span box columns 1..2: box x=5 is geometrically droppable
    // (cells land in columns 6..7) but unreachable across the wall.
    const cands = enumerateCandidates(board, spawn('O'));
    expect(cands.find((c) => c.id === 'r0x5')).toBeUndefined();
    expect(cands.length).toBe(4);
    for (const c of cands) {
      expect(c.x).toBeLessThanOrEqual(2);
    }
  });

  it('routes over a low wall by descending first (tuck)', () => {
    const board = createEmptyBoard();
    for (let y = 0; y <= 3; y++) {
      board[y][6] = 1 as CellValue;
    }
    const active = spawn('T');
    const cands = enumerateCandidates(board, active);
    const beyond = cands.find((c) => c.rot === 0 && c.x === 7);
    expect(beyond).toBeDefined();
    // Sliding across at spawn height is blocked; the path must go down first.
    expect(beyond?.actions.some((a) => a.type === 'down')).toBe(true);
    let s = toState(board, { ...active });
    for (const a of beyond?.actions ?? []) {
      if (a.type === 'drop') {
        continue;
      } else if (a.type === 'rotate') {
        s = rotate(s, a.dir).state;
      } else if (a.type === 'left') {
        s = move(s, -1, 0).state;
      } else if (a.type === 'right') {
        s = move(s, 1, 0).state;
      } else {
        s = move(s, 0, 1).state;
      }
    }
    expect(s.active?.x).toBe(7);
    expect(s.active?.y).toBe(beyond?.features.landingY);
  });

  it('excludes placements blocked by a filled column', () => {
    const board = createEmptyBoard();
    for (let y = 0; y < ROWS; y++) {
      board[y][0] = 1 as CellValue;
    }
    const cands = enumerateCandidates(board, spawn('T'));
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      const xs = landingCells('T', c.rot, c.x, c.features.landingY).map(
        ([ax]) => ax,
      );
      expect(xs).not.toContain(0);
    }
  });

  it('returns no candidates when the spawn row is full', () => {
    const board = createEmptyBoard();
    for (let x = 0; x < COLS; x++) {
      board[0][x] = 1 as CellValue;
      board[1][x] = 1 as CellValue;
    }
    expect(enumerateCandidates(board, spawn('T'))).toEqual([]);
  });
});
