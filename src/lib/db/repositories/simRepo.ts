import { getDatabase } from '@/lib/db/client';
import type { EpisodeStats, StepRecord } from '@/lib/sim/types';

export interface SimEpisodeRow {
  id: string;
  agent: string;
  seed: number;
  steps: number;
  lines: number;
  score: number;
  pieces: number;
  decisions: number;
  fallbacks: number;
  avg_confidence: number | null;
  avg_latency_ms: number | null;
  duration_ms: number | null;
  ended_at: string | null;
}

export interface AgentSummary {
  episodes: number;
  avgLines: number;
  bestLines: number;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function recordEpisode(
  ep: EpisodeStats & { id: string },
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO sim_episodes (
      id, agent, seed, steps, lines, score, pieces, decisions, fallbacks,
      avg_confidence, avg_latency_ms, duration_ms, ended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ep.id,
      ep.agent,
      ep.seed,
      ep.steps,
      ep.lines,
      ep.score,
      ep.pieces,
      ep.decisions,
      ep.fallbacks,
      ep.avgConfidence,
      ep.avgLatencyMs,
      ep.durationMs,
      new Date().toISOString(),
    ],
  );
}

export async function recordSteps(
  episodeId: string,
  recs: StepRecord[],
): Promise<void> {
  const db = await getDatabase();
  for (const rec of recs) {
    await db.execute(
      `INSERT INTO sim_steps (
        episode_id, step_index, state_text, candidates_text,
        chosen, confidence, latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        episodeId,
        rec.stepIndex,
        rec.stateText,
        rec.candidatesText,
        rec.chosen,
        rec.confidence,
        rec.latencyMs,
      ],
    );
  }
}

export async function getAgentSummary(agent: string): Promise<AgentSummary> {
  const db = await getDatabase();
  const rows = await db.select<SimEpisodeRow[]>(
    `SELECT * FROM sim_episodes WHERE agent = ?`,
    [agent],
  );
  if (rows.length === 0) {
    return { episodes: 0, avgLines: 0, bestLines: 0 };
  }
  let linesSum = 0;
  let bestLines = 0;
  for (const row of rows) {
    const lines = num(row.lines);
    linesSum += lines;
    bestLines = Math.max(bestLines, lines);
  }
  return {
    episodes: rows.length,
    avgLines: linesSum / rows.length,
    bestLines,
  };
}
