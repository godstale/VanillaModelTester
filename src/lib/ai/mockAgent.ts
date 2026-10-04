import { mulberry32 } from '../tetris/rng';
import type {
  BoardSnapshot,
  CandidateMove,
  DecisionAgent,
  MoveDecision,
} from './types';

export function createMockAgent(seed: number): DecisionAgent {
  const rand = mulberry32(seed);
  return {
    name: 'mock',
    async decide(
      snap: BoardSnapshot,
      cands: CandidateMove[],
    ): Promise<MoveDecision> {
      void snap;
      const start = performance.now();
      if (cands.length === 0) {
        return {
          moveId: '',
          confidence: 0,
          abstained: true,
          latencyMs: performance.now() - start,
        };
      }
      const pick = cands[Math.floor(rand() * cands.length)];
      return {
        moveId: pick.id,
        confidence: 0,
        abstained: false,
        latencyMs: performance.now() - start,
      };
    },
  };
}
