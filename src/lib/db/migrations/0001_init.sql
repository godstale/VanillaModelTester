CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  open_tabs TEXT NOT NULL DEFAULT '[]',
  active_tab_id TEXT,
  theme TEXT NOT NULL DEFAULT 'light',
  language TEXT NOT NULL DEFAULT 'ko',
  enabled_extensions TEXT NOT NULL DEFAULT '[]',
  trusted_workspaces TEXT NOT NULL DEFAULT '[]',
  last_workspace_root TEXT
);
