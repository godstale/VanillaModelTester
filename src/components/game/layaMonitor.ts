export type LayaConnStatus =
  | 'idle'
  | 'waiting'
  | 'ok'
  | 'error'
  | 'ended';

export interface LayaMonitorState {
  connStatus: LayaConnStatus;
  requestCount: number;
  errorCount: number;
  lastStepIndex: number | null;
  lastStateText: string;
  lastCandidatesText: string;
  lastChoice: string;
  lastConfidence: number | null;
  lastDanger: boolean | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  endReason: string | null;
  updatedAt: number | null;
}

export const initialLayaMonitor: LayaMonitorState = {
  connStatus: 'idle',
  requestCount: 0,
  errorCount: 0,
  lastStepIndex: null,
  lastStateText: '',
  lastCandidatesText: '',
  lastChoice: '',
  lastConfidence: null,
  lastDanger: null,
  lastLatencyMs: null,
  lastError: null,
  endReason: null,
  updatedAt: null,
};

export type LayaMonitorEvent =
  | { type: 'request'; stepIndex: number }
  | {
      type: 'success';
      stepIndex: number;
      stateText: string;
      candidatesText: string;
      choice: string;
      confidence: number;
      danger: boolean | null;
      latencyMs: number;
    }
  | { type: 'error'; stepIndex: number; message: string; latencyMs: number }
  | { type: 'reset' }
  | { type: 'ended'; reason?: string };

export function reduceLayaMonitor(
  prev: LayaMonitorState,
  event: LayaMonitorEvent,
): LayaMonitorState {
  switch (event.type) {
    case 'request':
      return {
        ...prev,
        connStatus: 'waiting',
        requestCount: prev.requestCount + 1,
        lastStepIndex: event.stepIndex,
        updatedAt: Date.now(),
      };
    case 'success':
      return {
        ...prev,
        connStatus: 'ok',
        lastStepIndex: event.stepIndex,
        lastStateText: event.stateText,
        lastCandidatesText: event.candidatesText,
        lastChoice: event.choice,
        lastConfidence: event.confidence,
        lastDanger: event.danger,
        lastLatencyMs: event.latencyMs,
        lastError: null,
        updatedAt: Date.now(),
      };
    case 'error':
      return {
        ...prev,
        connStatus: 'error',
        errorCount: prev.errorCount + 1,
        lastStepIndex: event.stepIndex,
        lastLatencyMs: event.latencyMs,
        lastError: event.message,
        updatedAt: Date.now(),
      };
    case 'reset':
      return { ...initialLayaMonitor };
    case 'ended':
      return {
        ...prev,
        connStatus: 'ended',
        endReason: event.reason ?? prev.endReason,
        // An abstain/danger stop is not a transport error, but without an
        // error line the UI would show "완료" with no cause. Mirror the
        // reason so the stop cause stays visible.
        lastError:
          event.reason !== undefined &&
          event.reason !== '' &&
          event.reason !== 'maxSteps' &&
          event.reason !== 'gameover'
            ? event.reason
            : prev.lastError,
        updatedAt: Date.now(),
      };
    default:
      return prev;
  }
}
