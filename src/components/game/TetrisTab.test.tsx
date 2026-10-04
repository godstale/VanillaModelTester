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
});
