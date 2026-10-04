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

export interface LayaHttpResult {
  status: number;
  body: string;
}

export async function layaHttpGet(
  url: string,
  timeoutMs = 5000,
): Promise<LayaHttpResult> {
  return invoke<LayaHttpResult>('laya_http_get', { url, timeoutMs });
}

export async function layaHttpPost(
  url: string,
  body: string,
  timeoutMs = 10_000,
): Promise<LayaHttpResult> {
  return invoke<LayaHttpResult>('laya_http_post', { url, body, timeoutMs });
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  );
}

export { isTauriRuntime };

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function fetchHealth(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<unknown> {
  // laya-serve sends no CORS headers, so the webview fetch is blocked even
  // though the server answers 200. Go through the Rust side when available.
  if (isTauriRuntime()) {
    const res = await layaHttpGet(`${normalizeBaseUrl(baseUrl)}/health`, timeoutMs);
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}`);
    }
    return JSON.parse(res.body) as unknown;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/health`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as unknown;
  } finally {
    window.clearTimeout(timer);
  }
}
