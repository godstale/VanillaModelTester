import { describe, expect, it } from 'vitest';
import {
  initialLayaMonitor,
  reduceLayaMonitor,
} from '@/components/game/layaMonitor';

describe('layaMonitor endReason', () => {
  it('mirrors the episode stop reason into lastError for visibility', () => {
    const next = reduceLayaMonitor(initialLayaMonitor, {
      type: 'ended',
      reason: 'abstained:danger-true (model judged stack doomed, choice=r0x3 confidence=0.9)',
    });
    expect(next.connStatus).toBe('ended');
    expect(next.endReason).toMatch(/danger-true/);
    expect(next.lastError).toMatch(/danger-true/);
  });

  it('keeps clean endings free of error text', () => {
    const next = reduceLayaMonitor(initialLayaMonitor, {
      type: 'ended',
      reason: 'maxSteps',
    });
    expect(next.endReason).toBe('maxSteps');
    expect(next.lastError).toBeNull();
  });
});
