import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BoardCanvas } from '@/components/game/BoardCanvas';
import { LayaStatusPanel } from '@/components/game/LayaStatusPanel';
import {
  initialLayaMonitor,
  reduceLayaMonitor,
} from '@/components/game/layaMonitor';
import type { LayaMonitorEvent } from '@/components/game/layaMonitor';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import type { EngineState, PieceKind } from '@/lib/tetris/types';
import { cellFor, cellsOf, gravityMsForLevel } from '@/lib/tetris/constants';
import { createGame } from '@/lib/tetris/engine';
import { Simulator } from '@/lib/sim/simulator';
import { runHeadless } from '@/lib/sim/headless';
import { DEFAULT_SIM_CONFIG } from '@/lib/sim/types';
import type {
  EpisodeStats,
  HeadlessSummary,
  StepRecord,
} from '@/lib/sim/types';
import {
  recordEpisode,
  recordSteps,
} from '@/lib/db/repositories/simRepo';
import { createHeuristicAgent } from '@/lib/ai/heuristicAgent';
import { createMockAgent } from '@/lib/ai/mockAgent';
import {
  createLayaHttpAgent,
  DEFAULT_LAYA_URL,
} from '@/lib/ai/layaHttpAgent';
import type { DecisionAgent } from '@/lib/ai/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export interface TetrisTabProps {
  tab: WorkspaceTab;
}

// tab.meta.sessionId is a decimal string; the engine RNG needs a uint32 seed.
function seedFromTab(tab: WorkspaceTab): number {
  const raw = tab.meta?.sessionId;
  const text = typeof raw === 'string' && raw.length > 0 ? raw : tab.id;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

type AgentKind = 'mock' | 'heuristic' | 'laya';
type AutoSpeed = '1x' | '10x' | 'max';

// Agent pickers for auto mode and the benchmark runner.
function makeLocalAgent(
  kind: AgentKind,
  seed: number,
  layaBaseUrl: string,
): DecisionAgent {
  if (kind === 'heuristic') return createHeuristicAgent();
  if (kind === 'laya') return createLayaHttpAgent(layaBaseUrl);
  return createMockAgent(seed);
}

const LAYA_BASE_URL_KEY = 'laya.baseUrl';
const LAYA_DEFAULT_MAX_STEPS = 300;

function defaultMaxStepsFor(kind: AgentKind): number {
  return kind === 'laya' ? LAYA_DEFAULT_MAX_STEPS : DEFAULT_SIM_CONFIG.maxSteps;
}

function readLayaBaseUrl(): string {
  try {
    return localStorage.getItem(LAYA_BASE_URL_KEY) ?? DEFAULT_LAYA_URL;
  } catch {
    return DEFAULT_LAYA_URL;
  }
}

const BENCH_EPISODES = 100;
const BENCH_BASE_SEED = 20261004;

// Same canvas-hex-palette rationale as BoardCanvas: raw colors for game
// blocks, semantic tokens for all DOM chrome.
const BLOCK_COLORS: readonly string[] = [
  '#000000',
  '#22d3ee',
  '#facc15',
  '#c084fc',
  '#4ade80',
  '#f87171',
  '#60a5fa',
  '#fb923c',
];

function NextPiece({ kind }: { kind: PieceKind | undefined }) {
  const filled =
    kind === undefined
      ? new Set<string>()
      : new Set(cellsOf(kind, 0).map(([x, y]) => `${x},${y}`));
  return (
    <div
      className="grid w-fit"
      style={{ gridTemplateColumns: 'repeat(4, 12px)' }}
      aria-hidden="true"
    >
      {Array.from({ length: 16 }, (_, i) => {
        const x = i % 4;
        const y = Math.floor(i / 4);
        const on = filled.has(`${x},${y}`);
        return (
          <div
            key={i}
            className={
              on ? 'h-3 w-3 rounded-[2px]' : 'h-3 w-3 rounded-[2px] bg-muted/40'
            }
            style={
              on && kind !== undefined
                ? { backgroundColor: BLOCK_COLORS[cellFor(kind)] }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

export function TetrisTab({ tab }: TetrisTabProps) {
  const { t } = useLanguage();
  const [agentKind, setAgentKind] = useState<AgentKind>('mock');
  const [speed, setSpeed] = useState<AutoSpeed>('1x');
  const [autoBoard, setAutoBoard] = useState<EngineState>(() =>
    createGame(seedFromTab(tab)),
  );
  const [autoStats, setAutoStats] = useState<EpisodeStats | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoAvg, setAutoAvg] = useState<{
    latencyMs: number | null;
    confidence: number | null;
  }>({ latencyMs: null, confidence: null });
  const [layaMonitor, setLayaMonitor] = useState(initialLayaMonitor);
  const [autoCounters, setAutoCounters] = useState({
    steps: 0,
    decisions: 0,
    fallbacks: 0,
  });
  const [bench, setBench] = useState<HeadlessSummary | null>(null);
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchProgress, setBenchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [maxSteps, setMaxSteps] = useState(DEFAULT_SIM_CONFIG.maxSteps);
  const [layaBaseUrl, setLayaBaseUrl] = useState(readLayaBaseUrl);
  const simRef = useRef<Simulator | null>(null);
  const runRef = useRef<{ seed: number; steps: StepRecord[] }>({
    seed: 0,
    steps: [],
  });
  const autoStartRef = useRef<number>(0);
  const genRef = useRef<number>(0);
  const busyRef = useRef<boolean>(false);
  const benchCancelRef = useRef<boolean>(false);

  const display = autoBoard;

  const emitMonitor = useCallback((event: LayaMonitorEvent) => {
    setLayaMonitor((prev) => reduceLayaMonitor(prev, event));
  }, []);

  // Mirrors simulator state into render state; effects drive it, render reads it.
  const syncAutoView = (sim: Simulator) => {
    setAutoBoard(sim.state);
    setAutoCounters({
      steps: sim.steps,
      decisions: sim.decisionCount,
      fallbacks: sim.fallbackCount,
    });
    try {
      const live = sim.stats(0);
      setAutoAvg({
        latencyMs: live.decisions === 0 ? null : live.avgLatencyMs,
        confidence: live.decisions === 0 ? null : live.avgConfidence,
      });
    } catch {
      // Stats must never break the render path.
    }
  };

  // Finished episodes are persisted for offline analysis; a storage
  // failure must never break the game flow.
  const persistEpisode = (stats: EpisodeStats, steps: StepRecord[]) => {
    const episodeId = crypto.randomUUID();
    void (async () => {
      try {
        await recordEpisode({ ...stats, id: episodeId });
        await recordSteps(episodeId, steps);
      } catch (err) {
        console.warn('Failed to persist sim episode:', err);
      }
    })();
  };

  const finishAutoEpisode = (sim: Simulator) => {
    const stats = sim.stats(Date.now() - autoStartRef.current);
    setAutoStats(stats);
    setAutoRunning(false);
    emitMonitor({ type: 'ended' });
    persistEpisode(stats, runRef.current.steps);
  };

  // 1x/10x auto stepping: one stepOnce per tick, re-rendered each step.
  // Gated by autoRunning so the tab never starts by itself.
  useEffect(() => {
    if (speed === 'max' || !autoRunning) return;
    let cancelled = false;
    let timer = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        void tick();
      }, delay);
    };
    const tick = async () => {
      const sim = simRef.current;
      if (cancelled || sim === null) return;
      if (busyRef.current) {
        schedule(16);
        return;
      }
      busyRef.current = true;
      try {
        const result = await sim.stepOnce();
        if (cancelled) return;
        syncAutoView(sim);
        if (result === 'ended') {
          finishAutoEpisode(sim);
          return;
        }
      } finally {
        busyRef.current = false;
      }
      if (cancelled) return;
      const mult = speed === '10x' ? 10 : 1;
      schedule(
        Math.max(16, gravityMsForLevel(sim.state.level) / mult),
      );
    };
    const first = simRef.current;
    schedule(
      first === null
        ? 16
        : Math.max(16, gravityMsForLevel(first.state.level)),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, autoRunning]);

  // max auto speed: no interval, one run() then a single render.
  useEffect(() => {
    if (speed !== 'max' || !autoRunning) return;
    const sim = simRef.current;
    if (sim === null) return;
    const gen = genRef.current;
    let cancelled = false;
    void sim.run().then((result) => {
      if (cancelled || genRef.current !== gen) return;
      syncAutoView(sim);
      setAutoStats(result);
      setAutoRunning(false);
      emitMonitor({ type: 'ended' });
      persistEpisode(result, runRef.current.steps);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, autoRunning]);

  const buildMonitoredAgent = (
    kind: AgentKind,
    seed: number,
    baseUrl: string,
  ): DecisionAgent => {
    const inner = makeLocalAgent(kind, seed, baseUrl);
    return {
      name: inner.name,
      decide: async (snap, cands) => {
        emitMonitor({ type: 'request', stepIndex: snap.stepIndex });
        const started = performance.now();
        try {
          const decision = await inner.decide(snap, cands);
          const raw = decision.raw as
            | { stateText?: unknown; candidatesText?: unknown }
            | undefined;
          emitMonitor({
            type: 'success',
            stepIndex: snap.stepIndex,
            stateText:
              typeof raw?.stateText === 'string' ? raw.stateText : '',
            candidatesText:
              typeof raw?.candidatesText === 'string'
                ? raw.candidatesText
                : '',
            choice: decision.moveId,
            confidence: decision.confidence,
            latencyMs: decision.latencyMs ?? performance.now() - started,
          });
          return decision;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emitMonitor({
            type: 'error',
            stepIndex: snap.stepIndex,
            message,
            latencyMs: performance.now() - started,
          });
          throw err;
        }
      },
    };
  };

  const setupAutoSim = (
    seed: number,
    agent: AgentKind = agentKind,
    stepsLimit: number = maxSteps,
    baseUrl: string = layaBaseUrl,
  ) => {
    genRef.current += 1;
    busyRef.current = false;
    autoStartRef.current = Date.now();
    const collected: StepRecord[] = [];
    const sim = new Simulator(
      buildMonitoredAgent(agent, seed, baseUrl),
      seed,
      { maxSteps: stepsLimit },
      undefined,
      undefined,
      {
        onStep: (rec) => {
          collected.push(rec);
        },
      },
    );
    simRef.current = sim;
    runRef.current = { seed, steps: collected };
    setAutoStats(null);
    setAutoAvg({ latencyMs: null, confidence: null });
    emitMonitor({ type: 'reset' });
    syncAutoView(sim);
  };

  const handleAgentChange = (next: AgentKind) => {
    setAgentKind(next);
    const switched =
      maxSteps === defaultMaxStepsFor(agentKind)
        ? defaultMaxStepsFor(next)
        : maxSteps;
    setMaxSteps(switched);
    // Rebuild the idle preview; keep running only if already running.
    setupAutoSim(freshSeed(), next, switched);
    if (autoRunning) {
      autoStartRef.current = Date.now();
      setAutoRunning(true);
    }
  };

  const handleMaxStepsChange = (value: string) => {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next) || next < 1) return;
    setMaxSteps(next);
    setupAutoSim(freshSeed(), agentKind, next);
    if (autoRunning) {
      autoStartRef.current = Date.now();
      setAutoRunning(true);
    }
  };

  const handleLayaUrlChange = (value: string) => {
    setLayaBaseUrl(value);
    try {
      localStorage.setItem(LAYA_BASE_URL_KEY, value);
    } catch {
      // Private-mode storage may throw; the session value still applies.
    }
    if (agentKind === 'laya') {
      setupAutoSim(freshSeed(), agentKind, maxSteps, value);
      if (autoRunning) {
        autoStartRef.current = Date.now();
        setAutoRunning(true);
      }
    }
  };

  const handleSpeedChange = (next: AutoSpeed) => {
    if (next === speed) return;
    const involvesMax = next === 'max' || speed === 'max';
    setSpeed(next);
    // The max runner cannot be cancelled mid-flight, so transitions
    // involving max restart on a fresh simulator instead of sharing one.
    if (involvesMax) {
      setupAutoSim(freshSeed());
      if (autoRunning) {
        autoStartRef.current = Date.now();
        setAutoRunning(true);
      }
    }
  };

  const handleBenchmark = async () => {
    if (benchRunning) return;
    benchCancelRef.current = false;
    setBenchRunning(true);
    setBench(null);
    setBenchProgress({ done: 0, total: BENCH_EPISODES });
    try {
      const { summary } = await runHeadless(
        () => makeLocalAgent('heuristic', 0, layaBaseUrl),
        {
          episodes: BENCH_EPISODES,
          baseSeed: BENCH_BASE_SEED,
          maxSteps: DEFAULT_SIM_CONFIG.maxSteps,
          onEpisode: (done, total) => {
            setBenchProgress({ done, total });
          },
          shouldCancel: () => benchCancelRef.current,
        },
      );
      if (!benchCancelRef.current) {
        setBench(summary);
      }
    } finally {
      setBenchRunning(false);
      setBenchProgress(null);
    }
  };

  const handleBenchmarkCancel = () => {
    benchCancelRef.current = true;
  };

  const handleAutoStart = () => {
    setupAutoSim(freshSeed());
    autoStartRef.current = Date.now();
    setAutoRunning(true);
  };

  const handleAutoStop = () => {
    genRef.current += 1;
    busyRef.current = false;
    setAutoRunning(false);
  };

  const handleAutoRestart = () => {
    setupAutoSim(freshSeed());
    autoStartRef.current = Date.now();
    setAutoRunning(true);
  };

  const benchPct =
    benchProgress === null || benchProgress.total === 0
      ? 0
      : Math.round((benchProgress.done / benchProgress.total) * 100);

  return (
    <div className="flex h-full w-full min-h-0 gap-4 overflow-auto bg-editor p-4">
      <div className="relative h-fit shrink-0">
        <BoardCanvas board={display.board} active={display.active} />
      </div>

      <div className="flex w-40 shrink-0 flex-col gap-3">
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('game.score')}</span>
            <span className="font-mono font-semibold text-foreground">
              {display.score}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('game.lines')}</span>
            <span className="font-mono font-semibold text-foreground">
              {display.lines}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('game.level')}</span>
            <span className="font-mono font-semibold text-foreground">
              {display.level}
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <span className="text-xs text-muted-foreground">{t('game.next')}</span>
          <NextPiece kind={display.queue[0]} />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('game.agent')}
            <select
              aria-label={t('game.agent')}
              value={agentKind}
              onChange={(e) =>
                handleAgentChange(e.target.value as AgentKind)
              }
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              <option value="mock">{t('game.mockAgent')}</option>
              <option value="heuristic">{t('game.heuristicAgent')}</option>
              <option value="laya">{t('game.laya')}</option>
            </select>
          </label>
          {agentKind === 'laya' && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t('game.layaUrl')}
              <input
                aria-label={t('game.layaUrl')}
                type="url"
                value={layaBaseUrl}
                onChange={(e) => handleLayaUrlChange(e.target.value)}
                placeholder={DEFAULT_LAYA_URL}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
              />
              <span className="text-[11px] leading-relaxed">
                {t('game.layaHint')}
              </span>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('game.speed')}
            <select
              aria-label={t('game.speed')}
              value={speed}
              onChange={(e) =>
                handleSpeedChange(e.target.value as AutoSpeed)
              }
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              <option value="1x">1x</option>
              <option value="10x">10x</option>
              <option value="max">max</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('game.maxSteps')}
            <input
              aria-label={t('game.maxSteps')}
              type="number"
              min={1}
              value={maxSteps}
              onChange={(e) => handleMaxStepsChange(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            />
          </label>
          <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t('game.steps')}
              </span>
              <span className="font-mono font-semibold text-foreground">
                {autoCounters.steps}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t('game.pieces')}
              </span>
              <span className="font-mono font-semibold text-foreground">
                {autoBoard?.pieces ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t('game.decisions')}
              </span>
              <span className="font-mono font-semibold text-foreground">
                {autoCounters.decisions}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t('game.fallbacks')}
              </span>
              <span className="font-mono font-semibold text-foreground">
                {autoCounters.fallbacks}
              </span>
            </div>
            {autoStats !== null && (
              <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                {t('game.gameover')} · {t('game.episode')} {autoStats.ended}
              </p>
            )}
          </div>
          {!autoRunning ? (
            <Button type="button" size="sm" onClick={handleAutoStart}>
              <Play className="h-3.5 w-3.5" />
              {t('game.start')}
            </Button>
          ) : (
            <>
              <Button type="button" size="sm" onClick={handleAutoStop}>
                <Square className="h-3.5 w-3.5" />
                {t('game.stop')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAutoRestart}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('game.restart')}
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!benchRunning ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleBenchmark()}
            >
              {t('game.runBenchmark')}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleBenchmarkCancel}
            >
              <Square className="h-3.5 w-3.5" />
              {t('game.benchmarkCancel')}
            </Button>
          )}
          {benchProgress !== null && (
            <div className="space-y-1">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={benchProgress.total}
                aria-valuenow={benchProgress.done}
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${benchPct}%` }}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t('game.benchmarkProgress', {
                  done: benchProgress.done,
                  total: benchProgress.total,
                })}
              </p>
            </div>
          )}
          {bench !== null && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('game.benchmark')}: {bench.avgLines.toFixed(1)} /{' '}
              {bench.bestLines} {t('game.lines')}
            </p>
          )}
        </div>
      </div>

      <LayaStatusPanel
        agentKind={agentKind}
        running={autoRunning}
        baseUrl={layaBaseUrl}
        steps={autoCounters.steps}
        decisions={autoCounters.decisions}
        fallbacks={autoCounters.fallbacks}
        avgLatencyMs={autoAvg.latencyMs}
        avgConfidence={autoAvg.confidence}
        monitor={layaMonitor}
      />
    </div>
  );
}
