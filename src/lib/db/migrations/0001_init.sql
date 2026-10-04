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
CREATE TABLE IF NOT EXISTS sim_episodes (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  seed INTEGER NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0,
  lines INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  pieces INTEGER NOT NULL DEFAULT 0,
  decisions INTEGER NOT NULL DEFAULT 0,
  fallbacks INTEGER NOT NULL DEFAULT 0,
  avg_confidence REAL,
  avg_latency_ms REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS sim_steps (
  episode_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  state_text TEXT DEFAULT '',
  candidates_text TEXT DEFAULT '',
  chosen TEXT NOT NULL,
  confidence REAL NOT NULL,
  latency_ms INTEGER DEFAULT 0,
  PRIMARY KEY (episode_id, step_index)
);
CREATE INDEX IF NOT EXISTS idx_sim_episodes_agent ON sim_episodes(agent);
