import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyBoard } from '../tetris/constants';
import type { ActivePiece } from '../tetris/types';
import { enumerateCandidates } from './candidates';
import { createLayaHttpAgent } from './layaHttpAgent';
import { encodePlacementRequest } from './stateEncoder';
import type { BoardSnapshot } from './types';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fixture(): { snap: BoardSnapshot; active: ActivePiece } {
  const board = createEmptyBoard();
  const active: ActivePiece = { kind: 'T', rot: 0, x: 3, y: 0 };
  const snap: BoardSnapshot = {
    board,
    active,
    queue: ['S', 'Z'],
    score: 0,
    lines: 0,
    level: 0,
    stepIndex: 0,
  };
  return { snap, active };
}

function okPayload(payload: unknown): unknown {
  return { ok: true, status: 200, json: async () => payload };
}

describe('createLayaHttpAgent', () => {
  it('maps choice/confidence/raw/latency and omits min_confidence by default', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    const topId = encodePlacementRequest(snap, cands, 8).kept[0]?.id;
    expect(topId).toBeDefined();

    const fetchMock = vi.fn(
      (...args: [string, RequestInit?]): Promise<unknown> => {
        void args;
        return Promise.resolve(
          okPayload({
            answers: {
              place: { choice: topId, answer_confidence: 0.85 },
            },
          }),
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const agent = createLayaHttpAgent('http://127.0.0.1:8000');
    expect(agent.name).toBe('laya');
    const d = await agent.decide(snap, cands);
    expect(d.moveId).toBe(topId);
    expect(d.confidence).toBe(0.85);
    expect(d.abstained).toBe(false);
    expect(typeof d.latencyMs).toBe('number');
    expect(d.latencyMs).toBeGreaterThanOrEqual(0);

    const raw = d.raw as { stateText: string; candidatesText: string };
    expect(raw.stateText).toContain('holes=');
    const parsed = JSON.parse(raw.candidatesText) as { id: string }[];
    expect(parsed).toHaveLength(8);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8000/v1/systemone',
    );
    const body = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect('min_confidence' in body).toBe(false);
    expect(body['state']).toBeDefined();
    expect(body['questions']).toBeDefined();
  });

  it('reports abstained when the answer abstains', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    const topId = encodePlacementRequest(snap, cands, 8).kept[0]?.id;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          okPayload({
            answers: {
              place: {
                choice: topId,
                answer_confidence: 0.1,
                abstention: 'abstained',
              },
            },
          }),
        ),
      ),
    );
    const d = await createLayaHttpAgent().decide(snap, cands);
    expect(d.abstained).toBe(true);
    expect(d.confidence).toBe(0.1);
  });

  it('includes min_confidence only when the option is set', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    const topId = encodePlacementRequest(snap, cands, 8).kept[0]?.id;
    const fetchMock = vi.fn(
      (...args: [string, RequestInit?]): Promise<unknown> => {
        void args;
        return Promise.resolve(
          okPayload({ answers: { place: { choice: topId } } }),
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const d = await createLayaHttpAgent('http://127.0.0.1:8000', {
      minConfidence: 0.5,
    }).decide(snap, cands);
    expect(d.moveId).toBe(topId);
    expect(d.confidence).toBe(0);
    const body = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(body['min_confidence']).toBe(0.5);
  });

  it('throws on HTTP 500', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 500 }),
      ),
    );
    await expect(createLayaHttpAgent().decide(snap, cands)).rejects.toThrow();
  });

  it('throws on timeout', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<unknown>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      ),
    );
    await expect(
      createLayaHttpAgent('http://127.0.0.1:8000', { timeoutMs: 20 }).decide(
        snap,
        cands,
      ),
    ).rejects.toThrow();
  });

  it('abstains when danger reports a lost position', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    const topId = encodePlacementRequest(snap, cands, 8).kept[0]?.id;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          okPayload({
            answers: {
              place: { choice: topId, answer_confidence: 0.9 },
              danger: { type: 'noul', noul: true, confidence: 0.7 },
            },
          }),
        ),
      ),
    );
    const d = await createLayaHttpAgent().decide(snap, cands);
    expect(d.abstained).toBe(true);
    const raw = d.raw as { danger: boolean | null; dangerConfidence: number | null };
    expect(raw.danger).toBe(true);
    expect(raw.dangerConfidence).toBe(0.7);
  });

  it('keeps playing when danger reports a live position', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    const topId = encodePlacementRequest(snap, cands, 8).kept[0]?.id;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          okPayload({
            answers: {
              place: { choice: topId, answer_confidence: 0.9 },
              danger: { type: 'noul', noul: false },
            },
          }),
        ),
      ),
    );
    const d = await createLayaHttpAgent().decide(snap, cands);
    expect(d.abstained).toBe(false);
    expect(
      (d.raw as { danger: boolean | null }).danger,
    ).toBe(false);
  });

  it('treats a missing or malformed danger answer as unknown', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    const topId = encodePlacementRequest(snap, cands, 8).kept[0]?.id;
    for (const danger of [
      undefined,
      { type: 'noul' },
      { type: 'noul', noul: 'yes' },
      { type: 'choice', noul: true },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            okPayload({
              answers: {
                place: { choice: topId, answer_confidence: 0.9 },
                ...(danger === undefined ? {} : { danger }),
              },
            }),
          ),
        ),
      );
      const d = await createLayaHttpAgent().decide(snap, cands);
      expect(d.abstained).toBe(false);
      expect(
        (d.raw as { danger: boolean | null }).danger,
      ).toBeNull();
    }
  });

  it('throws on an unknown choice', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          okPayload({ answers: { place: { choice: 'r9x9' } } }),
        ),
      ),
    );
    await expect(createLayaHttpAgent().decide(snap, cands)).rejects.toThrow(
      /unknown choice/,
    );
  });

  it('supports ollama tev1 model and serverType with probability danger score', async () => {
    const { snap, active } = fixture();
    const cands = enumerateCandidates(snap.board, active);
    const topId = encodePlacementRequest(snap, cands, 8).kept[0]?.id;
    const fetchMock = vi.fn(
      (...args: [string, RequestInit?]): Promise<unknown> => {
        void args;
        return Promise.resolve(
          okPayload({
            model: 'tev1:4b',
            answers: {
              place: { choice: topId, confidence: 0.92 },
              danger: { type: 'noul', noul: 0.85 },
            },
          }),
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const agent = createLayaHttpAgent('http://127.0.0.1:11434', {
      serverType: 'ollama',
      model: 'tev1:4b',
    });
    expect(agent.name).toBe('ollama-tev1');

    const decision = await agent.decide(snap, cands);
    expect(decision.moveId).toBe(topId);
    expect(decision.confidence).toBe(0.92);
    expect(decision.abstained).toBe(true); // 0.85 >= default 0.5 threshold
    expect((decision.raw as { danger: boolean | null }).danger).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(body['model']).toBe('tev1:4b');
  });
});
