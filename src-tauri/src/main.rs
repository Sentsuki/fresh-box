// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod daemon;
mod errors;
mod logger;
mod services;
mod tray;
mod window_utils;

use services::singbox::{SingboxState, retry_connection, spawn_reconciliation_loop};
use std::time::Duration;
use tauri::{Emitter, Manager, Window};

#[tauri::command]
fn update_mica_theme(window: Window, is_light: Option<bool>) {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_mica;
        let is_dark = is_light.map(|light| !light);
        let _ = apply_mica(&window, is_dark);
    }
}

fn main() {
    logger::install_panic_hook();

    let singbox_state = SingboxState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(singbox_state)
        .manage(services::streams::StreamsState::new())
        .invoke_handler(tauri::generate_handler![
            commands::singbox::start_singbox,
            commands::singbox::stop_singbox,
            commands::singbox::get_daemon_state,
            commands::singbox::retry_daemon_connection,
            commands::singbox::is_daemon_service_installed,
            commands::singbox::install_daemon_service,
            commands::singbox::uninstall_daemon_service,
            commands::clash::get_clash_overview,
            commands::clash::update_clash_mode,
            commands::clash::select_clash_proxy,
            commands::clash::test_clash_proxy_delay,
            commands::clash::test_clash_proxy_group_delay,
            commands::config::list_configs,
            commands::config::copy_config_to_bin,
            commands::config::save_subscription_config,
            commands::config::delete_config,
            commands::config::rename_config,
            commands::config::open_config_file,
            commands::config::open_app_directory,
            commands::config::save_subscriptions,
            commands::config::load_subscriptions,
            commands::config::load_app_settings,
            commands::config::save_app_settings,
            commands::config::load_config_content,
            commands::config::save_config_content,
            commands::config_override::enable_config_override,
            commands::config_override::disable_config_override,
            commands::config_override::save_config_override,
            commands::config_override::clear_config_override,
            commands::config_override::load_config_override,
            commands::config_override::is_config_override_enabled,
            commands::priority::save_priority_config,
            commands::priority::load_priority_config,
            commands::priority::clear_priority_config,
            commands::priority::check_config_fields,
            commands::tray::refresh_tray_proxy_menu,
            update_mica_theme,
            commands::streams::start_traffic_stream,
            commands::streams::stop_traffic_stream,
            commands::streams::start_memory_stream,
            commands::streams::stop_memory_stream,
            commands::streams::start_connections_stream,
            commands::streams::stop_connections_stream,
            commands::streams::start_logs_stream,
            commands::streams::stop_logs_stream,
            commands::clash::close_all_connections,
            commands::clash::close_connection,
            commands::config::fetch_subscription,
            commands::config::add_subscription,
            commands::config::update_subscription,
        ])
        .setup(|app| {
            // 首次启动时生成含完整默认值的 priority_config.json（幂等）
            config::ensure_priority_config_initialized();

            tray::setup_system_tray(app)?;

            let window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_mica;
                let _ = apply_mica(&window, None);
            }

            let state = app.state::<SingboxState>();
            spawn_reconciliation_loop(app.handle().clone(), state.inner().clone());

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // 始终阻止默认关闭行为，由我们决定后续动作
                api.prevent_close();

                let close_behavior = crate::config::app_settings::load_app_settings_file()
                    .map(|s| s.settings.close_behavior.clone())
                    .unwrap_or_else(|_| "hide".to_string());

                // 通知前端窗口即将不可见，触发流暂停与缓存清理
                let _ = window.emit("window-visibility-changed", false);

                let window_clone = window.clone();
                if close_behavior == "destroy" {
                    // 通知运行时：窗口将销毁，保持进程存活
                    window_utils::set_keep_alive(true);
                    // 直接销毁窗口（不会再次触发 CloseRequested）
                    if let Err(e) = window_clone.destroy() {
                        eprintln!("Failed to destroy window: {}", e);
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
            tauri::WindowEvent::Destroyed => {}
            _ => {}
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!(
                "Second instance launched with args: {:?} in {:?}",
                argv, cwd
            );
            let app_clone = app.clone();
            window_utils::show_or_create_main_window(&app_clone);
        }))
        .build(tauri::generate_context!())
        .unwrap_or_else(|err| {
            eprintln!("Failed to build fresh-box: {}", err);
            std::process::exit(1);
        })
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // destroy 模式下窗口被销毁后阻止应用退出，保持托盘存活
                if window_utils::should_prevent_exit() {
                    println!("Window destroyed, keeping tray and background tasks alive.");
                    api.prevent_exit();
                }
            }
        });
}
