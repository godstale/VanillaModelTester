import { Simulator } from './simulator';
import type { DecisionAgent } from '../ai/types';
import type { EpisodeStats, HeadlessSummary } from './types';

export interface HeadlessOptions {
  episodes: number;
  baseSeed: number;
  maxSteps: number;
}

export interface HeadlessResult {
  stats: EpisodeStats[];
  summary: HeadlessSummary;
}

export async function runHeadless(
  makeAgent: (seed: number) => DecisionAgent,
  opts: HeadlessOptions,
): Promise<HeadlessResult> {
  const stats: EpisodeStats[] = [];
  for (let i = 0; i < opts.episodes; i += 1) {
    const seed = (opts.baseSeed + i) >>> 0;
    const sim = new Simulator(makeAgent(seed), seed, {
      maxSteps: opts.maxSteps,
    });
    stats.push(await sim.run());
  }

  let linesSum = 0;
  let scoreSum = 0;
  let stepsSum = 0;
  let bestLines = 0;
  let totalMs = 0;
  for (const item of stats) {
    linesSum += item.lines;
    scoreSum += item.score;
    stepsSum += item.steps;
    bestLines = Math.max(bestLines, item.lines);
    totalMs += item.durationMs;
  }
  const count = stats.length;
  const summary: HeadlessSummary = {
    agent: stats[0]?.agent ?? '',
    episodes: count,
    avgLines: count === 0 ? 0 : linesSum / count,
    avgScore: count === 0 ? 0 : scoreSum / count,
    avgSteps: count === 0 ? 0 : stepsSum / count,
    bestLines,
    totalMs,
  };
  return { stats, summary };
}
