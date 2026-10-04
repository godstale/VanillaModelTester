export type WorkspaceTabType = 'editor' | 'image-viewer' | 'welcome';

export type SidePanelView = 'explorer' | null;

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  title: string;
  meta?: Record<string, unknown>;
  pane?: 'primary' | 'secondary';
}
