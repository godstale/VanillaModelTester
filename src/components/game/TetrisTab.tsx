import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BoardCanvas } from '@/components/game/BoardCanvas';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import type { EngineState, PieceKind } from '@/lib/tetris/types';
import { cellFor, cellsOf, gravityMsForLevel } from '@/lib/tetris/constants';
import {
  createGame,
  gravityTick,
  hardDrop,
  move,
  rotate,
} from '@/lib/tetris/engine';
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
  const [engine, setEngine] = useState<EngineState>(() =>
    createGame(seedFromTab(tab)),
  );
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const over = engine.status === 'over';
  const active = running && !paused && !over;

  useEffect(() => {
    wrapRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setEngine((prev) =>
        prev.status === 'over' ? prev : gravityTick(prev).state,
      );
    }, gravityMsForLevel(engine.level));
    return () => window.clearInterval(id);
  }, [active, engine.level]);

  const focusBoard = () => {
    wrapRef.current?.focus();
  };

  const handleStart = () => {
    setRunning(true);
    setPaused(false);
    focusBoard();
  };

  const handlePause = () => {
    setPaused(true);
    focusBoard();
  };

  const handleResume = () => {
    setPaused(false);
    focusBoard();
  };

  const handleRestart = () => {
    const fresh = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    setEngine(createGame(fresh));
    setRunning(true);
    setPaused(false);
    focusBoard();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!active) return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setEngine((s) => move(s, -1, 0).state);
        break;
      case 'ArrowRight':
        e.preventDefault();
        setEngine((s) => move(s, 1, 0).state);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setEngine((s) => move(s, 0, 1).state);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setEngine((s) => rotate(s, 1).state);
        break;
      case ' ':
        e.preventDefault();
        setEngine((s) => hardDrop(s).state);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      autoFocus
      data-testid="tetris-key-handler"
      onKeyDown={handleKeyDown}
      onClick={focusBoard}
      className="flex h-full w-full min-h-0 select-none gap-4 overflow-auto bg-editor p-4 outline-none"
    >
      <div className="relative h-fit shrink-0">
        <BoardCanvas board={engine.board} active={engine.active} />
        {over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-md bg-background/80">
            <p className="text-sm font-semibold text-foreground">
              {t('game.gameover')}
            </p>
            <Button type="button" size="sm" onClick={handleRestart}>
              {t('game.playAgain')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex w-40 shrink-0 flex-col gap-3">
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('game.score')}</span>
            <span className="font-mono font-semibold text-foreground">
              {engine.score}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('game.lines')}</span>
            <span className="font-mono font-semibold text-foreground">
              {engine.lines}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('game.level')}</span>
            <span className="font-mono font-semibold text-foreground">
              {engine.level}
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <span className="text-xs text-muted-foreground">{t('game.next')}</span>
          <NextPiece kind={engine.queue[0]} />
        </div>

        <div className="flex flex-col gap-2">
          {!running ? (
            <Button type="button" size="sm" onClick={handleStart}>
              <Play className="h-3.5 w-3.5" />
              {t('game.start')}
            </Button>
          ) : paused ? (
            <Button type="button" size="sm" onClick={handleResume}>
              <Play className="h-3.5 w-3.5" />
              {t('game.resume')}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={handlePause}>
              <Pause className="h-3.5 w-3.5" />
              {t('game.pause')}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!running}
            onClick={handleRestart}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('game.restart')}
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('game.controlsHint')}
        </p>
      </div>
    </div>
  );
}
