import { useMemo } from 'react';
import {
  FolderOpen,
  Settings,
  Minus,
  Square,
  X,
  PanelLeft,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { AppMark } from '@/components/brand/AppMark';
import { APP_NAME } from '@/lib/brand';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import { useSidePanel } from '@/lib/context/SidePanelContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function TopMenuBar() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { workspaceRoot, setWorkspaceRoot, recentWorkspaces } = useWorkspace();
  const { togglePanel } = useSidePanel();
  const folderName = useMemo(() => {
    if (!workspaceRoot) return '';
    const parts = workspaceRoot.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] ?? workspaceRoot;
  }, [workspaceRoot]);

  const handlePickFolder = async () => {
    try {
      const picked = await invoke<string | null>('pick_project_folder');
      if (picked) {
        setWorkspaceRoot(picked);
      }
    } catch (err) {
      console.error('Failed to pick project folder:', err);
    }
  };

  const win = () => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="h-10 shrink-0 flex items-center gap-1 px-2 bg-titlebar border-b border-border select-none"
    >
      <div className="flex items-center gap-1.5 pr-2">
        <AppMark compact className="h-4 w-4 text-brand" />
        <span className="text-[11px] font-semibold tracking-tight">
          {APP_NAME}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]"
          >
            {t('topMenu.file')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-[11px]">
          <DropdownMenuItem
            onClick={() => void handlePickFolder()}
            className="gap-2 cursor-pointer text-[11px]"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>{t('topMenu.openFolder')}</span>
          </DropdownMenuItem>
          {recentWorkspaces.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {recentWorkspaces.slice(0, 5).map((path) => (
                <DropdownMenuItem
                  key={path}
                  onClick={() => setWorkspaceRoot(path)}
                  className="cursor-pointer text-[11px] font-mono max-w-72 truncate"
                >
                  {path}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]"
          >
            {t('topMenu.view')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-[11px]">
          <DropdownMenuItem
            onClick={() => togglePanel()}
            className="gap-2 cursor-pointer text-[11px]"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            <span>{t('topMenu.toggleSidebar')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigate('/settings')}
            className="gap-2 cursor-pointer text-[11px]"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>{t('topMenu.settings')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1 min-w-0 flex items-center justify-center">
        {folderName && (
          <span className="text-[11px] text-muted-foreground font-mono truncate max-w-96">
            {folderName}
          </span>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('/settings')}
        title={t('topMenu.settings')}
        className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]"
      >
        <Settings className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-0.5 pl-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void win()?.minimize()}
          title={t('topMenu.minimize')}
          className="h-7 w-8 rounded-none text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void win()?.toggleMaximize()}
          title={t('topMenu.maximize')}
          className="h-7 w-8 rounded-none text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]"
        >
          <Square className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void win()?.close()}
          title={t('topMenu.close')}
          className="h-7 w-8 rounded-none text-muted-foreground hover:text-white hover:bg-red-600"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
