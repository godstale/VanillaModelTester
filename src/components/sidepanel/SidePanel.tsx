import type { SidePanelView } from '@/lib/types/workspaceTab';

export interface SidePanelProps {
  activeView: SidePanelView;
}

// The left panel was removed: the activity bar opens tabs directly and the
// workspace renders only the center area. Kept as a null router so old
// imports keep compiling.
export function SidePanel({ activeView }: SidePanelProps) {
  void activeView;
  return null;
}

export default SidePanel;
