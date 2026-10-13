import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Download, Play, RotateCcw, Square } from 'lucide-react';
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
import type {
  EpisodeStats,
  HeadlessSummary,
  StepRecord,
} from '@/lib/sim/types';
import {
  recordEpisode,
  recordSteps,
} from '@/lib/db/repositories/simRepo';
import {
  createLayaHttpAgent,
  DEFAULT_LAYA_URL,
  DEFAULT_OLLAMA_URL,
  DEFAULT_TEV1_MODEL,
} from '@/lib/ai/layaHttpAgent';
import {
  isCanvasRecordingSupported,
  recordingFileName,
  startCanvasRecording,
} from '@/lib/recording/canvasRecorder';
import type { CanvasRecorderHandle } from '@/lib/recording/canvasRecorder';
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

type AutoSpeed = '1x' | '10x' | 'max';

const LAYA_BASE_URL_KEY = 'laya.baseUrl';
const LAYA_MODEL_KEY = 'laya.model';
const LAYA_MIN_CONFIDENCE_KEY = 'laya.minConfidence';
const LAYA_DEFAULT_MAX_STEPS = 300;

function readLayaModel(): string {
  try {
    return localStorage.getItem(LAYA_MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

function readLayaMinConfidence(): string {
  try {
    return localStorage.getItem(LAYA_MIN_CONFIDENCE_KEY) ?? '';
  } catch {
    return '';
  }
}

// Empty means the server-side abstention gate is off. Otherwise the value is
// clamped to [0, 1] and sent as `min_confidence`: answers below it come back
// marked abstained, which stops the episode.
function parseMinConfidence(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, parsed));
}

function endedKey(ended: EpisodeStats['ended']): string {
  if (ended === 'laya-error') return 'game.endedLayaError';
  if (ended === 'maxSteps') return 'game.endedMaxSteps';
  return 'game.gameover';
}

function readLayaBaseUrl(): string {
  try {
    return localStorage.getItem(LAYA_BASE_URL_KEY) ?? DEFAULT_LAYA_URL;
  } catch {
    return DEFAULT_LAYA_URL;
  }
}

const BENCH_EPISODES = 10;
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
  const [maxSteps, setMaxSteps] = useState(LAYA_DEFAULT_MAX_STEPS);
  const [layaBaseUrl, setLayaBaseUrl] = useState(readLayaBaseUrl);
  const [layaModel, setLayaModel] = useState(readLayaModel);
  const [minConfidence, setMinConfidence] = useState(readLayaMinConfidence);
  const simRef = useRef<Simulator | null>(null);
  const runRef = useRef<{ seed: number; steps: StepRecord[] }>({
    seed: 0,
    steps: [],
  });
  const autoStartRef = useRef<number>(0);
  const genRef = useRef<number>(0);
  const busyRef = useRef<boolean>(false);
  const benchCancelRef = useRef<boolean>(false);
  const boardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<CanvasRecorderHandle | null>(null);
  const recordUrlRef = useRef<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [recordName, setRecordName] = useState<string | null>(null);
  const [recordSize, setRecordSize] = useState<number | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const recordSupported =
    typeof window !== 'undefined' && isCanvasRecordingSupported();

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
    emitMonitor({ type: 'ended', reason: stats.endReason });
    // Keep the terminal log beside the persisted episode: the stats card
    // shows the same string, so a screenshot plus this line is enough to
    // report a Tev1 early stop.
    console.info(
      `[tetris] episode ended: ${stats.ended} (${stats.endReason})` +
        ` steps=${stats.steps} pieces=${stats.pieces} lines=${stats.lines}` +
        ` decisions=${stats.decisions} fallbacks=${stats.fallbacks}`,
    );
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
      emitMonitor({ type: 'ended', reason: result.endReason });
      console.info(
        `[tetris] episode ended: ${result.ended} (${result.endReason})` +
          ` steps=${result.steps} pieces=${result.pieces} lines=${result.lines}` +
          ` decisions=${result.decisions} fallbacks=${result.fallbacks}`,
      );
      persistEpisode(result, runRef.current.steps);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, autoRunning]);

  const buildMonitoredAgent = (
    baseUrl: string,
    minConf: number | undefined,
    modelName: string,
  ): DecisionAgent => {
    const isOllama = baseUrl.includes('11434');
    const effectiveModel =
      modelName.trim().length > 0
        ? modelName.trim()
        : isOllama
          ? DEFAULT_TEV1_MODEL
          : undefined;
    const inner = createLayaHttpAgent(baseUrl, {
      serverType: isOllama ? 'ollama' : 'laya',
      model: effectiveModel,
      minConfidence: minConf,
    });
    return {
      name: inner.name,
      decide: async (snap, cands) => {
        emitMonitor({ type: 'request', stepIndex: snap.stepIndex });
        const started = performance.now();
        try {
          const decision = await inner.decide(snap, cands);
          const raw = decision.raw as
            | {
                stateText?: unknown;
                candidatesText?: unknown;
                danger?: unknown;
              }
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
            danger: typeof raw?.danger === 'boolean' ? raw.danger : null,
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
    stepsLimit: number = maxSteps,
    baseUrl: string = layaBaseUrl,
    minConf: number | undefined = parseMinConfidence(minConfidence),
    modelName: string = layaModel,
  ) => {
    genRef.current += 1;
    busyRef.current = false;
    autoStartRef.current = Date.now();
    const collected: StepRecord[] = [];
    const sim = new Simulator(
      buildMonitoredAgent(baseUrl, minConf, modelName),
      seed,
      { maxSteps: stepsLimit },
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

  const handleMaxStepsChange = (value: string) => {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next) || next < 1) return;
    setMaxSteps(next);
    setupAutoSim(freshSeed(), next);
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
    if (value.trim().length > 0) {
      setupAutoSim(freshSeed(), maxSteps, value, parseMinConfidence(minConfidence), layaModel);
      if (autoRunning) {
        autoStartRef.current = Date.now();
        setAutoRunning(true);
      }
    }
  };

  const handleModelChange = (value: string) => {
    setLayaModel(value);
    try {
      localStorage.setItem(LAYA_MODEL_KEY, value);
    } catch {
      // Private-mode storage may throw; the session value still applies.
    }
    setupAutoSim(freshSeed(), maxSteps, layaBaseUrl, parseMinConfidence(minConfidence), value);
    if (autoRunning) {
      autoStartRef.current = Date.now();
      setAutoRunning(true);
    }
  };

  const handleApplyPreset = (presetUrl: string, defaultMod: string) => {
    setLayaBaseUrl(presetUrl);
    setLayaModel(defaultMod);
    try {
      localStorage.setItem(LAYA_BASE_URL_KEY, presetUrl);
      localStorage.setItem(LAYA_MODEL_KEY, defaultMod);
    } catch {
      // Private-mode storage may throw; the session value still applies.
    }
    setupAutoSim(freshSeed(), maxSteps, presetUrl, parseMinConfidence(minConfidence), defaultMod);
    if (autoRunning) {
      autoStartRef.current = Date.now();
      setAutoRunning(true);
    }
  };

  const handleMinConfidenceChange = (value: string) => {
    setMinConfidence(value);
    try {
      localStorage.setItem(LAYA_MIN_CONFIDENCE_KEY, value);
    } catch {
      // Private-mode storage may throw; the session value still applies.
    }
    setupAutoSim(freshSeed(), maxSteps, layaBaseUrl, parseMinConfidence(value), layaModel);
    if (autoRunning) {
      autoStartRef.current = Date.now();
      setAutoRunning(true);
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
      const minConf = parseMinConfidence(minConfidence);
      const isOllama = layaBaseUrl.includes('11434');
      const effectiveModel =
        layaModel.trim().length > 0
          ? layaModel.trim()
          : isOllama
            ? DEFAULT_TEV1_MODEL
            : undefined;
      const { summary } = await runHeadless(
        () =>
          createLayaHttpAgent(layaBaseUrl, {
            serverType: isOllama ? 'ollama' : 'laya',
            model: effectiveModel,
            minConfidence: minConf,
          }),
        {
          episodes: BENCH_EPISODES,
          baseSeed: BENCH_BASE_SEED,
          maxSteps,
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

  // Board-only recording: captureStream on the game canvas, MediaRecorder to
  // webm. The blob URL is offered as a download; Tauri has no binary file
  // writer wired here, so the browser download path is the portable option.
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setRecordElapsed(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(
    () => () => {
      if (recordUrlRef.current !== null) {
        URL.revokeObjectURL(recordUrlRef.current);
        recordUrlRef.current = null;
      }
    },
    [],
  );

  const handleRecordStart = () => {
    setRecordError(null);
    const canvas = boardCanvasRef.current;
    if (canvas === null) return;
    try {
      if (recordUrlRef.current !== null) {
        URL.revokeObjectURL(recordUrlRef.current);
        recordUrlRef.current = null;
      }
      setRecordUrl(null);
      setRecordName(null);
      setRecordSize(null);
      setRecordElapsed(0);
      recorderRef.current = startCanvasRecording(canvas, { fps: 30 });
      setRecording(true);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRecordStop = () => {
    const handle = recorderRef.current;
    if (handle === null) {
      setRecording(false);
      return;
    }
    recorderRef.current = null;
    void handle.stop().then(
      ({ blob }) => {
        setRecording(false);
        const url = URL.createObjectURL(blob);
        recordUrlRef.current = url;
        setRecordUrl(url);
        setRecordName(recordingFileName());
        setRecordSize(blob.size);
      },
      (err: unknown) => {
        setRecording(false);
        setRecordError(err instanceof Error ? err.message : String(err));
      },
    );
  };

  const formatElapsed = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const benchPct =
    benchProgress === null || benchProgress.total === 0
      ? 0
      : Math.round((benchProgress.done / benchProgress.total) * 100);

  return (
    <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden bg-editor p-4">
      <div className="flex min-h-0 shrink-0 flex-col gap-3 overflow-y-auto">
        <div className="relative h-fit shrink-0">
          <BoardCanvas
            board={display.board}
            active={display.active}
            canvasRef={boardCanvasRef}
          />
        </div>

        <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">
              {t('game.record')}
              {recording && (
                <span className="ml-2 font-mono text-[11px] text-destructive">
                  ● {t('game.recording')} {formatElapsed(recordElapsed)}
                </span>
              )}
            </span>
            {!recording ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                disabled={!recordSupported}
                onClick={handleRecordStart}
              >
                <Circle className="h-3 w-3" />
                {t('game.record')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 px-2 text-[11px]"
                onClick={handleRecordStop}
              >
                <Square className="h-3 w-3" />
                {t('game.stopRecord')}
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('game.recordHint')}
          </p>
          {!recordSupported && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('game.recordUnsupported')}
            </p>
          )}
          {recordError !== null && (
            <p className="break-all rounded-md bg-destructive/10 p-2 text-[11px] leading-relaxed text-destructive">
              {recordError}
            </p>
          )}
          {recordUrl !== null && recordName !== null && !recording && (
            <a
              href={recordUrl}
              download={recordName}
              className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3 w-3" />
              {t('game.downloadRecord')}
              {recordSize !== null ? ` (${formatBytes(recordSize)})` : ''}
            </a>
          )}
        </div>
      </div>

      <div className="flex min-h-0 w-44 shrink-0 flex-col gap-3 overflow-y-auto">
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

        <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
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
        </div>

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
            <div className="space-y-1 pt-1">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t(endedKey(autoStats.ended))} · {t('game.episode')}{' '}
                {autoStats.lines} {t('game.lines')}
              </p>
              <p
                className="break-all text-[11px] leading-relaxed text-muted-foreground"
                title={autoStats.endReason}
              >
                {t('game.endReason')}: {autoStats.endReason}
              </p>
            </div>
          )}
        </div>

        <details className="rounded-lg border border-border bg-card p-3">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">
            {t('game.serverSettings')}
          </summary>
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t('game.serverPreset')}</span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={!layaBaseUrl.includes('11434') ? 'default' : 'outline'}
                  className="h-7 flex-1 px-1 text-[11px]"
                  onClick={() => handleApplyPreset(DEFAULT_LAYA_URL, '')}
                >
                  Laya
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={layaBaseUrl.includes('11434') ? 'default' : 'outline'}
                  className="h-7 flex-1 px-1 text-[11px]"
                  onClick={() => handleApplyPreset(DEFAULT_OLLAMA_URL, DEFAULT_TEV1_MODEL)}
                >
                  Ollama Tev1
                </Button>
              </div>
            </div>
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
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t('game.model')}
              <input
                aria-label={t('game.model')}
                type="text"
                value={layaModel}
                onChange={(e) => handleModelChange(e.target.value)}
                placeholder={layaBaseUrl.includes('11434') ? DEFAULT_TEV1_MODEL : 'auto'}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
              />
              <span className="text-[11px] leading-relaxed">
                {t('game.modelHint')}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t('game.minConfidence')}
              <input
                aria-label={t('game.minConfidence')}
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={minConfidence}
                onChange={(e) => handleMinConfidenceChange(e.target.value)}
                placeholder={t('game.minConfidenceOff')}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
              />
              <span className="text-[11px] leading-relaxed">
                {t('game.minConfidenceHint')}
              </span>
            </label>
          </div>
        </details>

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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <LayaStatusPanel
          running={autoRunning}
          baseUrl={layaBaseUrl}
          modelName={layaModel}
          steps={autoCounters.steps}
          decisions={autoCounters.decisions}
          fallbacks={autoCounters.fallbacks}
          avgLatencyMs={autoAvg.latencyMs}
          avgConfidence={autoAvg.confidence}
          monitor={layaMonitor}
        />
      </div>
    </div>
  );
}
