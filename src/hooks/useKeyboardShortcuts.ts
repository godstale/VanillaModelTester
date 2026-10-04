import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useSidePanel } from '@/lib/context/SidePanelContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { GAME_TAB_ID } from '@/lib/types/workspaceTab';

export interface KeyboardShortcutHandlers {
  onNewTab?: () => void;
  onCloseCurrentTab?: () => void;
  onOpenSettings?: () => void;
  onToggleSidebar?: () => void;
  onEscape?: () => void;
}

// Global shortcuts:
// - Ctrl/Cmd+N: open a welcome tab
// - Ctrl/Cmd+W: close the active tab
// - Ctrl/Cmd+B: toggle the side panel
// - Ctrl/Cmd+Shift+E: open the explorer panel
// - Ctrl/Cmd+,: open settings
export function useKeyboardShortcuts(
  customHandlers?: KeyboardShortcutHandlers,
): void {
  const navigate = useNavigate();
  const { activeTabId, closeTab, openTab } = useWorkspaceTabs();
  const { togglePanel } = useSidePanel();
  const { t } = useLanguage();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        if (customHandlers?.onNewTab) {
          customHandlers.onNewTab();
        } else {
          openTab({ type: 'welcome', title: t('workspace.welcomeTitle') });
        }
        return;
      }

      if (isMod && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (customHandlers?.onCloseCurrentTab) {
          customHandlers.onCloseCurrentTab();
        } else if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }

      if (isMod && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (customHandlers?.onToggleSidebar) {
          customHandlers.onToggleSidebar();
        } else {
          togglePanel();
        }
        return;
      }

      if (isMod && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        openTab({
          id: GAME_TAB_ID,
          type: 'game',
          title: t('game.title'),
          meta: { sessionId: 'auto' },
        });
        return;
      }

      if (isMod && e.key === ',') {
        e.preventDefault();
        if (customHandlers?.onOpenSettings) {
          customHandlers.onOpenSettings();
        } else {
          navigate('/settings');
        }
        return;
      }

      if (e.key === 'Escape') {
        customHandlers?.onEscape?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    customHandlers,
    navigate,
    activeTabId,
    closeTab,
    openTab,
    togglePanel,
    t,
  ]);
}
