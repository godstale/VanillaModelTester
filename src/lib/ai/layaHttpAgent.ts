import { encodePlacementRequest } from './stateEncoder';
import {
  isTauriRuntime,
  layaHttpPost,
  normalizeBaseUrl,
} from '../laya/serviceClient';
import type {
  BoardSnapshot,
  CandidateMove,
  DecisionAgent,
  MoveDecision,
} from './types';

export const DEFAULT_LAYA_URL = 'http://127.0.0.1:8000';

export interface LayaHttpOptions {
  timeoutMs?: number;
  minConfidence?: number;
  maxCandidates?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

interface KeptCandidate {
  id: string;
  features: unknown;
}

interface DangerReading {
  danger: boolean | null;
  dangerConfidence: number | null;
}

// The `danger` noul answer is `{type:'noul', noul:boolean}` plus an optional
// `confidence`. Tolerant: a missing or malformed answer means "unknown", never
// a crash. Unknown server versions simply report null.
function readDanger(data: unknown): DangerReading {
  const none: DangerReading = { danger: null, dangerConfidence: null };
  if (!isRecord(data) || !isRecord(data['answers'])) {
    return none;
  }
  const answer = data['answers']['danger'];
  if (!isRecord(answer) || answer['type'] !== 'noul') {
    return none;
  }
  if (typeof answer['noul'] !== 'boolean') {
    return none;
  }
  const rawConfidence = answer['confidence'];
  const fallbackConfidence = answer['answer_confidence'];
  return {
    danger: answer['noul'],
    dangerConfidence:
      typeof rawConfidence === 'number'
        ? rawConfidence
        : typeof fallbackConfidence === 'number'
          ? fallbackConfidence
          : null,
  };
}

function toDecision(
  data: unknown,
  kept: KeptCandidate[],
  stateText: string,
  candidatesText: string,
  started: number,
): MoveDecision {
  if (!isRecord(data) || !isRecord(data['answers'])) {
    throw new Error('laya: missing answers in response');
  }
  const place = data['answers']['place'];
  if (!isRecord(place) || typeof place['choice'] !== 'string') {
    throw new Error('laya: missing answers.place.choice');
  }
  const choice: string = place['choice'];
  if (!kept.some((c) => c.id === choice)) {
    throw new Error(`laya: unknown choice ${choice}`);
  }
  const confidence =
    typeof place['answer_confidence'] === 'number'
      ? place['answer_confidence']
      : 0;
  const { danger, dangerConfidence } = readDanger(data);
  // A lost position is not played out: stopping keeps the log honest instead
  // of recording moves from a position the model itself judged doomed.
  const abstained = place['abstention'] === 'abstained' || danger === true;
  return {
    moveId: choice,
    confidence,
    abstained,
    latencyMs: performance.now() - started,
    raw: { stateText, candidatesText, danger, dangerConfidence },
  };
}

export function createLayaHttpAgent(
  baseUrl: string = DEFAULT_LAYA_URL,
  opts: LayaHttpOptions = {},
): DecisionAgent {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const maxCandidates = opts.maxCandidates ?? 8;
  const minConfidence = opts.minConfidence;
  return {
    name: 'laya',
    async decide(snap: BoardSnapshot, cands: CandidateMove[]) {
      const start = performance.now();
      const { stateText, questions, kept } = encodePlacementRequest(
        snap,
        cands,
        maxCandidates,
      );
      if (kept.length === 0) {
        throw new Error('laya: no candidates to judge');
      }
      const body: Record<string, unknown> = {
        state: { board: stateText },
        questions,
      };
      if (minConfidence !== undefined) {
        body['min_confidence'] = minConfidence;
      }
      const candidatesText = JSON.stringify(
        kept.map((c) => ({ id: c.id, features: c.features })),
      );
      const payload = JSON.stringify(body);
      const url = `${normalizeBaseUrl(baseUrl)}/v1/systemone`;
      // laya-serve sends no CORS headers, so the webview fetch is blocked
      // even on success. Prefer the Rust side when running under Tauri.
      if (isTauriRuntime()) {
        const res = await layaHttpPost(url, payload, timeoutMs);
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`laya: HTTP ${res.status}`);
        }
        const data: unknown = JSON.parse(res.body);
        return toDecision(data, kept, stateText, candidatesText, start);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`laya: HTTP ${res.status}`);
        }
        const data: unknown = await res.json();
        return toDecision(data, kept, stateText, candidatesText, start);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
