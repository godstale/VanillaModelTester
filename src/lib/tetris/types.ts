export const COLS = 10;
export const ROWS = 20;

export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 0 = empty, otherwise KIND_INDEX[kind] + 1 (used for block coloring). */
export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Board[row][col], row 0 is the top. */
export type Board = CellValue[][];

export type RotationState = 0 | 1 | 2 | 3;
export type RotationDir = 1 | -1;

/**
 * Active piece position: top-left of its 4x4 spawn box in board coords.
 * Cells come from ROTATIONS[kind][rot] offset by (x, y).
 */
export interface ActivePiece {
  kind: PieceKind;
  rot: RotationState;
  x: number;
  y: number;
}

export type GameStatus = 'playing' | 'over';

export interface BagState {
  rngState: number;
  bag: PieceKind[];
  index: number;
}

export interface EngineState {
  board: Board;
  active: ActivePiece | null;
  queue: PieceKind[];
  bag: BagState;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  status: GameStatus;
}

export type EngineEvent =
  | { type: 'spawn'; kind: PieceKind }
  | { type: 'lock'; kind: PieceKind }
  | { type: 'clear'; cleared: number; points: number }
  | { type: 'levelup'; level: number }
  | { type: 'gameover' };

export interface EngineStep {
  state: EngineState;
  events: EngineEvent[];
}
