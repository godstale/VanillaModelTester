import { COLS, ROWS } from '../tetris/constants';
import type { Board } from '../tetris/types';
import type {
  BoardSnapshot,
  CandidateFeatures,
  CandidateMove,
} from './types';

export interface QuestionDef {
  type: 'choice' | 'score' | 'noul';
  instructions: string;
  criteria?: Record<string, string> | string[];
}

// Internal cut ranking for the top-N shortlist sent to Laya. This is not an
// agent: it only decides which candidates fit the token budget. Higher is
// better; clearing lines is the only positive term.
const CUT_WEIGHTS = {
  aggregateHeight: -0.51,
  completeLines: 0.76,
  holes: -0.36,
  bumpiness: -0.18,
  maxHeight: -0.05,
} as const;

export function scoreForCut(f: CandidateFeatures): number {
  return (
    f.aggregateHeight * CUT_WEIGHTS.aggregateHeight +
    f.linesCleared * CUT_WEIGHTS.completeLines +
    f.holes * CUT_WEIGHTS.holes +
    f.bumpiness * CUT_WEIGHTS.bumpiness +
    f.maxHeight * CUT_WEIGHTS.maxHeight
  );
}

export interface EncodedRequest {
  stateText: string;
  questions: Record<string, QuestionDef>;
  kept: CandidateMove[];
  dropped: number;
}

function measureBoard(board: Board): { holes: number; maxH: number } {
  let holes = 0;
  let maxH = 0;
  for (let c = 0; c < COLS; c++) {
    let seenBlock = false;
    let height = 0;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] !== 0) {
        seenBlock = true;
        if (height === 0) {
          height = ROWS - r;
        }
      } else if (seenBlock) {
        holes += 1;
      }
    }
    if (height > maxH) {
      maxH = height;
    }
  }
  return { holes, maxH };
}

function summarize(c: CandidateMove): string {
  const f = c.features;
  return `${c.id}: rot ${c.rot} x ${c.x} lines ${f.linesCleared} holes +${f.holes} maxH ${f.maxHeight}`;
}

export function encodePlacementRequest(
  snap: BoardSnapshot,
  cands: CandidateMove[],
  maxCandidates = 8,
): EncodedRequest {
  const scored = cands.map((c) => ({ c, s: scoreForCut(c.features) }));
  scored.sort((a, b) => {
    if (b.s !== a.s) {
      return b.s - a.s;
    }
    return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
  });
  const kept = scored
    .slice(0, Math.max(0, maxCandidates))
    .map((e) => e.c);
  const dropped = cands.length - kept.length;

  const { holes, maxH } = measureBoard(snap.board);
  const active = snap.active?.kind ?? '?';
  const prefix = `holes=${holes} maxH=${maxH} active=${active} next=[${snap.queue.join(',')}]`;
  const stateText =
    kept.length > 0
      ? `${prefix} ${kept.map(summarize).join(' | ')}`
      : prefix;

  const criteria: Record<string, string> = {};
  for (const c of kept) {
    const f = c.features;
    criteria[c.id] =
      `rot ${c.rot} x ${c.x}, clears ${f.linesCleared}, holes +${f.holes}, maxH ${f.maxHeight}`;
  }
  const questions: Record<string, QuestionDef> = {
    place: {
      type: 'choice',
      instructions:
        'Choose the landing that keeps the stack lowest and flattest.',
      criteria,
    },
    danger: {
      type: 'noul',
      instructions: 'Will this stack top out within 5 pieces?',
    },
  };
  return { stateText, questions, kept, dropped };
}
