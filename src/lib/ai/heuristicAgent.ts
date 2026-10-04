import type {
  BoardSnapshot,
  CandidateFeatures,
  CandidateMove,
  DecisionAgent,
  MoveDecision,
} from './types';

// El-Tetris (Dellacherie-derived) tuned weights: clearing lines is the only
// positive term, while height/holes/bumpiness penalties keep the stack low
// and flat. Holes weigh less than height because a single hole matters less
// than raising every future placement.
export const WEIGHTS = {
  aggregateHeight: -0.51,
  completeLines: 0.76,
  holes: -0.36,
  bumpiness: -0.18,
  maxHeight: -0.05,
} as const;

export function scoreOf(f: CandidateFeatures): number {
  return (
    f.aggregateHeight * WEIGHTS.aggregateHeight +
    f.linesCleared * WEIGHTS.completeLines +
    f.holes * WEIGHTS.holes +
    f.bumpiness * WEIGHTS.bumpiness +
    f.maxHeight * WEIGHTS.maxHeight
  );
}

function pickBest(cands: CandidateMove[]): CandidateMove {
  const ordered = [...cands].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  let best = ordered[0];
  let bestScore = scoreOf(best.features);
  for (const cand of ordered.slice(1)) {
    const s = scoreOf(cand.features);
    if (s > bestScore) {
      best = cand;
      bestScore = s;
    }
  }
  return best;
}

export function createHeuristicAgent(): DecisionAgent {
  return {
    name: 'heuristic',
    async decide(
      snap: BoardSnapshot,
      cands: CandidateMove[],
    ): Promise<MoveDecision> {
      void snap;
      const start = performance.now();
      if (cands.length === 0) {
        return {
          moveId: '',
          confidence: 1,
          abstained: true,
          latencyMs: performance.now() - start,
        };
      }
      const best = pickBest(cands);
      return {
        moveId: best.id,
        confidence: 1,
        abstained: false,
        latencyMs: performance.now() - start,
      };
    },
  };
}

export const heuristicAgent: DecisionAgent = createHeuristicAgent();
