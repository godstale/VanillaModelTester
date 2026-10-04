import type {
  ActivePiece,
  Board,
  PieceKind,
  RotationDir,
  RotationState,
} from '../tetris/types';

/** Point-in-time game view handed to agents. Boards are engine-owned copies. */
export interface BoardSnapshot {
  board: Board;
  active: ActivePiece | null;
  queue: PieceKind[];
  score: number;
  lines: number;
  level: number;
  stepIndex: number;
}

export type EngineAction =
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'rotate'; dir: RotationDir }
  | { type: 'drop' };

/** Post-placement board features (measured after locking and line clears). */
export interface CandidateFeatures {
  rot: RotationState;
  x: number;
  landingY: number;
  linesCleared: number;
  holes: number;
  aggregateHeight: number;
  bumpiness: number;
  maxHeight: number;
}

export interface CandidateMove {
  id: string;
  rot: RotationState;
  x: number;
  features: CandidateFeatures;
  actions: EngineAction[];
}

export interface MoveDecision {
  moveId: string;
  confidence: number;
  abstained: boolean;
  latencyMs: number;
}

export interface DecisionAgent {
  readonly name: string;
  decide(
    snap: BoardSnapshot,
    cands: CandidateMove[],
  ): Promise<MoveDecision>;
}
