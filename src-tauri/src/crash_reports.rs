// Structured, per-crash storage for both native panics (`logger.rs`) and
// renderer-side React errors (`commands::diagnostics::record_frontend_error`)
// — replaces the old approach of appending every panic to one single,
// ever-growing `crash.log` text file, which had no rotation, no structure
// (just a human-readable paragraph), and never captured renderer errors at
// all: an `ErrorBoundary` catch went straight to `console.error` and was
// gone the moment the user closed the app, with nothing to look back at
// afterward.
//
// One JSON file per report, named by timestamp, mirrors the official
// desktop client's `appReports.ts` (`uniqueReportPath`) closely enough for
// the same reason: reports can be listed, read, and pruned individually
// instead of grepping through one unbounded log, and a write failure for
// one report can never corrupt or lose any other.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const CRASH_REPORTS_DIR: &str = "crash_reports";

/// Keep at most this many reports on disk — pruning the oldest as new ones
/// come in, so a machine stuck crash-looping doesn't fill the disk with
/// reports nobody's going to read anyway.
const MAX_REPORTS: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashReport {
    /// `"panic"` (native Rust panic, from `logger.rs`) or `"renderer"` (a
    /// React error caught by `ErrorBoundary`).
    pub source: String,
    /// RFC3339 timestamp.
    pub time: String,
    /// Short, human-readable one-liner — a panic message, or an error's
    /// `name: message`.
    pub summary: String,
    /// Full detail — panic payload/location, or a JS stack trace.
    pub details: String,
}

fn reports_dir() -> Option<PathBuf> {
    crate::config::paths::get_log_dir()
        .ok()
        .map(|dir| dir.join(CRASH_REPORTS_DIR))
}

/// Colons aren't valid in Windows filenames — RFC3339 with `-` standing in
/// for `:`/`.` stays lexically sortable and still unambiguous.
fn safe_timestamp_filename(now: chrono::DateTime<chrono::Utc>) -> String {
    now.format("%Y-%m-%dT%H-%M-%S%.3fZ").to_string()
}

/// Write a new crash report to its own file, pruning old ones past
/// `MAX_REPORTS`. Best-effort and infallible by design (returns the written
/// path on success, `None` otherwise) — one call site is inside a panic
/// hook, where anything that can itself fail loudly is a liability, not a
/// feature.
pub fn write(source: &str, summary: &str, details: &str) -> Option<PathBuf> {
    let dir = reports_dir()?;
    std::fs::create_dir_all(&dir).ok()?;

    let now = chrono::Utc::now();
    let report = CrashReport {
        source: source.to_string(),
        time: now.to_rfc3339(),
        summary: summary.to_string(),
        details: details.to_string(),
    };
    let path = dir.join(format!("{}.json", safe_timestamp_filename(now)));
    let content = serde_json::to_string_pretty(&report).ok()?;
    std::fs::write(&path, content).ok()?;

    prune(&dir);
    Some(path)
}

/// Delete the oldest reports beyond `MAX_REPORTS`, if any.
fn prune(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<_> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
        .collect();
    if files.len() <= MAX_REPORTS {
        return;
    }
    // Filenames are timestamp-prefixed, so name order is chronological.
    files.sort_by_key(|e| e.file_name());
    for entry in files.iter().take(files.len() - MAX_REPORTS) {
        let _ = std::fs::remove_file(entry.path());
    }
}

/// List every stored crash report, newest first.
pub fn list() -> Vec<CrashReport> {
    let Some(dir) = reports_dir() else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut reports: Vec<CrashReport> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|content| serde_json::from_str::<CrashReport>(&content).ok())
        .collect();
    reports.sort_by(|a, b| b.time.cmp(&a.time));
    reports
}
