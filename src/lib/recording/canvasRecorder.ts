export const RECORDER_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

export function pickRecorderMime(): string {
  try {
    if (
      typeof MediaRecorder === 'undefined' ||
      typeof MediaRecorder.isTypeSupported !== 'function'
    ) {
      return '';
    }
    for (const mime of RECORDER_MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
  } catch {
    // MediaRecorder probing must never break the game UI.
  }
  return '';
}

export interface CanvasRecording {
  blob: Blob;
  mimeType: string;
  byteSize: number;
}

export function isCanvasRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof (HTMLCanvasElement.prototype as unknown as Record<string, unknown>)
      .captureStream === 'function'
  );
}

export interface CanvasRecorderHandle {
  stop: () => Promise<CanvasRecording>;
  requestData: () => void;
}

/** Record a live canvas via captureStream + MediaRecorder. Caller owns the canvas lifetime. */
export function startCanvasRecording(
  canvas: HTMLCanvasElement,
  opts: { fps?: number; mimeType?: string; videoBitsPerSecond?: number } = {},
): CanvasRecorderHandle {
  const capturer = canvas as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  if (typeof capturer.captureStream !== 'function') {
    throw new Error('canvas captureStream is not supported in this browser');
  }
  const stream = capturer.captureStream(opts.fps ?? 30);
  const mimeType =
    opts.mimeType !== undefined && opts.mimeType !== ''
      ? opts.mimeType
      : pickRecorderMime();
  const recorder = new MediaRecorder(
    stream,
    mimeType !== ''
      ? { mimeType, videoBitsPerSecond: opts.videoBitsPerSecond ?? 2_500_000 }
      : undefined,
  );
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };
  const done = new Promise<CanvasRecording>((resolve, reject) => {
    recorder.onstop = () => {
      try {
        const type = recorder.mimeType !== '' ? recorder.mimeType : 'video/webm';
        const blob = new Blob(chunks, { type });
        resolve({ blob, mimeType: type, byteSize: blob.size });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    };
    recorder.onerror = () => {
      reject(new Error('recording failed'));
    };
  });
  recorder.start(250);
  return {
    requestData: () => {
      try {
        recorder.requestData();
      } catch {
        // Best effort flush; stop() still resolves with buffered chunks.
      }
    },
    stop: () => {
      if (recorder.state === 'inactive') {
        return done;
      }
      recorder.stop();
      return done;
    },
  };
}

export function recordingFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `tetris-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.webm`
  );
}
