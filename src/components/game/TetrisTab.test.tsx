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
    // Laya-only: no agent picker, the Laya URL field is always visible.
    expect(
      screen.queryByLabelText('에이전트'),
    ).toBeNull();
    screen.getByLabelText('Laya URL');
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
    expect(panel.textContent).toContain('라야 상태');
    expect(panel.textContent).toContain('마지막 입력');
    expect(panel.textContent).toContain('마지막 출력');

    // Laya-only: the URL field is always visible, no agent hint is shown.
    screen.getByLabelText('Laya URL');
    expect(screen.queryByText(/라야 에이전트를 선택하면/)).toBeNull();
    screen.getByTestId('laya-status-panel');
  });

  it('offers the benchmark action with progress support', () => {
    setup();
    screen.getByRole('button', { name: '벤치마크 100' });
  });
});
