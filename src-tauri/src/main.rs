// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod crash_reports;
mod daemon;
mod errors;
mod logger;
mod services;
mod tray;
mod window_state;
mod window_utils;

use services::singbox::{SingboxState, retry_connection, spawn_reconciliation_loop};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;

/// Passed to a launch registered via `enable_autostart` (see
/// `commands::app`) so a login-triggered launch can be told apart from a
/// normal one — checked in `setup()` to start hidden in the tray instead of
/// showing the main window, mirroring the official client's
/// `wasOpenedAtLogin()` (`loginItem.ts`) handling in `index.ts`.
const AUTOSTART_ARG: &str = "--autostart";

fn main() {
    logger::init_tracing();
    logger::install_panic_hook();

    let singbox_state = SingboxState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        // App self-update — see `tauri.conf.json`'s `plugins.updater` for
        // the signing key/endpoint, and `docs/updater-releasing.md` for how
        // a release actually gets signed. Nothing else (no
        // `tauri-plugin-process`) needed alongside it — see this plugin's
        // Cargo.toml entry for why.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(singbox_state)
        .manage(daemon::bridge::registry::StreamRegistry::new())
        .manage(std::sync::Arc::new(services::resident::ResidentState::new()))
        .manage(config::app_settings::BackendPrefsState::load())
        .invoke_handler(tauri::generate_handler![
            // daemon 域：整个 daemon 的能力都从这一个命令过（阶段 2 会加
            // `daemon_stream`/`daemon_cancel`）。下面那一长串 host 域命令
            // 会在阶段 3-5 里逐步收缩掉大半 —— 见重构方案 08 节。
            commands::bridge::daemon_unary,
            commands::bridge::daemon_stream,
            commands::bridge::daemon_cancel,
            commands::singbox::start_singbox,
            commands::singbox::stop_singbox,
            commands::singbox::get_daemon_state,
            commands::singbox::retry_daemon_connection,
            commands::singbox::is_daemon_service_installed,
            commands::singbox::install_daemon_service,
            commands::singbox::uninstall_daemon_service,
            commands::singbox::repair_daemon_service,
            commands::app::is_autostart_enabled,
            commands::app::enable_autostart,
            commands::app::disable_autostart,
            commands::config::list_profiles,
            commands::config::copy_config_to_bin,
            commands::config::delete_profile,
            commands::config::rename_profile,
            commands::config::edit_subscription_url,
            commands::config::set_subscription_auto_update,
            commands::config::open_config_file,
            commands::config::open_app_directory,
            commands::config::load_app_settings,
            commands::config::save_app_settings,
            commands::config_override::enable_config_override,
            commands::config_override::disable_config_override,
            commands::config_override::save_config_override,
            commands::config_override::clear_config_override,
            commands::config_override::load_config_override,
            commands::config_override::is_config_override_enabled,
            commands::priority::save_priority_config,
            commands::priority::load_priority_config,
            commands::priority::check_config_fields,
            commands::diagnostics::record_frontend_error,
            commands::app::update_mica_theme,
            commands::config::add_subscription,
            commands::config::update_subscription,
            commands::reports::list_crash_reports_all,
            commands::reports::read_crash_report,
            commands::reports::delete_crash_report,
            commands::reports::delete_all_crash_reports,
            commands::reports::list_oom_reports,
            commands::reports::read_oom_report,
            commands::reports::delete_oom_report,
            commands::reports::delete_all_oom_reports,
            commands::reports::list_power_reports,
            commands::reports::read_power_report,
            commands::reports::delete_power_report,
            commands::reports::delete_all_power_reports,
        ])
        .setup(|app| {
            // 首次启动时生成含完整默认值的 priority_config.json（幂等）
            config::ensure_priority_config_initialized();

            tray::setup_system_tray(app)?;

            let window = app.get_webview_window("main").unwrap();

            // Restore the last saved position/size/maximized state before
            // the window is ever shown — it's created with `"visible":
            // false` in tauri.conf.json specifically so this can't be seen
            // jumping from the default bounds to the restored ones.
            window_state::restore(&window);

            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_mica;
                let _ = apply_mica(&window, None);
            }

            // A launch registered via `enable_autostart` (see
            // `commands::app`) passes `AUTOSTART_ARG` — start hidden in the
            // tray in that case rather than popping the main window up
            // unasked-for on every login, mirroring the official client's
            // `wasOpenedAtLogin()` handling.
            if !std::env::args().any(|arg| arg == AUTOSTART_ARG) {
                let _ = window.show();
            }

            let state = app.state::<SingboxState>();
            spawn_reconciliation_loop(app.handle().clone(), state.inner().clone());
            commands::config::spawn_auto_update_scheduler(app.handle().clone());

            // 关闭窗口会销毁 webview，所以这两件事必须由 Rust 拥有：状态变化
            // 的系统通知（原来在前端，销毁模式下等于不存在），以及托盘菜单的
            // 持续同步。见 `services::resident` 的模块注释。
            let resident = app
                .state::<std::sync::Arc<services::resident::ResidentState>>()
                .inner()
                .clone();
            services::resident::spawn_notifier(app.handle().clone(), state.inner().clone());
            tray::spawn_tray_sync(
                app.handle().clone(),
                state.inner().clone(),
                resident,
            );

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                window_state::persist(window);
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // 始终阻止默认关闭行为，由我们决定后续动作
                api.prevent_close();

                // Bounds/position may have changed since the last
                // `Resized`/`Moved` event fired (or this could be the very
                // first user interaction with the window at all) — persist
                // once more right before it goes away instead of relying
                // solely on those two events to have already caught it.
                window_state::persist(window);

                let close_behavior = window
                    .app_handle()
                    .state::<config::app_settings::BackendPrefsState>()
                    .get()
                    .close_behavior;

                // 通知前端窗口即将不可见，触发流暂停与缓存清理
                let _ = window.emit("window-visibility-changed", false);

                let window_clone = window.clone();
                if close_behavior == "destroy" {
                    // 通知运行时：窗口将销毁，保持进程存活
                    window_utils::set_keep_alive(true);
                    // 直接销毁窗口（不会再次触发 CloseRequested）
                    if let Err(e) = window_clone.destroy() {
                        tracing::error!(error = %e, "failed to destroy window");
                        window_utils::set_keep_alive(false);
                    }
                } else {
                    // hide 模式：隐藏窗口，保持后台运行
                    window_utils::run_after_delay(Duration::from_millis(10), move || {
                        let _ = window_clone.hide();
                    });
                }
            }
            tauri::WindowEvent::Focused(true) => {
                // Cut short any backoff the reconciliation loop is
                // currently sitting out, rather than waiting up to 5s to
                // notice e.g. a daemon that only just finished starting up
                // — see `retry_connection`'s doc comment.
                let app = window.app_handle();
                if let Some(state) = app.try_state::<SingboxState>() {
                    retry_connection(&state);
                }
            }
            tauri::WindowEvent::Destroyed => {
                // 销毁模式下每次关闭窗口都会走到这里，所以这是流回收的主路径
                // 而不是边角情况：漏收一次，daemon 那边就多留一条永远没人读的
                // 订阅。见 `daemon::bridge::registry` 的模块注释。
                if let Some(registry) =
                    window.app_handle().try_state::<daemon::bridge::registry::StreamRegistry>()
                {
                    let cancelled = registry.cancel_window(window.label());
                    if cancelled > 0 {
                        // info 而不是 debug：每关一次窗口一行，而 `remaining`
                        // 正是流泄漏的观测指标 —— 这是出问题时第一个想看的东西，
                        // 不该藏在需要 RUST_LOG=debug 才出现的地方。
                        tracing::info!(
                            label = window.label(),
                            cancelled,
                            remaining = registry.active_count(),
                            "cancelled daemon streams owned by a destroyed window"
                        );
                    }
                }
            }
            _ => {}
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            tracing::info!(?argv, ?cwd, "second instance launched");
            let app_clone = app.clone();
            window_utils::show_or_create_main_window(&app_clone);
        }))
        .build(tauri::generate_context!())
        .unwrap_or_else(|err| {
            tracing::error!(error = %err, "failed to build fresh-box");
            std::process::exit(1);
        })
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // destroy 模式下窗口被销毁后阻止应用退出，保持托盘存活
                if window_utils::should_prevent_exit() {
                    tracing::debug!("window destroyed, keeping tray and background tasks alive");
                    api.prevent_exit();
                }
            }
        });
}
