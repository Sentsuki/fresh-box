// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod errors;
mod logger;
mod services;
mod tray;
mod window_utils;

use services::core_update::{
    CoreUpdateCancelState, auto_select_installed_core, cleanup_staged_core_update_files_directly,
};
use services::singbox::{
    SingboxState, initialize_singbox_directly, refresh_singbox_detection_directly,
};
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
    let cancel_state = CoreUpdateCancelState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(singbox_state)
        .manage(cancel_state)
        .manage(services::streams::StreamsState::new())
        .invoke_handler(tauri::generate_handler![
            commands::singbox::start_singbox,
            commands::singbox::stop_singbox,
            commands::singbox::is_singbox_running,
            commands::singbox::health_check_singbox,
            commands::singbox::initialize_singbox_state,
            commands::singbox::get_singbox_status,
            commands::singbox::refresh_singbox_detection,
            commands::core_update::get_singbox_core_status,
            commands::core_update::activate_singbox_core,
            commands::core_update::update_singbox_core,
            commands::core_update::cancel_core_update,
            commands::clash::get_clash_overview,
            commands::clash::update_clash_mode,
            commands::clash::select_clash_proxy,
            commands::clash::test_clash_proxy_delay,
            commands::clash::test_clash_proxy_group_delay,
            commands::clash::get_clash_rules,
            commands::clash::query_dns,
            commands::clash::flush_fakeip_cache,
            commands::clash::flush_dns_cache,
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
            commands::config::open_url,
            commands::config::get_clash_api_url,
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
            commands::priority::get_core_client_config,
            commands::priority::generate_random_port,
            commands::priority::generate_random_secret,
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

            if let Err(error) = cleanup_staged_core_update_files_directly() {
                eprintln!("Failed to clean staged sing-box core files: {}", error);
            }

            if let Err(error) = auto_select_installed_core() {
                eprintln!("Failed to auto-select installed sing-box core: {}", error);
            }

            let state = app.state::<SingboxState>();
            let state_clone = state.inner().clone();
            tauri::async_runtime::spawn(async move {
                match initialize_singbox_directly(&state_clone).await {
                    Ok(status) => {
                        println!("Initialization result: {}", status);
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize sing-box state: {:?}", e);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let close_behavior = {
                    crate::config::app_settings::load_app_settings_file()
                        .map(|s| s.settings.close_behavior.clone())
                        .unwrap_or_else(|_| "hide".to_string())
                };

                if close_behavior == "destroy" {
                    // Allow window to destroy naturally, keeping tray + process alive
                    return;
                }

                api.prevent_close();
                let window_clone = window.clone();
                window_utils::run_after_delay(Duration::from_millis(10), move || {
                    let _ = window_clone.hide();
                    let _ = window_clone.emit("window-visibility-changed", false);
                });
            }
            tauri::WindowEvent::Focused(true) => {
                let app = window.app_handle();
                if let Some(state) = app.try_state::<SingboxState>() {
                    let state_clone = state.inner().clone();
                    window_utils::spawn_async_after_delay(
                        Duration::from_millis(50),
                        move || async move {
                            if let Ok(has_process) =
                                refresh_singbox_detection_directly(&state_clone).await
                                && has_process
                            {
                                println!(
                                    "Window focused: sing-box process detected and under management"
                                );
                            }
                        },
                    );
                }
            }
            tauri::WindowEvent::Destroyed => {
                println!("Window destroyed, keeping tray alive");
            }
            _ => {}
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!(
                "Second instance launched with args: {:?} in {:?}",
                argv, cwd
            );
            let app_clone = app.clone();
            window_utils::run_after_delay(Duration::from_millis(50), move || {
                window_utils::safe_show_or_create_window(&app_clone, "main");
            });
        }))
        .run(tauri::generate_context!())
        .unwrap_or_else(|err| {
            eprintln!("Failed to run fresh-box: {}", err);
            std::process::exit(1);
        });
}
