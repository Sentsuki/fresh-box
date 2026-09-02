pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
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
    }));
}
