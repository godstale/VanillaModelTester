import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { TetrisTab } from '@/components/game/TetrisTab';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  const tab: WorkspaceTab = {
    id: 'game:test',
    type: 'game',
    title: 'Tetris',
    meta: { sessionId: '12345' },
  };
  return render(
    <LanguageProvider>
      <TetrisTab tab={tab} />
    </LanguageProvider>,
  );
}

describe('TetrisTab', () => {
  it('renders the board canvas and auto controls before starting', () => {
    setup();
    const canvas = screen.getByTestId('tetris-board');
    expect(canvas.getAttribute('width')).toBe('240');
    expect(canvas.getAttribute('height')).toBe('480');
    // Auto-only: no manual/mode toggle, Start is shown.
    expect(
      screen.queryByRole('button', { name: '수동' }),
    ).toBeNull();
    screen.getByRole('button', { name: '시작' });
    // URL, Model, Preset buttons are visible
    screen.getByRole('button', { name: 'Laya' });
    screen.getByRole('button', { name: 'Ollama Tev1' });
    screen.getByLabelText('서버 URL');
    screen.getByLabelText('모델');
    screen.getByLabelText('최소 확신도');
    screen.getByLabelText('속도');
    screen.getByLabelText('최대 스텝');
  });

  it('waits for explicit start instead of auto-starting', () => {
    setup();

    // Idle: Start is shown, Restart/Stop are hidden, monitor is idle.
    screen.getByRole('button', { name: '시작' });
    expect(
      screen.queryByRole('button', { name: '다시 시작' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: '정지' })).toBeNull();
    screen.getByTestId('laya-status-panel');
    expect(screen.getAllByText('대기 중').length).toBeGreaterThan(0);
  });

  it('auto start shows stop and stop returns to start', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '시작' }));

    screen.getByRole('button', { name: '정지' });
    screen.getByRole('button', { name: '다시 시작' });

    fireEvent.click(screen.getByRole('button', { name: '정지' }));
    screen.getByRole('button', { name: '시작' });
    expect(screen.queryByRole('button', { name: '정지' })).toBeNull();
  });

  it('shows the laya status column with input/output/latency sections', () => {
    setup();

    const panel = screen.getByTestId('laya-status-panel');
    expect(panel.textContent).toContain('모델 서비스 상태');
    expect(panel.textContent).toContain('마지막 입력');
    expect(panel.textContent).toContain('마지막 출력');

    screen.getByLabelText('서버 URL');
    screen.getByTestId('laya-status-panel');
  });

  it('offers the benchmark action with progress support', () => {
    setup();
    screen.getByRole('button', { name: '벤치마크' });
  });

  it('offers board recording with a download path', () => {
    setup();
    screen.getByRole('button', { name: '녹화' });
  });

  it('saves the recording when the save button is pressed', async () => {
    class FakeMediaRecorder {
      static isTypeSupported = () => true;

      ondataavailable: ((event: BlobEvent) => void) | null = null;

      onstop: (() => void) | null = null;

      onerror: (() => void) | null = null;

      state = 'inactive';

      mimeType = 'video/webm';

      start() {
        this.state = 'recording';
      }

      requestData() {}

      stop() {
        this.state = 'inactive';
        this.ondataavailable?.(
          new BlobEvent('dataavailable', {
            data: new Blob(['frame'], { type: 'video/webm' }),
          }),
        );
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const canvasProto = HTMLCanvasElement.prototype as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    const originalCaptureStream = canvasProto.captureStream;
    canvasProto.captureStream = () =>
      ({ getTracks: () => [] }) as unknown as MediaStream;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:fake-recording';
    URL.revokeObjectURL = () => {};
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    try {
      setup();
      fireEvent.click(screen.getByRole('button', { name: '녹화' }));
      fireEvent.click(screen.getByRole('button', { name: '녹화 정지' }));

      const saveButton = await screen.findByRole('button', {
        name: /영상 저장/,
      });
      fireEvent.click(saveButton);

      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(await screen.findByText(/녹화 저장됨/)).not.toBeNull();
    } finally {
      canvasProto.captureStream = originalCaptureStream;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
