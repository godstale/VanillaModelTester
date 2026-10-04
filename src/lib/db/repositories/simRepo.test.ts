import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemorySqlFallback, setDatabase } from '@/lib/db/client';
import {
  getAgentSummary,
  recordEpisode,
  recordSteps,
} from '@/lib/db/repositories/simRepo';

function episode(
  id: string,
  agent: string,
  lines: number,
  seed: number,
): Parameters<typeof recordEpisode>[0] {
  return {
    id,
    agent,
    seed,
    steps: 10,
    pieces: 10,
    lines,
    score: lines * 100,
    level: 1,
    decisions: 10,
    fallbacks: 0,
    avgConfidence: 0.9,
    avgLatencyMs: 2,
    durationMs: 50,
    ended: 'maxSteps',
  };
}

describe('simRepo (MemorySqlFallback)', () => {
  beforeEach(() => {
    setDatabase(new MemorySqlFallback());
  });

  afterEach(() => {
    setDatabase(null);
  });

  it('returns zeros for an unknown agent', async () => {
    await expect(getAgentSummary('heuristic')).resolves.toEqual({
      episodes: 0,
      avgLines: 0,
      bestLines: 0,
    });
  });

  it('round-trips episodes and steps into an agent summary', async () => {
    await recordEpisode(episode('ep-1', 'heuristic', 4, 1));
    await recordSteps('ep-1', [
      {
        stepIndex: 0,
        stateText: 'state-0',
        candidatesText: 'cands-0',
        chosen: 'A',
        confidence: 0.9,
        latencyMs: 2,
      },
      {
        stepIndex: 1,
        stateText: 'state-1',
        candidatesText: 'cands-1',
        chosen: 'B',
        confidence: 0.7,
        latencyMs: 3,
      },
    ]);
    await recordEpisode(episode('ep-2', 'heuristic', 8, 2));
    await recordSteps('ep-2', []);

    await expect(getAgentSummary('heuristic')).resolves.toEqual({
      episodes: 2,
      avgLines: 6,
      bestLines: 8,
    });
    await expect(getAgentSummary('mock')).resolves.toEqual({
      episodes: 0,
      avgLines: 0,
      bestLines: 0,
    });
  });
});
