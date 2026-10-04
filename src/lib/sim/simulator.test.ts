import { describe, expect, it } from 'vitest';
import type { ActivePiece, Board } from '../tetris/types';
import type {
  BoardSnapshot,
  CandidateMove,
  DecisionAgent,
  MoveDecision,
} from '../ai/types';
import { Simulator, type CandidateEnumerator } from './simulator';
import type { EpisodeStats } from './types';

// Single stay-in-place option so the decide/placement path is exercised.
const singleStay: CandidateEnumerator = (
  _board: Board,
  active: ActivePiece,
): CandidateMove[] => [
  {
    id: 'stay',
    rot: active.rot,
    x: active.x,
    features: {
      rot: active.rot,
      x: active.x,
      landingY: active.y,
      linesCleared: 0,
      holes: 0,
      aggregateHeight: 0,
      bumpiness: 0,
      maxHeight: 0,
    },
    actions: [],
  },
];

function mockAgent(name = 'mock'): DecisionAgent {
  return {
    name,
    decide: async (
      _snap: BoardSnapshot,
      cands: CandidateMove[],
    ): Promise<MoveDecision> => ({
      moveId: cands[0]?.id ?? '',
      confidence: 0.8,
      abstained: false,
      latencyMs: 5,
    }),
  };
}

function throwingAgent(): DecisionAgent {
  return {
    name: 'thrower',
    decide: async (): Promise<MoveDecision> => {
      throw new Error('boom');
    },
  };
}

function withoutTiming(stats: EpisodeStats): EpisodeStats {
  // durationMs is wall-clock measured; neutralize it for the comparison.
  return { ...stats, durationMs: 0 };
}

describe('Simulator', () => {
  it('completes a short episode ending with maxSteps', async () => {
    const sim = new Simulator(mockAgent(), 123, { maxSteps: 5 }, singleStay);
    const stats = await sim.run();
    expect(stats.steps).toBe(5);
    expect(stats.decisions).toBe(5);
    expect(stats.fallbacks).toBe(0);
    expect(stats.ended).toBe('maxSteps');
    expect(stats.avgConfidence).toBeCloseTo(0.8);
    expect(stats.avgLatencyMs).toBeCloseTo(5);
  });

  it('produces identical stats for the same seed', async () => {
    const first = await new Simulator(mockAgent(), 777, { maxSteps: 8 }, singleStay).run();
    const second = await new Simulator(mockAgent(), 777, { maxSteps: 8 }, singleStay).run();
    expect(withoutTiming(first)).toEqual(withoutTiming(second));
  });

  it('stops the episode when the agent throws instead of rescuing', async () => {
    const sim = new Simulator(throwingAgent(), 42, { maxSteps: 3 }, singleStay);
    const stats = await sim.run();
    expect(stats.steps).toBe(0);
    expect(stats.fallbacks).toBe(1);
    expect(stats.decisions).toBe(0);
    expect(stats.ended).toBe('laya-error');
  });

  it('returns ended when the game is already over', async () => {
    const sim = new Simulator(mockAgent(), 9, { maxSteps: 10 }, singleStay);
    sim.state = { ...sim.state, status: 'over', active: null };
    await expect(sim.stepOnce()).resolves.toBe('ended');
  });

  it('advances with gravity ticks when no candidates are available', async () => {
    const none: CandidateEnumerator = () => [];
    const sim = new Simulator(mockAgent(), 55, { maxSteps: 4 }, none);
    const stats = await sim.run();
    expect(stats.steps).toBe(4);
    expect(stats.decisions).toBe(0);
    expect(stats.ended).toBe('maxSteps');
  });

  it('drives placements through the default candidate enumeration', async () => {
    const sim = new Simulator(mockAgent(), 55, { maxSteps: 4 });
    const stats = await sim.run();
    expect(stats.steps).toBe(4);
    expect(stats.decisions).toBe(4);
    expect(stats.ended).toBe('maxSteps');
  });
});
