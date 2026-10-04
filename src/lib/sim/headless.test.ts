import { describe, expect, it } from 'vitest';
import type {
  BoardSnapshot,
  CandidateMove,
  DecisionAgent,
  MoveDecision,
} from '../ai/types';
import { runHeadless } from './headless';

function mockAgent(name: string): DecisionAgent {
  return {
    name,
    decide: async (
      _snap: BoardSnapshot,
      cands: CandidateMove[],
    ): Promise<MoveDecision> => ({
      moveId: cands[0]?.id ?? '',
      confidence: 0.5,
      abstained: false,
      latencyMs: 1,
    }),
  };
}

describe('runHeadless', () => {
  it('aggregates per-episode stats into a consistent summary', async () => {
    const { stats, summary } = await runHeadless(
      (seed) => mockAgent(`bench-${seed}`),
      { episodes: 3, baseSeed: 1000, maxSteps: 10 },
    );
    expect(stats).toHaveLength(3);
    expect(stats.map((s) => s.seed)).toEqual([1000, 1001, 1002]);

    const lines = stats.map((s) => s.lines);
    const scores = stats.map((s) => s.score);
    const steps = stats.map((s) => s.steps);
    const mean = (values: number[]): number =>
      values.reduce((a, b) => a + b, 0) / values.length;

    expect(summary.episodes).toBe(3);
    expect(summary.avgLines).toBeCloseTo(mean(lines));
    expect(summary.avgScore).toBeCloseTo(mean(scores));
    expect(summary.avgSteps).toBeCloseTo(mean(steps));
    expect(summary.bestLines).toBe(Math.max(...lines));
    expect(summary.totalMs).toBe(
      stats.reduce((a, s) => a + s.durationMs, 0),
    );
  });
});
