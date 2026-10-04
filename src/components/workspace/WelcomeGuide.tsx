import { ArrowRight, Gamepad2, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMark } from '@/components/brand/AppMark';
import { APP_NAME } from '@/lib/brand';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  GAME_TAB_ID,
  LAYA_SERVICE_TAB_ID,
} from '@/lib/types/workspaceTab';

// Home screen shown when no tabs are open (and in `welcome` tabs).
export function WelcomeGuide() {
  const { t } = useLanguage();
  const { openTab } = useWorkspaceTabs();

  const handleOpenGame = () => {
    openTab({
      id: GAME_TAB_ID,
      type: 'game',
      title: t('game.title'),
      meta: { sessionId: 'auto' },
    });
  };

  const handleOpenService = () => {
    openTab({
      id: LAYA_SERVICE_TAB_ID,
      type: 'laya-service',
      title: t('layaService.title'),
      meta: {},
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

        <div className="border border-border/80 rounded-2xl bg-card p-6 shadow-sm space-y-3">
          <Button
            size="lg"
            onClick={handleOpenGame}
            className="w-full h-11 gap-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
          >
            <Gamepad2 className="h-4 w-4" />
            <span>{t('game.openGame')}</span>
            <ArrowRight className="h-4 w-4 ml-auto opacity-70" />
          </Button>

          <Button
            size="lg"
            variant="outline"
            onClick={handleOpenService}
            className="w-full h-11 gap-2 text-sm font-semibold transition-all shadow-sm"
          >
            <Server className="h-4 w-4" />
            <span>{t('layaService.open')}</span>
            <ArrowRight className="h-4 w-4 ml-auto opacity-70" />
          </Button>
        </div>
      </div>
    </div>
  );
}
