use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

use crate::crash_reports;

/// `tracing-appender`'s non-blocking file writer only flushes for as long
/// as this guard is alive — dropping it (e.g. if it were a local in
/// `init_tracing`) would silently stop file logging the moment that
/// function returned. Kept for the whole process lifetime instead.
static APPENDER_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

/// Keep at most this many daily log files on disk — mirrors
/// `crash_reports::MAX_REPORTS`'s reasoning: a long-running install
/// shouldn't accumulate an ever-growing pile of files nobody's going to
/// read, most of which (past a couple of weeks) nobody's going to want
/// even if they did look.
const MAX_LOG_FILES: usize = 14;

/// Initialize structured, leveled application logging — call once, at the
/// very start of `main()`, before anything else that might log. Writes to
/// a daily-rotating file under `config::paths::get_log_dir()` (the same
/// directory `crash_reports` and the daemon's own logs live under) at
/// `info` level by default, overridable via the `RUST_LOG` environment
/// variable (`tracing_subscriber`'s usual convention — e.g.
/// `RUST_LOG=debug`). A debug build also mirrors every event to stdout,
/// since that's normally launched from a terminal anyway. Old files beyond
/// `MAX_LOG_FILES` are pruned automatically — by `tracing-appender` itself
/// (`Builder::max_log_files`), both right here at startup and again on
/// every later rollover — so this doesn't need its own prune pass the way
/// `crash_reports::write` does.
///
/// Replaces the `println!`/`eprintln!` calls that used to be this app's
/// entire logging story: none of them carried a severity level, none of
/// them survived past whatever terminal (if any) happened to be attached
/// when they ran, and none of them rotated — a long-running install could
/// only ever explain what was happening *right now*, never what had
/// happened yesterday when a user reports something went wrong.
pub fn init_tracing() {
    let filter = || EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    let log_dir = match crate::config::paths::get_log_dir() {
        Ok(dir) => dir,
        Err(e) => {
            // Can't set up file logging without a log directory — fall
            // back to stderr-only rather than not logging at all.
            eprintln!(
                "Warning: failed to resolve log directory, logging to stderr only: {:?}",
                e
            );
            let _ = tracing_subscriber::fmt().with_env_filter(filter()).try_init();
            return;
        }
    };

    let file_appender = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("fresh-box.log")
        .max_log_files(MAX_LOG_FILES)
        .build(&log_dir);
    let file_appender = match file_appender {
        Ok(appender) => appender,
        Err(e) => {
            eprintln!(
                "Warning: failed to initialize log file rotation, logging to stderr only: {}",
                e
            );
            let _ = tracing_subscriber::fmt().with_env_filter(filter()).try_init();
            return;
        }
    };
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    let _ = APPENDER_GUARD.set(guard);

    let file_layer = tracing_subscriber::fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false);

    let registry = tracing_subscriber::registry().with(filter()).with(file_layer);

    let result = if cfg!(debug_assertions) {
        registry.with(tracing_subscriber::fmt::layer()).try_init()
    } else {
        registry.try_init()
    };
    if let Err(e) = result {
        eprintln!("Warning: failed to install tracing subscriber: {e}");
    }
}

/// Guards against re-entering the hook (e.g. a panic while formatting/
/// writing the crash log, or while `MessageBoxW` is up) — mirrors the
/// official Electron client's `handlingFatalError` guard in `index.ts`'s
/// `handleFatal`.
static HANDLING_PANIC: AtomicBool = AtomicBool::new(false);

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        if HANDLING_PANIC.swap(true, Ordering::SeqCst) {
            std::process::exit(1);
        }

        let summary = panic_info.to_string();
        let details = format!(
            "{summary}\n\nLocation: {}",
            panic_info
                .location()
                .map(|l| l.to_string())
                .unwrap_or_else(|| "<unknown>".to_string())
        );

        // `crash_reports::write` needs `config::paths::get_log_dir()` (not
        // exe-relative — the app installs per-machine into an
        // admin-protected Program Files directory, see
        // `config::paths::get_app_data_root`, which an unelevated process
        // can't write into) and can fail for the same reasons any file I/O
        // can. Fall back to a single best-effort temp-dir text file in that
        // case, purely so the user has *something* to find — this is not
        // the normal path.
        let report_path = crash_reports::write("panic", &summary, &details);
        let display_path = report_path.clone().unwrap_or_else(|| {
            let fallback = std::env::temp_dir().join("fresh-box-crash.log");
            let _ = std::fs::write(&fallback, &details);
            fallback
        });

        eprintln!("Application crashed: {summary}");
        tracing::error!(%summary, "application panicked");

        show_crash_dialog(&summary, &display_path);

        // A Rust panic on any one thread only unwinds *that* thread by
        // default — every other task (including whatever's driving the UI)
        // just keeps running, silently missing whatever the panicked task
        // was responsible for (a stream handler that quietly stops
        // updating forever is exactly the kind of "state silently drifts
        // out of sync with reality" failure this app has had more than
        // enough of). Mirrors the official client's `handleFatal`
        // (`index.ts`), which treats any uncaught exception the same way:
        // show the user what happened, then exit cleanly rather than limp
        // along in a state nothing accounted for.
        std::process::exit(1);
    }));
}

/// Best-effort, deliberately independent of whether Tauri/the webview is in
/// any usable state — a raw `MessageBoxW` needs no window handle and pumps
/// its own tiny message loop, so it still works when called from a
/// background thread, or before/after the app's own windows exist.
#[cfg(target_os = "windows")]
fn show_crash_dialog(reason: &str, log_path: &std::path::Path) {
    use windows::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MB_TOPMOST, MessageBoxW};
    use windows::core::HSTRING;

    let message = format!(
        "fresh-box has stopped unexpectedly and needs to close.\n\n{reason}\n\nCrash details were saved to:\n{}",
        log_path.display()
    );
    let text = HSTRING::from(message);
    let caption = HSTRING::from("fresh-box");
    unsafe {
        let _ = MessageBoxW(None, &text, &caption, MB_OK | MB_ICONERROR | MB_TOPMOST);
    }
}

#[cfg(not(target_os = "windows"))]
fn show_crash_dialog(_reason: &str, _log_path: &std::path::Path) {}
