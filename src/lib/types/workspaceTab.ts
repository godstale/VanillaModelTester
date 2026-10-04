export type WorkspaceTabType =
  | 'editor'
  | 'image-viewer'
  | 'welcome'
  | 'game'
  | 'laya-service';

// The left panel is gone: the activity bar opens tabs directly.
// The type remains so the activity bar selection stays serializable.
export type SidePanelView = 'game' | 'laya-service' | null;

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  title: string;
  meta?: Record<string, unknown>;
  pane?: 'primary' | 'secondary';
}

// Idempotent ids for the two first-class tabs opened from the activity bar.
export const GAME_TAB_ID = 'game:auto';
export const LAYA_SERVICE_TAB_ID = 'laya-service:main';
