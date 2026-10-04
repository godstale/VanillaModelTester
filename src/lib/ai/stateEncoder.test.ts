import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../tetris/constants';
import type { ActivePiece, Board } from '../tetris/types';
import { enumerateCandidates } from './candidates';
import { scoreOf } from './heuristicAgent';
import { encodePlacementRequest } from './stateEncoder';
import type { BoardSnapshot } from './types';

function snapOn(board: Board, active: ActivePiece): BoardSnapshot {
  return {
    board,
    active,
    queue: ['S', 'Z'],
    score: 0,
    lines: 0,
    level: 0,
    stepIndex: 0,
  };
}

describe('encodePlacementRequest', () => {
  it('keeps only the top N by heuristic score and counts the rest as dropped', () => {
    const board = createEmptyBoard();
    const active: ActivePiece = { kind: 'T', rot: 0, x: 3, y: 0 };
    const cands = enumerateCandidates(board, active);
    expect(cands.length).toBeGreaterThan(8);

    const req = encodePlacementRequest(snapOn(board, active), cands, 3);
    expect(req.kept).toHaveLength(3);
    expect(req.dropped).toBe(cands.length - 3);

    const scores = req.kept.map((c) => scoreOf(c.features));
    for (let i = 0; i + 1 < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });

  it('is deterministic across calls', () => {
    const board = createEmptyBoard();
    const active: ActivePiece = { kind: 'T', rot: 0, x: 3, y: 0 };
    const cands = enumerateCandidates(board, active);
    const snap = snapOn(board, active);
    const a = encodePlacementRequest(snap, cands, 8);
    const b = encodePlacementRequest(snap, cands, 8);
    expect(a).toEqual(b);
  });

  it('formats stateText with the board prefix and one segment per kept candidate', () => {
    const board = createEmptyBoard();
    const active: ActivePiece = { kind: 'T', rot: 0, x: 3, y: 0 };
    const cands = enumerateCandidates(board, active);
    const req = encodePlacementRequest(snapOn(board, active), cands, 8);
    expect(req.stateText).toContain('holes=0');
    expect(req.stateText).toContain('maxH=');
    expect(req.stateText).toContain('active=T');
    expect(req.stateText).toContain('next=[S,Z]');
    for (const c of req.kept) {
      expect(req.stateText).toContain(`${c.id}: rot ${c.rot} x ${c.x}`);
    }
  });

  it('builds place (choice) and danger (noul) questions', () => {
    const board = createEmptyBoard();
    const active: ActivePiece = { kind: 'T', rot: 0, x: 3, y: 0 };
    const cands = enumerateCandidates(board, active);
    const req = encodePlacementRequest(snapOn(board, active), cands, 8);
    expect(req.questions['place']?.type).toBe('choice');
    expect(typeof req.questions['place']?.instructions).toBe('string');
    expect(req.questions['danger']?.type).toBe('noul');
    expect(typeof req.questions['danger']?.instructions).toBe('string');
    const criteria = req.questions['place']?.criteria;
    expect(criteria).toBeDefined();
    expect(Object.keys(criteria ?? {}).sort()).toEqual(
      req.kept.map((c) => c.id).sort(),
    );
  });
});
