import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RefreshCw, Square, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  fetchHealth,
  isTauriRuntime,
  layaLogs,
  layaStart,
  layaStatus,
  layaStop,
  type LayaServiceStatus,
} from '@/lib/laya/serviceClient';

export interface LayaServiceTabProps {
  tab: WorkspaceTab;
}

const LAYA_BASE_URL_KEY = 'laya.baseUrl';
const LAYA_PORT_KEY = 'laya.port';
const DEFAULT_PORT = 8000;

function readStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private-mode storage may throw; the session value still applies.
  }
}

function formatUptime(secs: number | null): string {
  if (secs === null) return '-';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className="truncate font-mono font-semibold text-foreground"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function LayaServiceTab({ tab }: LayaServiceTabProps) {
  void tab;
  const { t } = useLanguage();
  const [baseUrl, setBaseUrl] = useState(() =>
    readStored(LAYA_BASE_URL_KEY, 'http://127.0.0.1:8000'),
  );
  const [port, setPort] = useState(() =>
    readStored(LAYA_PORT_KEY, String(DEFAULT_PORT)),
  );
  const [status, setStatus] = useState<LayaServiceStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logBoxRef = useRef<HTMLPreElement>(null);

  const refreshStatus = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const next = await layaStatus();
      setStatus(next);
      setStatusError(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshLogs = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      setLogs(await layaLogs(200));
    } catch {
      // Logs are best-effort; status errors are reported separately.
    }
  }, []);

  const syncAll = useCallback(async () => {
    await refreshStatus();
    await refreshLogs();
  }, [refreshStatus, refreshLogs]);

  useEffect(() => {
    // Deferred so the effect body only subscribes, never sets state.
    const first = window.setTimeout(() => {
      void syncAll();
    }, 0);
    const id = window.setInterval(() => {
      void syncAll();
    }, 2000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [syncAll]);

  useEffect(() => {
    if (autoScroll) {
      logBoxRef.current?.scrollTo({
        top: logBoxRef.current.scrollHeight,
      });
    }
  }, [logs, autoScroll]);

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    store(LAYA_BASE_URL_KEY, value);
  };

  const handlePortChange = (value: string) => {
    setPort(value);
    store(LAYA_PORT_KEY, value);
  };

  const handleStart = async () => {
    const portNum = Math.floor(Number(port));
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) return;
    setBusy(true);
    try {
      // Explicit button press is the user's confirmation to launch the server.
      const next = await layaStart(portNum);
      setStatus(next);
      setStatusError(null);
      await refreshLogs();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const next = await layaStop();
      setStatus(next);
      setStatusError(null);
      await refreshLogs();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleHealth = async () => {
    setHealthChecking(true);
    setHealth(null);
    setHealthError(null);
    try {
      const payload = await fetchHealth(baseUrl);
      setHealth(JSON.stringify(payload, null, 2));
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err));
    } finally {
      setHealthChecking(false);
    }
  };

  if (!isTauriRuntime()) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-editor p-4">
        <p className="max-w-md text-center text-xs leading-relaxed text-muted-foreground">
          {t('layaService.webPreview')}
        </p>
      </div>
    );
  }

  const running = status?.running ?? false;
  const dotClass = running ? 'bg-emerald-500' : 'bg-muted-foreground/50';

  return (
    <div
      className="flex h-full w-full min-h-0 gap-4 overflow-auto bg-editor p-4"
      data-testid="laya-service-tab"
    >
      <div className="flex w-72 shrink-0 flex-col gap-3">
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              {t('layaService.status')}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
                aria-hidden="true"
              />
              {running ? t('layaService.running') : t('layaService.stopped')}
            </span>
          </div>
          <Row
            label={t('layaService.managed')}
            value={
              status === null
                ? '-'
                : status.managed
                  ? t('layaService.managed')
                  : t('layaService.external')
            }
          />
          <Row
            label={t('layaService.pid')}
            value={status?.pid === null || status?.pid === undefined ? '-' : String(status.pid)}
          />
          <Row
            label={t('layaService.uptime')}
            value={formatUptime(status?.uptime_secs ?? null)}
          />
          {statusError !== null && (
            <p className="break-all rounded-md bg-destructive/10 p-2 text-[11px] leading-relaxed text-destructive">
              {statusError}
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('layaService.baseUrl')}
            <input
              aria-label={t('layaService.baseUrl')}
              type="url"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('layaService.port')}
            <input
              aria-label={t('layaService.port')}
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => handlePortChange(e.target.value)}
              disabled={running}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground disabled:opacity-50"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('layaService.startHint')}
          </p>
          <div className="flex gap-2">
            {!running ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void handleStart()}
              >
                <Play className="h-3.5 w-3.5" />
                {busy ? t('layaService.starting') : t('layaService.start')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy || !(status?.managed ?? false)}
                title={
                  status?.managed ? undefined : t('layaService.external')
                }
                onClick={() => void handleStop()}
              >
                <Square className="h-3.5 w-3.5" />
                {t('layaService.stop')}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void refreshStatus();
                void refreshLogs();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('layaService.refresh')}
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              {t('layaService.health')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={healthChecking}
              onClick={() => void handleHealth()}
            >
              <Stethoscope className="h-3.5 w-3.5" />
              {t('layaService.checkHealth')}
            </Button>
          </div>
          {health !== null && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {health}
            </pre>
          )}
          {healthError !== null && (
            <p className="break-all rounded-md bg-destructive/10 p-2 text-[11px] leading-relaxed text-destructive">
              {t('layaService.healthFail')}: {healthError}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">
            {t('layaService.logs')}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {t('layaService.autoscroll')}
          </label>
        </div>
        <pre
          ref={logBoxRef}
          className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-foreground"
        >
          {logs.length > 0 ? logs.join('\n') : t('layaService.logsEmpty')}
        </pre>
      </div>
    </div>
  );
}
