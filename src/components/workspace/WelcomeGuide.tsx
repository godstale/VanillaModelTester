import {
  FolderOpen,
  Clock,
  Files,
  Columns2,
  Languages,
  ArrowRight,
  Gamepad2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMark } from '@/components/brand/AppMark';
import { APP_NAME } from '@/lib/brand';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { invoke } from '@tauri-apps/api/core';

// Shown when no folder is open, and in `welcome` tabs.
// Replace the highlight cards with your own feature tour.
export function WelcomeGuide() {
  const { t } = useLanguage();
  const { setWorkspaceRoot, recentWorkspaces } = useWorkspace();
  const { openTab } = useWorkspaceTabs();

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

  const handleOpenGame = () => {
    const sessionId = String(Date.now());
    openTab({
      id: `game:${sessionId}`,
      type: 'game',
      title: t('game.title'),
      meta: { sessionId },
    });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto flex flex-col items-center justify-center p-8 select-none bg-editor text-foreground">
      <div className="max-w-xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-200">
        <div className="text-center space-y-3">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-card border border-border items-center justify-center text-brand shadow-sm">
            <AppMark className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {t('welcome.subtitle')}
            <br />
            {t('welcome.guide')}
          </p>
        </div>

        <div className="border border-border/80 rounded-2xl bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <FolderOpen className="h-4 w-4 text-warning" />
              {t('welcome.openTitle')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('welcome.openDesc')}
            </p>
          </div>

          <Button
            size="lg"
            onClick={() => void handlePickFolder()}
            className="w-full h-11 gap-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
          >
            <FolderOpen className="h-4 w-4" />
            <span>{t('welcome.pickFolder')}</span>
            <ArrowRight className="h-4 w-4 ml-auto opacity-70" />
          </Button>

          <Button
            size="lg"
            variant="outline"
            onClick={handleOpenGame}
            className="w-full h-11 gap-2 text-sm font-semibold transition-all shadow-sm"
          >
            <Gamepad2 className="h-4 w-4" />
            <span>{t('game.openGame')}</span>
            <ArrowRight className="h-4 w-4 ml-auto opacity-70" />
          </Button>

          {recentWorkspaces.length > 0 && (
            <div className="pt-3 border-t border-border/60 space-y-2">
              <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{t('welcome.recent')}</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {recentWorkspaces.slice(0, 5).map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setWorkspaceRoot(path)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-muted/60 transition-colors text-left group border border-transparent hover:border-border/60"
                  >
                    <span className="font-mono truncate text-foreground text-[11px]">
                      {path}
                    </span>
                    <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                      {t('welcome.open')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3.5 rounded-xl border border-border/50 bg-card/40 space-y-1">
            <Files className="h-4 w-4 text-primary mx-auto" />
            <div className="text-[11px] font-semibold text-foreground">
              {t('welcome.localFiles')}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t('welcome.localFilesDesc')}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-border/50 bg-card/40 space-y-1">
            <Columns2 className="h-4 w-4 text-success mx-auto" />
            <div className="text-[11px] font-semibold text-foreground">
              {t('welcome.splitView')}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t('welcome.splitViewDesc')}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-border/50 bg-card/40 space-y-1">
            <Languages className="h-4 w-4 text-warning mx-auto" />
            <div className="text-[11px] font-semibold text-foreground">
              {t('welcome.bilingual')}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t('welcome.bilingualDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
