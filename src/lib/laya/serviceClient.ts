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
  const normalized = normalizeBaseUrl(baseUrl);
  const isLikelyOllama = normalized.includes('11434');

  const probe = async (path: string): Promise<unknown> => {
    const url = `${normalized}${path}`;
    if (isTauriRuntime()) {
      const res = await layaHttpGet(url, timeoutMs);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      try {
        return JSON.parse(res.body) as unknown;
      } catch {
        return { message: res.body.trim() };
      }
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return { message: text.trim() };
      }
    } finally {
      window.clearTimeout(timer);
    }
  };

  if (isLikelyOllama) {
    try {
      return await probe('/api/tags');
    } catch {
      return await probe('/');
    }
  }

  try {
    return await probe('/health');
  } catch (err) {
    // If /health 404s, try /api/tags or / in case an Ollama instance is configured on this port
    try {
      return await probe('/api/tags');
    } catch {
      throw err;
    }
  }
}
