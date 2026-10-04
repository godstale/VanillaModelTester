import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../tetris/constants';
import type { ActivePiece, Board } from '../tetris/types';
import { enumerateCandidates } from './candidates';
import { encodePlacementRequest, scoreForCut } from './stateEncoder';
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

    const scores = req.kept.map((c) => scoreForCut(c.features));
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

  it('formats stateText with the full board grid, progress, and one segment per kept candidate', () => {
    const board = createEmptyBoard();
    const active: ActivePiece = { kind: 'T', rot: 0, x: 3, y: 0 };
    const cands = enumerateCandidates(board, active);
    const req = encodePlacementRequest(snapOn(board, active), cands, 8);
    expect(req.stateText).toContain(
      'board 10x20 (row0=top, .=empty #=filled):',
    );
    const gridLines = req.stateText.split('\n').slice(1, 21);
    expect(gridLines).toHaveLength(20);
    for (const line of gridLines) {
      expect(line).toBe('..........');
    }
    expect(req.stateText).toContain('holes=0');
    expect(req.stateText).toContain('maxH=');
    expect(req.stateText).toContain('active=T rot=0 x=3 y=0');
    expect(req.stateText).toContain('next=[S,Z]');
    expect(req.stateText).toContain('score=0 lines=0 level=0 step=0');
    expect(req.stateText).toContain(
      `cands=8/${cands.length} dropped=${cands.length - 8}`,
    );
    for (const c of req.kept) {
      expect(req.stateText).toContain(`${c.id}: rot ${c.rot} x ${c.x} y `);
      expect(req.stateText).toContain(`aggH ${c.features.aggregateHeight}`);
      expect(req.stateText).toContain(`bump ${c.features.bumpiness}`);
    }
  });

  it('renders filled cells and carries full landing features into criteria', () => {
    const board = createEmptyBoard();
    board[19][0] = 1;
    board[19][9] = 2;
    board[18][5] = 3;
    const active: ActivePiece = { kind: 'I', rot: 1, x: 4, y: 2 };
    const snap: BoardSnapshot = {
      board,
      active,
      queue: ['O'],
      score: 150,
      lines: 3,
      level: 2,
      stepIndex: 42,
    };
    const cands = enumerateCandidates(board, active);
    const req = encodePlacementRequest(snap, cands, 8);
    const gridLines = req.stateText.split('\n').slice(1, 21);
    expect(gridLines[19]).toBe('#........#');
    expect(gridLines[18]?.slice(5, 6)).toBe('#');
    expect(req.stateText).toContain('active=I rot=1 x=4 y=2');
    expect(req.stateText).toContain('next=[O] score=150 lines=3 level=2 step=42');
    const criteria = req.questions['place']?.criteria as Record<string, string>;
    for (const c of req.kept) {
      expect(criteria[c.id]).toContain(`y ${c.features.landingY}`);
      expect(criteria[c.id]).toContain(`aggH ${c.features.aggregateHeight}`);
      expect(criteria[c.id]).toContain(`bump ${c.features.bumpiness}`);
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
