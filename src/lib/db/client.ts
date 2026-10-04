import Database, { type QueryResult } from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

export interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<QueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  close?(db?: string): Promise<boolean>;
}

export const MIGRATION_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    open_tabs TEXT NOT NULL DEFAULT '[]',
    active_tab_id TEXT,
    theme TEXT NOT NULL DEFAULT 'light',
    language TEXT NOT NULL DEFAULT 'ko',
    enabled_extensions TEXT NOT NULL DEFAULT '[]',
    trusted_workspaces TEXT NOT NULL DEFAULT '[]',
    last_workspace_root TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sim_episodes (
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
  )`,
  `CREATE TABLE IF NOT EXISTS sim_steps (
    episode_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    state_text TEXT DEFAULT '',
    candidates_text TEXT DEFAULT '',
    chosen TEXT NOT NULL,
    confidence REAL NOT NULL,
    latency_ms INTEGER DEFAULT 0,
    PRIMARY KEY (episode_id, step_index)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sim_episodes_agent ON sim_episodes(agent)`,
];

type Row = Record<string, unknown>;

function norm(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

// Minimal in-memory SQL interpreter for tests and `pnpm dev` web preview.
// Supports exactly the statements this template issues (see repositories/).
export class MemorySqlFallback implements SqlDatabase {
  private tables = new Map<string, Map<string, Row>>();

  constructor() {
    this.tables.set('app_settings', new Map());
    this.tables.set('sim_episodes', new Map());
    this.tables.set('sim_steps', new Map());
  }

  async execute(
    query: string,
    bindValues: unknown[] = [],
  ): Promise<QueryResult> {
    const q = norm(query);
    if (
      q.startsWith('CREATE TABLE') ||
      q.startsWith('CREATE UNIQUE INDEX') ||
      q.startsWith('CREATE INDEX')
    ) {
      return { rowsAffected: 0 };
    }
    if (q.startsWith('INSERT INTO app_settings')) {
      const [
        id,
        open_tabs,
        active_tab_id,
        theme,
        language,
        enabled_extensions,
        trusted_workspaces,
        last_workspace_root,
      ] = bindValues;
      this.tables.get('app_settings')?.set(id as string, {
        id,
        open_tabs,
        active_tab_id,
        theme,
        language,
        enabled_extensions,
        trusted_workspaces,
        last_workspace_root,
      });
      return { rowsAffected: 1 };
    }
    if (q.startsWith('UPDATE app_settings SET')) {
      const [
        open_tabs,
        active_tab_id,
        theme,
        language,
        enabled_extensions,
        trusted_workspaces,
        last_workspace_root,
      ] = bindValues;
      const row = this.tables.get('app_settings')?.get('singleton');
      if (row) {
        Object.assign(row, {
          open_tabs,
          active_tab_id,
          theme,
          language,
          enabled_extensions,
          trusted_workspaces,
          last_workspace_root,
        });
      }
      return { rowsAffected: 1 };
    }
    if (q.startsWith('INSERT INTO sim_episodes')) {
      const [
        id,
        agent,
        seed,
        steps,
        lines,
        score,
        pieces,
        decisions,
        fallbacks,
        avg_confidence,
        avg_latency_ms,
        duration_ms,
        ended_at,
      ] = bindValues;
      this.tables.get('sim_episodes')?.set(id as string, {
        id,
        agent,
        seed,
        steps,
        lines,
        score,
        pieces,
        decisions,
        fallbacks,
        avg_confidence,
        avg_latency_ms,
        duration_ms,
        ended_at,
      });
      return { rowsAffected: 1 };
    }
    if (q.startsWith('INSERT INTO sim_steps')) {
      const [
        episode_id,
        step_index,
        state_text,
        candidates_text,
        chosen,
        confidence,
        latency_ms,
      ] = bindValues;
      this.tables.get('sim_steps')?.set(
        `${episode_id as string}:${step_index as number}`,
        {
          episode_id,
          step_index,
          state_text,
          candidates_text,
          chosen,
          confidence,
          latency_ms,
        },
      );
      return { rowsAffected: 1 };
    }
    throw new Error(
      `MemorySqlFallback: unsupported statement: ${q.slice(0, 80)}`,
    );
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    const q = norm(query);
    if (q.startsWith("SELECT * FROM app_settings WHERE id = 'singleton'")) {
      return Array.from(this.tables.get('app_settings')?.values() ?? []) as T;
    }
    if (q.includes('FROM sim_episodes')) {
      const [agent] = bindValues;
      const rows = Array.from(this.tables.get('sim_episodes')?.values() ?? []);
      return rows.filter((row) => row.agent === agent) as T;
    }
    if (q.includes('FROM sim_steps')) {
      const [episodeId] = bindValues;
      const rows = Array.from(this.tables.get('sim_steps')?.values() ?? [])
        .filter((row) => row.episode_id === episodeId)
        .sort(
          (a, b) => Number(a.step_index ?? 0) - Number(b.step_index ?? 0),
        );
      return rows as T;
    }
    throw new Error(`MemorySqlFallback: unsupported query: ${q.slice(0, 80)}`);
  }
}

let activeWorkspaceRoot: string | null = null;
let mockDb: SqlDatabase | null = null;
let globalDb: SqlDatabase | null = null;
let globalMigrationDone = false;
const projectDbs = new Map<string, SqlDatabase>();

export function setActiveWorkspaceRoot(root: string | null): void {
  activeWorkspaceRoot = root;
}

export function getActiveWorkspaceRoot(): string | null {
  return activeWorkspaceRoot;
}

export function setDatabase(db: SqlDatabase | null): void {
  mockDb = db;
}

export async function runMigrations(db: SqlDatabase): Promise<void> {
  for (const stmt of MIGRATION_STATEMENTS) {
    await db.execute(stmt);
  }
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getGlobalDatabase(): Promise<SqlDatabase> {
  if (mockDb) {
    if (!globalMigrationDone) {
      await runMigrations(mockDb);
      globalMigrationDone = true;
    }
    return mockDb;
  }
  if (globalDb) {
    if (!globalMigrationDone) {
      await runMigrations(globalDb);
      globalMigrationDone = true;
    }
    return globalDb;
  }
  if (!isTauriEnvironment()) {
    globalDb = new MemorySqlFallback();
    await runMigrations(globalDb);
    globalMigrationDone = true;
    return globalDb;
  }
  const db = await Database.load('sqlite:app.db');
  globalDb = db;
  await runMigrations(db);
  globalMigrationDone = true;
  return db;
}

export async function getProjectDatabase(
  workspaceRoot?: string | null,
): Promise<SqlDatabase> {
  if (mockDb) {
    if (!globalMigrationDone) {
      await runMigrations(mockDb);
      globalMigrationDone = true;
    }
    return mockDb;
  }
  const root =
    workspaceRoot ??
    activeWorkspaceRoot ??
    (typeof window !== 'undefined'
      ? localStorage.getItem('wt_current_workspace_root')
      : null);
  if (!root) {
    return getGlobalDatabase();
  }
  const cached = projectDbs.get(root);
  if (cached) {
    return cached;
  }
  if (!isTauriEnvironment()) {
    const memDb = new MemorySqlFallback();
    await runMigrations(memDb);
    projectDbs.set(root, memDb);
    return memDb;
  }
  try {
    await invoke('ensure_app_dir', { workspaceRoot: root });
  } catch (err) {
    console.warn(
      'ensure_app_dir invoke failed, proceeding with Database.load:',
      err,
    );
  }
  const normalized = root.replace(/\\/g, '/');
  const db = await Database.load(`sqlite:${normalized}/.app-data/app.db`);
  await runMigrations(db);
  projectDbs.set(root, db);
  return db;
}

export async function getDatabase(
  workspaceRoot?: string | null,
): Promise<SqlDatabase> {
  if (mockDb) {
    if (!globalMigrationDone) {
      await runMigrations(mockDb);
      globalMigrationDone = true;
    }
    return mockDb;
  }
  const root =
    workspaceRoot ??
    activeWorkspaceRoot ??
    (typeof window !== 'undefined'
      ? localStorage.getItem('wt_current_workspace_root')
      : null);
  if (root) {
    return getProjectDatabase(root);
  }
  return getGlobalDatabase();
}
