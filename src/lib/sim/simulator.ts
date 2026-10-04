import {
  createGame,
  gravityTick,
  hardDrop,
  move,
  rotate,
} from '../tetris/engine';
import type { ActivePiece, Board, EngineState } from '../tetris/types';
import { enumerateCandidates } from '../ai/candidates';
import type {
  BoardSnapshot,
  CandidateMove,
  DecisionAgent,
  MoveDecision,
} from '../ai/types';
import {
  DEFAULT_SIM_CONFIG,
  type EpisodeStats,
  type SimConfig,
  type SimSink,
  type StepRecord,
} from './types';

/** Candidate enumeration seam: (board, active) -> legal landing options. */
export type CandidateEnumerator = (
  board: Board,
  active: ActivePiece,
) => CandidateMove[];

// The agent owns its own HTTP timeout (layaHttpAgent defaults to 10s), so the
// simulator-level race only guards against agents that never settle.
const DECIDE_TIMEOUT_MS = 15000;

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

interface PlacedDecision {
  decision: MoveDecision;
  target: CandidateMove;
}

function rawTexts(decision: MoveDecision): {
  stateText: string;
  candidatesText: string;
} {
  const holder = decision as unknown as { raw?: unknown };
  if (typeof holder.raw !== 'object' || holder.raw === null) {
    return { stateText: '', candidatesText: '' };
  }
  const raw = holder.raw as Record<string, unknown>;
  return {
    stateText: typeof raw.stateText === 'string' ? raw.stateText : '',
    candidatesText:
      typeof raw.candidatesText === 'string' ? raw.candidatesText : '',
  };
}

export class Simulator {
  state: EngineState;

  private agent: DecisionAgent;
  private seed: number;
  private config: SimConfig;
  private enumerate: CandidateEnumerator;
  private sink?: SimSink;
  private stepIndex = 0;
  private decisions = 0;
  private fallbacks = 0;
  private layaFailed = false;
  private confidenceSum = 0;
  private latencySumMs = 0;

  constructor(
    agent: DecisionAgent,
    seed: number,
    config: SimConfig = DEFAULT_SIM_CONFIG,
    enumerate: CandidateEnumerator = enumerateCandidates,
    sink?: SimSink,
  ) {
    this.agent = agent;
    this.seed = seed;
    this.config = config;
    this.enumerate = enumerate;
    this.sink = sink;
    this.state = createGame(seed);
  }

  get steps(): number {
    return this.stepIndex;
  }

  get decisionCount(): number {
    return this.decisions;
  }

  get fallbackCount(): number {
    return this.fallbacks;
  }

  snapshot(): BoardSnapshot {
    const current = this.state;
    return {
      board: current.board,
      active: current.active,
      queue: current.queue,
      score: current.score,
      lines: current.lines,
      level: current.level,
      stepIndex: this.stepIndex,
    };
  }

  async stepOnce(): Promise<'progress' | 'ended'> {
    if (
      this.state.status === 'over' ||
      this.stepIndex >= this.config.maxSteps
    ) {
      return 'ended';
    }
    const active = this.state.active;
    const candidates =
      active === null ? [] : this.enumerate(this.state.board, active);
    if (active === null || candidates.length === 0) {
      this.state = gravityTick(this.state).state;
      this.stepIndex += 1;
      return 'progress';
    }
    const snap = this.snapshot();
    // A forced move needs no judgment: calling the model could only add
    // latency and a chance to pick the single legal option wrongly.
    if (candidates.length === 1) {
      const only = candidates[0];
      if (only !== undefined && this.applyPlacement(only)) {
        this.recordDecision({
          decision: {
            moveId: only.id,
            confidence: 1,
            abstained: false,
            latencyMs: 0,
          },
          target: only,
        });
        this.stepIndex += 1;
        return 'progress';
      }
      this.fallbacks += 1;
      this.layaFailed = true;
      return 'ended';
    }
    const placed = await this.askAgent(this.agent, snap, candidates);
    if (placed !== null && this.applyPlacement(placed.target)) {
      this.recordDecision(placed);
      this.stepIndex += 1;
      return 'progress';
    }
    // Laya-only: a throw, timeout, or abstention ends the episode instead of
    // being rescued. This app tests the model, so a silent rescue would hide
    // model failures.
    this.fallbacks += 1;
    this.layaFailed = true;
    return 'ended';
  }

  async run(): Promise<EpisodeStats> {
    const started = Date.now();
    while ((await this.stepOnce()) === 'progress') {
      // Advance one decision tick per iteration until game over or maxSteps.
    }
    return this.stats(Date.now() - started);
  }

  stats(durationMs: number): EpisodeStats {
    const current = this.state;
    return {
      agent: this.agent.name,
      seed: this.seed,
      steps: this.stepIndex,
      pieces: current.pieces,
      lines: current.lines,
      score: current.score,
      level: current.level,
      decisions: this.decisions,
      fallbacks: this.fallbacks,
      avgConfidence:
        this.decisions === 0 ? 0 : this.confidenceSum / this.decisions,
      avgLatencyMs:
        this.decisions === 0 ? 0 : this.latencySumMs / this.decisions,
      durationMs,
      ended: this.layaFailed
        ? 'laya-error'
        : current.status === 'over'
          ? 'gameover'
          : 'maxSteps',
    };
  }

  reset(seed?: number): void {
    if (seed !== undefined) {
      this.seed = seed;
    }
    this.state = createGame(this.seed);
    this.stepIndex = 0;
    this.decisions = 0;
    this.fallbacks = 0;
    this.layaFailed = false;
    this.confidenceSum = 0;
    this.latencySumMs = 0;
  }

  private recordDecision(placed: PlacedDecision): void {
    this.decisions += 1;
    this.confidenceSum += finiteOrZero(placed.decision.confidence);
    this.latencySumMs += finiteOrZero(placed.decision.latencyMs);
    if (this.sink !== undefined) {
      const { stateText, candidatesText } = rawTexts(placed.decision);
      const rec: StepRecord = {
        stepIndex: this.stepIndex,
        stateText,
        candidatesText,
        chosen: placed.decision.moveId,
        confidence: finiteOrZero(placed.decision.confidence),
        latencyMs: finiteOrZero(placed.decision.latencyMs),
      };
      this.sink.onStep(rec);
    }
  }

  private async askAgent(
    agent: DecisionAgent,
    snap: BoardSnapshot,
    candidates: CandidateMove[],
  ): Promise<PlacedDecision | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const pending = agent.decide(snap, candidates);
      pending.catch(() => {
        // The timeout may win the race; ignore the late settlement.
      });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('decide timeout')),
          DECIDE_TIMEOUT_MS,
        );
      });
      const decision = await Promise.race([pending, timeout]);
      if (decision.abstained) {
        return null;
      }
      const target = candidates.find((c) => c.id === decision.moveId);
      if (target === undefined) {
        return null;
      }
      return { decision, target };
    } catch {
      return null;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private applyPlacement(target: CandidateMove): boolean {
    let current = this.state;
    for (const action of target.actions) {
      if (current.active === null) {
        return false;
      }
      if (action.type === 'drop') {
        break;
      } else if (action.type === 'left') {
        const next = move(current, -1, 0);
        if (!next.moved) {
          return false;
        }
        current = next.state;
      } else if (action.type === 'right') {
        const next = move(current, 1, 0);
        if (!next.moved) {
          return false;
        }
        current = next.state;
      } else if (action.type === 'down') {
        const next = move(current, 0, 1);
        if (!next.moved) {
          return false;
        }
        current = next.state;
      } else {
        const next = rotate(current, action.dir);
        if (!next.rotated) {
          return false;
        }
        current = next.state;
      }
    }
    // The BFS path guarantees this, but never lock a pose the model did not
    // choose: a mismatch means the log would lie about the executed landing.
    const placed = current.active;
    if (
      placed === null ||
      placed.x !== target.x ||
      placed.y !== target.features.landingY ||
      placed.rot !== target.rot
    ) {
      return false;
    }
    this.state = hardDrop(current).state;
    return true;
  }
}
