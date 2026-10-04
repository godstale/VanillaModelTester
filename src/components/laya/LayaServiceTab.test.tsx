import { describe, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { LayaServiceTab } from '@/components/laya/LayaServiceTab';
import type { WorkspaceTab } from '@/lib/types/workspaceTab';

function setup() {
  const tab: WorkspaceTab = {
    id: 'laya-service:main',
    type: 'laya-service',
    title: 'Laya Service',
    meta: {},
  };
  return render(
    <LanguageProvider>
      <LayaServiceTab tab={tab} />
    </LanguageProvider>,
  );
}

describe('LayaServiceTab', () => {
  it('explains web preview limits when Tauri is unavailable', () => {
    setup();
    // jsdom has no Tauri runtime, so the fallback notice is shown.
    screen.getByText(/웹 미리보기에서는/);
  });
});
