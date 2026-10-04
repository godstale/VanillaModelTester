import { Settings, Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AppMark } from '@/components/brand/AppMark';
import { APP_NAME } from '@/lib/brand';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function TopMenuBar() {
  const { t } = useLanguage();
  const navigate = useNavigate();

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

      <div className="flex-1 min-w-0" />

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
