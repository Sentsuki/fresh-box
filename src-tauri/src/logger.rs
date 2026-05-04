pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        let exe_path = std::env::current_exe().unwrap_or_default();
        let exe_dir = exe_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."));

        let log_dir = exe_dir.join("log");
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = if log_dir.exists() {
            log_dir.join("crash.log")
        } else {
            exe_dir.join("crash.log")
        };

        let crash_msg = format!(
            "Application crashed at {}: {}\n",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            panic_info
        );

        if std::fs::write(&log_path, &crash_msg).is_err() {
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .and_then(|mut file| {
                    use std::io::Write;
                    file.write_all(crash_msg.as_bytes())
                });
        }

        eprintln!("{}", crash_msg);
    }));
}
