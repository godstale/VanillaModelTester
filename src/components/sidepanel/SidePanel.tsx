import type { SidePanelView } from '@/lib/types/workspaceTab';
import { FileTree } from '@/components/explorer/FileTree';

export interface SidePanelProps {
  activeView: SidePanelView;
}

// Thin router: renders one panel per active view.
export function SidePanel({ activeView }: SidePanelProps) {
  if (!activeView) {
    return null;
  }

  switch (activeView) {
    case 'explorer':
      return <FileTree />;
    default:
      return null;
  }
}

export default SidePanel;
