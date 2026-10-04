import type { Board, CellValue, PieceKind, RotationState } from './types';
import { COLS, ROWS } from './types';

export { COLS, ROWS };

export const KIND_ORDER: readonly PieceKind[] = [
  'I',
  'O',
  'T',
  'S',
  'Z',
  'J',
  'L',
];

export const KIND_INDEX: Record<PieceKind, number> = {
  I: 0,
  O: 1,
  T: 2,
  S: 3,
  Z: 4,
  J: 5,
  L: 6,
};

export function cellFor(kind: PieceKind): CellValue {
  return (KIND_INDEX[kind] + 1) as CellValue;
}

type XY = readonly [number, number];

/**
 * Precomputed rotation states, cells inside a 4x4 spawn box (y grows downward).
 * Index 0 = spawn orientation; +1 = clockwise.
 */
export const ROTATIONS: Record<PieceKind, readonly (readonly XY[])[]> = {
  I: [
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  ],
  O: [
    [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ],
  ],
  T: [
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  S: [
    [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  Z: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [2, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
  ],
  J: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  ],
  L: [
    [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  ],
};

export function cellsOf(kind: PieceKind, rot: RotationState): XY[] {
  return [...ROTATIONS[kind][rot]];
}

/** Wall-kick offsets tried in order ( Guideline-lite ). */
export const KICKS: readonly XY[] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
];

export const SPAWN_X = 3;
export const SPAWN_Y = 0;
export const QUEUE_SIZE = 5;

/** Points per cleared line count, multiplied by (level + 1). */
export const LINE_POINTS: readonly number[] = [0, 100, 300, 500, 800];

export function scoreFor(cleared: number, level: number): number {
  if (cleared < 1 || cleared > 4) return 0;
  return LINE_POINTS[cleared] * (level + 1);
}

export function levelFor(totalLines: number): number {
  return Math.floor(totalLines / 10);
}

/** Gravity interval; M1 manual play pacing. */
export function gravityMsForLevel(level: number): number {
  return Math.max(100, 800 - level * 70);
}

export function createEmptyBoard(): Board {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => 0 as CellValue),
  );
}
