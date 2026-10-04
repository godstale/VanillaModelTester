import { invoke } from '@tauri-apps/api/core';

export interface LayaServiceStatus {
  running: boolean;
  managed: boolean;
  pid: number | null;
  port: number;
  uptime_secs: number | null;
  log_lines: number;
  bin: string;
}

export async function layaStart(port: number): Promise<LayaServiceStatus> {
  return invoke<LayaServiceStatus>('laya_start', { port });
}

export async function layaStop(): Promise<LayaServiceStatus> {
  return invoke<LayaServiceStatus>('laya_stop');
}

export async function layaStatus(): Promise<LayaServiceStatus> {
  return invoke<LayaServiceStatus>('laya_status');
}

export async function layaLogs(tail: number): Promise<string[]> {
  return invoke<string[]>('laya_logs', { tail });
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  );
}

export { isTauriRuntime };

export async function fetchHealth(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/health`,
      { signal: controller.signal },
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as unknown;
  } finally {
    window.clearTimeout(timer);
  }
}
