use std::sync::atomic::{AtomicBool, Ordering};

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

        // Deliberately not exe-relative — the app installs per-machine
        // into an admin-protected Program Files directory (see
        // `config::paths::get_app_data_root`), which an unelevated
        // process can't write into.
        let log_dir = crate::config::paths::get_log_dir().ok();
        let log_path = match &log_dir {
            Some(dir) => dir.join("crash.log"),
            None => std::env::temp_dir().join("fresh-box-crash.log"),
        };

        let crash_msg = format!(
            "Application crashed at {}: {}\n",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            panic_info
        );

        // Always append so multiple crash entries are preserved in the same file.
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .and_then(|mut file| {
                use std::io::Write;
                file.write_all(crash_msg.as_bytes())
            });

        eprintln!("{}", crash_msg);

        show_crash_dialog(&panic_info.to_string(), &log_path);

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
