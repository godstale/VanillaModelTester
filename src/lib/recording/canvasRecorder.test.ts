import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  pickRecorderMime,
  recordingFileName,
} from '@/lib/recording/canvasRecorder';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canvasRecorder helpers', () => {
  it('builds a timestamped webm file name', () => {
    const name = recordingFileName(new Date(2026, 9, 13, 10, 20, 30));
    expect(name).toBe('tetris-20261013-102030.webm');
  });

  it('returns empty when MediaRecorder probing is unavailable', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(pickRecorderMime()).toBe('');
  });

  it('picks the first supported mime type', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (mime: string) => mime.includes('vp8'),
    });
    expect(pickRecorderMime()).toBe('video/webm;codecs=vp8');
  });
});
