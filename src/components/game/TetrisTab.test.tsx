import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { TetrisTab } from '@/components/game/TetrisTab';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';

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
  it('renders the board canvas and HUD before starting', () => {
    setup();
    const canvas = screen.getByTestId('tetris-board');
    expect(canvas.getAttribute('width')).toBe('240');
    expect(canvas.getAttribute('height')).toBe('480');
    // Throws if the button is missing.
    screen.getByRole('button', { name: '시작' });
  });

  it('starts on button click and handles local keyboard input', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '시작' }));
    screen.getByRole('button', { name: '일시정지' });

    const handler = screen.getByTestId('tetris-key-handler');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ']) {
      fireEvent.keyDown(handler, { key });
    }
    // Game still running after valid inputs: pause control stays available.
    screen.getByRole('button', { name: '일시정지' });
  });

  it('toggles pause and resume', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '시작' }));
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    screen.getByRole('button', { name: '계속' });
  });

  it('auto mode waits for explicit start instead of auto-starting', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '자동' }));

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
    fireEvent.click(screen.getByRole('button', { name: '자동' }));
    fireEvent.click(screen.getByRole('button', { name: '시작' }));

    screen.getByRole('button', { name: '정지' });
    screen.getByRole('button', { name: '다시 시작' });

    fireEvent.click(screen.getByRole('button', { name: '정지' }));
    screen.getByRole('button', { name: '시작' });
    expect(screen.queryByRole('button', { name: '정지' })).toBeNull();
  });

  it('shows the laya status column with input/output/latency sections', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '자동' }));

    const panel = screen.getByTestId('laya-status-panel');
    expect(panel.textContent).toContain('라야 상태');
    expect(panel.textContent).toContain('마지막 입력');
    expect(panel.textContent).toContain('마지막 출력');

    // Non-laya agents get a guidance hint.
    screen.getByText(/라야 에이전트를 선택하면/);

    // Switching to laya reveals the URL field and drops the hint.
    const agentSelect = screen.getByLabelText('에이전트');
    fireEvent.change(agentSelect, { target: { value: 'laya' } });
    screen.getByLabelText('Laya URL');
    expect(screen.queryByText(/라야 에이전트를 선택하면/)).toBeNull();
    screen.getByTestId('laya-status-panel');
  });
});
