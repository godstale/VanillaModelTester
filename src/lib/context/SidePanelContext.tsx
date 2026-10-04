import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import type { SidePanelView } from '@/lib/types/workspaceTab';

export interface SidePanelContextValue {
  activeView: SidePanelView;
  setActiveView: (view: SidePanelView) => void;
  toggleView: (view: Exclude<SidePanelView, null>) => void;
  /** Shared handle of the resizable side panel (registered by Workspace page). */
  panelRef: React.RefObject<ImperativePanelHandle | null>;
  /** Collapse the panel if open, otherwise expand it with the last view. */
  togglePanel: () => void;
}

const SidePanelContext = createContext<SidePanelContextValue | undefined>(
  undefined,
);

export function SidePanelProvider({
  children,
  initialView = null,
}: {
  children: React.ReactNode;
  initialView?: SidePanelView;
}) {
  const panelRef = useRef<ImperativePanelHandle | null>(null);

  const [internalView, setInternalView] = useState<SidePanelView>(
    () => initialView,
  );

  const activeView: SidePanelView = internalView;

  const handleSetActiveView = useCallback((view: SidePanelView) => {
    setInternalView(view);
  }, []);

  const toggleView = useCallback(
    (view: Exclude<SidePanelView, null>) => {
      setInternalView((prev) => (prev === view ? null : view));
    },
    [],
  );

  const togglePanel = useCallback(() => {
    // No visible panel remains; toggling only flips the selection state.
    setInternalView((prev) => (prev ? null : 'game'));
  }, []);

  return (
    <SidePanelContext.Provider
      value={{
        activeView,
        setActiveView: handleSetActiveView,
        toggleView,
        panelRef,
        togglePanel,
      }}
    >
      {children}
    </SidePanelContext.Provider>
  );
}

export function useSidePanel(): SidePanelContextValue {
  const ctx = useContext(SidePanelContext);
  if (!ctx) {
    throw new Error('useSidePanel must be used within a SidePanelProvider');
  }
  return ctx;
}
