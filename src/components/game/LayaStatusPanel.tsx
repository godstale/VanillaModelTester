import type { LayaMonitorState } from '@/components/game/layaMonitor';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export interface LayaStatusPanelProps {
  running: boolean;
  baseUrl: string;
  steps: number;
  decisions: number;
  fallbacks: number;
  avgLatencyMs: number | null;
  avgConfidence: number | null;
  monitor: LayaMonitorState;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-mono font-semibold text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

export function LayaStatusPanel({
  running,
  baseUrl,
  steps,
  decisions,
  fallbacks,
  avgLatencyMs,
  avgConfidence,
  monitor,
}: LayaStatusPanelProps) {
  const { t } = useLanguage();

  const statusKey =
    monitor.connStatus === 'ended'
      ? 'game.layaEnded'
      : monitor.connStatus === 'waiting'
        ? running
          ? 'game.layaWaiting'
          : 'game.layaWaiting'
        : monitor.connStatus === 'ok'
          ? 'game.layaOk'
          : monitor.connStatus === 'error'
            ? 'game.layaError'
            : running
              ? 'game.layaRunning'
              : 'game.layaIdle';

  const dotClass =
    monitor.connStatus === 'ok'
      ? 'bg-emerald-500'
      : monitor.connStatus === 'error'
        ? 'bg-destructive'
        : monitor.connStatus === 'waiting' || running
          ? 'bg-amber-500'
          : 'bg-muted-foreground/50';

  return (
    <div
      className="flex w-64 shrink-0 flex-col gap-3"
      data-testid="laya-status-panel"
    >
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">
            {t('game.layaStatus')}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
              aria-hidden="true"
            />
            {t(statusKey)}
          </span>
        </div>
        <Row label={t('game.laya')} value="laya" />
        <Row
          label={t('game.layaRunningState')}
          value={running ? t('game.layaRunning') : t('game.layaIdle')}
        />
        <Row label={t('game.steps')} value={String(steps)} />
        <Row label={t('game.decisions')} value={String(decisions)} />
        <Row label={t('game.fallbacks')} value={String(fallbacks)} />
        <Row
          label={t('game.requestCount')}
          value={String(monitor.requestCount)}
        />
        <Row label={t('game.errorCount')} value={String(monitor.errorCount)} />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <span className="text-xs font-semibold text-foreground">
          {t('game.lastInput')}
        </span>
        <div className="text-[11px] text-muted-foreground">{baseUrl}</div>
        {monitor.lastStateText ? (
          <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-foreground">
            {monitor.lastStateText}
          </pre>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t('game.noData')}</p>
        )}
        {monitor.lastCandidatesText ? (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">
              {t('game.candidatesText')}
            </summary>
            <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {monitor.lastCandidatesText}
            </pre>
          </details>
        ) : null}
      </div>

      <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
        <span className="text-xs font-semibold text-foreground">
          {t('game.lastOutput')}
        </span>
        <Row
          label={t('game.lastChoice')}
          value={monitor.lastChoice || '-'}
        />
        <Row
          label={t('game.lastDanger')}
          value={
            monitor.lastDanger === null ? '-' : String(monitor.lastDanger)
          }
        />
        <Row
          label={t('game.lastConfidence')}
          value={
            monitor.lastConfidence === null
              ? '-'
              : String(monitor.lastConfidence)
          }
        />
        <Row
          label={t('game.lastLatency')}
          value={
            monitor.lastLatencyMs === null
              ? '-'
              : `${monitor.lastLatencyMs.toFixed(1)} ms`
          }
        />
        <Row
          label={t('game.avgLatency')}
          value={
            avgLatencyMs === null ? '-' : `${avgLatencyMs.toFixed(1)} ms`
          }
        />
        <Row
          label={t('game.avgConfidence')}
          value={
            avgConfidence === null ? '-' : avgConfidence.toFixed(3)
          }
        />
        {monitor.lastError !== null && (
          <p
            className="break-all rounded-md bg-destructive/10 p-2 text-[11px] leading-relaxed text-destructive"
            title={monitor.lastError}
          >
            {monitor.lastError}
          </p>
        )}
      </div>
    </div>
  );
}
