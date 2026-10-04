export interface SimConfig {
  /** Hard stop per episode; episode ends with 'maxSteps'. */
  maxSteps: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  maxSteps: 5000,
};

export type EpisodeEnd = 'gameover' | 'maxSteps';

export interface EpisodeStats {
  agent: string;
  seed: number;
  steps: number;
  pieces: number;
  lines: number;
  score: number;
  level: number;
  decisions: number;
  fallbacks: number;
  avgConfidence: number;
  avgLatencyMs: number;
  durationMs: number;
  ended: EpisodeEnd;
}

export interface HeadlessSummary {
  agent: string;
  episodes: number;
  avgLines: number;
  avgScore: number;
  avgSteps: number;
  bestLines: number;
  totalMs: number;
}
