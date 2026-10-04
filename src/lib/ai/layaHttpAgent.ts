import { encodePlacementRequest } from './stateEncoder';
import type {
  BoardSnapshot,
  CandidateMove,
  DecisionAgent,
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${baseUrl}/v1/systemone`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`laya: HTTP ${res.status}`);
        }
        const data: unknown = await res.json();
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
        const abstained = place['abstention'] === 'abstained';
        const candidatesText = JSON.stringify(
          kept.map((c) => ({ id: c.id, features: c.features })),
        );
        return {
          moveId: choice,
          confidence,
          abstained,
          latencyMs: performance.now() - start,
          raw: { stateText, candidatesText },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
