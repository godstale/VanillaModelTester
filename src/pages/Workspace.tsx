import { useRef, useEffect } from 'react';
import { TopMenuBar } from '@/components/layout/TopMenuBar';
import { ActivityBar } from '@/components/layout/ActivityBar';
import { CenterWorkspace } from '@/components/workspace/CenterWorkspace';
import {
  SidePanelProvider,
} from '@/lib/context/SidePanelContext';
import {
  WorkspaceTabsProvider,
  useWorkspaceTabs,
} from '@/lib/context/WorkspaceTabsContext';
import { WorkspaceProvider } from '@/lib/context/WorkspaceContext';
import type { SidePanelView } from '@/lib/types/workspaceTab';
import { GAME_TAB_ID, LAYA_SERVICE_TAB_ID } from '@/lib/types/workspaceTab';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function WorkspaceContent() {
  useKeyboardShortcuts();
  const { t } = useLanguage();
  const { tabs, activeTabId, openTab, isTabsLoaded } = useWorkspaceTabs();
  const autoOpenedRef = useRef(false);

  // Open the Tetris tab on startup when no tabs remain.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!isTabsLoaded) return;
    if (tabs.length === 0) {
      autoOpenedRef.current = true;
      openTab({
        id: GAME_TAB_ID,
        type: 'game',
        title: t('game.title'),
        meta: { sessionId: 'auto' },
      });
    }
  }, [isTabsLoaded, openTab, tabs.length, t]);

  // The activity bar opens tabs directly; there is no left panel.
  const handleActivityBarSelect = (view: Exclude<SidePanelView, null>) => {
    if (view === 'game') {
      openTab({
        id: GAME_TAB_ID,
        type: 'game',
        title: t('game.title'),
        meta: { sessionId: 'auto' },
      });
    } else {
      openTab({
        id: LAYA_SERVICE_TAB_ID,
        type: 'laya-service',
        title: t('layaService.title'),
        meta: {},
      });
    }
  };

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeView: SidePanelView =
    activeTab?.type === 'game'
      ? 'game'
      : activeTab?.type === 'laya-service'
        ? 'laya-service'
        : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background text-foreground">
      <TopMenuBar />
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        <ActivityBar
          activeView={activeView}
          onSelect={handleActivityBarSelect}
        />
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          <CenterWorkspace />
        </div>
      </div>
    </div>
  );
}

export function Workspace() {
  return (
    <WorkspaceProvider>
      <WorkspaceTabsProvider>
        <SidePanelProvider>
          <WorkspaceContent />
        </SidePanelProvider>
      </WorkspaceTabsProvider>
    </WorkspaceProvider>
  );
}

export default Workspace;
