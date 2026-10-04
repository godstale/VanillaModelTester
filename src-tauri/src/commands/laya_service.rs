use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const MAX_LOG_LINES: usize = 2000;
const DEFAULT_PORT: u16 = 8000;

/// Managed `laya-serve` child process plus its captured output.
///
/// Only servers started through `laya_start` are managed here. A server the
/// user launched from an external terminal keeps working (the game tab talks
/// to it over HTTP), but this module cannot stop it or read its logs.
pub struct LayaServiceState {
    inner: Mutex<LayaServiceInner>,
    logs: Arc<Mutex<VecDeque<String>>>,
}

struct LayaServiceInner {
    child: Option<Child>,
    pid: Option<u32>,
    port: u16,
    started_at_ms: Option<u64>,
}

impl LayaServiceState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(LayaServiceInner {
                child: None,
                pid: None,
                port: DEFAULT_PORT,
                started_at_ms: None,
            }),
            logs: Arc::new(Mutex::new(VecDeque::new())),
        }
    }
}

impl Default for LayaServiceState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct LayaStatus {
    pub running: bool,
    pub managed: bool,
    pub pid: Option<u32>,
    pub port: u16,
    pub uptime_secs: Option<u64>,
    pub log_lines: usize,
    pub bin: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn push_log(logs: &Arc<Mutex<VecDeque<String>>>, line: String) {
    if let Ok(mut guard) = logs.lock() {
        if guard.len() >= MAX_LOG_LINES {
            guard.pop_front();
        }
        guard.push_back(line);
    }
}

/// Candidate `laya-serve` executables, best first.
///
/// 1. `LAYA_SERVE_BIN` env var (explicit override, also useful in tests).
/// 2. `<ancestor>/.venv-laya/Scripts/laya-serve.exe` (Windows) or
///    `<ancestor>/.venv-laya/bin/laya-serve` (Unix), walking up from the
///    current executable and the working directory (dev layout).
/// 3. Plain `laya-serve` from `PATH` (last resort, may fail to spawn).
fn candidate_bins() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Ok(p) = std::env::var("LAYA_SERVE_BIN") {
        if !p.trim().is_empty() {
            out.push(p);
        }
    }

    #[cfg(target_os = "windows")]
    let rel: Vec<&str> = vec![".venv-laya", "Scripts", "laya-serve.exe"];
    #[cfg(not(target_os = "windows"))]
    let rel: Vec<&str> = vec![".venv-laya", "bin", "laya-serve"];

    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        roots.extend(exe.ancestors().take(6).map(|p| p.to_path_buf()));
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.extend(cwd.ancestors().take(4).map(|p| p.to_path_buf()));
    }
    for root in roots {
        let mut p = root;
        for part in &rel {
            p = p.join(part);
        }
        out.push(p.to_string_lossy().to_string());
    }

    out.push("laya-serve".to_string());
    out
}

fn resolve_bin() -> Result<String, String> {
    for candidate in candidate_bins() {
        if candidate == "laya-serve" {
            // PATH lookup: accept it as a last resort.
            return Ok(candidate);
        }
        if std::path::Path::new(&candidate).is_file() {
            return Ok(candidate);
        }
    }
    Err("laya-serve executable not found. Set LAYA_SERVE_BIN or start laya-serve from an external terminal.".to_string())
}

/// Reap a finished child and record its exit in the log ring.
fn reap_if_exited(inner: &mut LayaServiceInner, logs: &Arc<Mutex<VecDeque<String>>>) {
    if let Some(child) = inner.child.as_mut() {
        match child.try_wait() {
            Ok(Some(status)) => {
                push_log(logs, format!("[laya] process exited: {status}"));
                inner.child = None;
                inner.pid = None;
                inner.started_at_ms = None;
            }
            Ok(None) => {}
            Err(e) => {
                push_log(logs, format!("[laya] status check failed: {e}"));
            }
        }
    }
}

fn snapshot(
    inner: &LayaServiceInner,
    logs: &Arc<Mutex<VecDeque<String>>>,
    bin: String,
) -> LayaStatus {
    let running = inner.child.is_some();
    let uptime_secs = match (running, inner.started_at_ms) {
        (true, Some(start)) => Some(now_ms().saturating_sub(start) / 1000),
        _ => None,
    };
    let log_lines = logs.lock().map(|g| g.len()).unwrap_or(0);
    LayaStatus {
        running,
        managed: running,
        pid: inner.pid,
        port: inner.port,
        uptime_secs,
        log_lines,
        bin,
    }
}

fn spawn_pipe_reader<R>(stream: R, prefix: &'static str, logs: Arc<Mutex<VecDeque<String>>>)
where
    R: std::io::Read + Send + 'static,
{
    std::thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            match line {
                Ok(text) => push_log(&logs, format!("[laya:{prefix}] {text}")),
                Err(_) => break,
            }
        }
    });
}

#[tauri::command]
pub async fn laya_start(
    state: tauri::State<'_, LayaServiceState>,
    port: Option<u16>,
) -> Result<LayaStatus, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    if port == 0 {
        return Err("invalid port: must be 1-65535".to_string());
    }

    let mut inner = state
        .inner
        .lock()
        .map_err(|e| format!("laya state is poisoned: {e}"))?;
    reap_if_exited(&mut inner, &state.logs);
    if inner.child.is_some() {
        return Ok(snapshot(&inner, &state.logs, current_bin_label()));
    }

    let bin = resolve_bin()?;
    push_log(
        &state.logs,
        format!("[laya] starting {bin} on 127.0.0.1:{port}"),
    );

    let mut cmd = Command::new(&bin);
    cmd.env("LAYA_HOST", "127.0.0.1")
        .env("LAYA_PORT", port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    // Detached enough for a dev server: no console window, own process group
    // semantics come from kill() on stop.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW so no extra console pops up next to the app.
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!("failed to start {bin}: {e}. Is another server already on port {port}?")
    })?;
    let pid = child.id();

    if let Some(stdout) = child.stdout.take() {
        spawn_pipe_reader(stdout, "out", Arc::clone(&state.logs));
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_pipe_reader(stderr, "err", Arc::clone(&state.logs));
    }

    inner.child = Some(child);
    inner.pid = Some(pid);
    inner.port = port;
    inner.started_at_ms = Some(now_ms());
    Ok(snapshot(&inner, &state.logs, bin))
}

fn current_bin_label() -> String {
    resolve_bin().unwrap_or_else(|_| "laya-serve".to_string())
}

#[tauri::command]
pub async fn laya_stop(state: tauri::State<'_, LayaServiceState>) -> Result<LayaStatus, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|e| format!("laya state is poisoned: {e}"))?;
    reap_if_exited(&mut inner, &state.logs);
    if let Some(mut child) = inner.child.take() {
        push_log(&state.logs, "[laya] stopping server".to_string());
        // Best effort: kill, then reap so the pid is not left as a zombie.
        let _ = child.kill();
        let _ = child.wait();
        inner.pid = None;
        inner.started_at_ms = None;
    }
    Ok(snapshot(&inner, &state.logs, current_bin_label()))
}

#[tauri::command]
pub async fn laya_status(
    state: tauri::State<'_, LayaServiceState>,
) -> Result<LayaStatus, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|e| format!("laya state is poisoned: {e}"))?;
    reap_if_exited(&mut inner, &state.logs);
    Ok(snapshot(&inner, &state.logs, current_bin_label()))
}

#[tauri::command]
pub async fn laya_logs(
    state: tauri::State<'_, LayaServiceState>,
    tail: Option<usize>,
) -> Result<Vec<String>, String> {
    let guard = state
        .logs
        .lock()
        .map_err(|e| format!("laya log buffer is poisoned: {e}"))?;
    let n = tail.unwrap_or(200).clamp(1, MAX_LOG_LINES);
    let len = guard.len();
    let from = len.saturating_sub(n);
    Ok(guard.iter().skip(from).cloned().collect())
}
