// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clash_api;
mod config;
mod config_override;
mod core_update;
mod errors;
mod logger;
mod priority_config;
mod singbox;
mod tray;
mod window_utils;

use core_update::{auto_select_installed_core, cleanup_staged_core_update_files_directly, CoreUpdateCancelState};
use singbox::{initialize_singbox_directly, refresh_singbox_detection_directly, SingboxState};
use std::time::Duration;
use tauri::{Manager, Window};

#[tauri::command]
fn update_mica_theme(window: Window, is_light: bool) {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_mica;
        let _ = apply_mica(&window, Some(!is_light));
    }
}

fn main() {
    logger::install_panic_hook();

    let singbox_state = SingboxState::new();
    let cancel_state = CoreUpdateCancelState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(singbox_state)
        .manage(cancel_state)
        .invoke_handler(tauri::generate_handler![
            singbox::start_singbox,
            singbox::stop_singbox,
            singbox::is_singbox_running,
            singbox::health_check_singbox,
            singbox::initialize_singbox_state,
            singbox::get_singbox_status,
            singbox::refresh_singbox_detection,
            core_update::get_singbox_core_status,
            core_update::activate_singbox_core,
            core_update::update_singbox_core,
            core_update::cancel_core_update,
            clash_api::get_clash_overview,
            clash_api::update_clash_mode,
            clash_api::select_clash_proxy,
            clash_api::test_clash_proxy_delay,
            clash_api::test_clash_proxy_group_delay,
            clash_api::get_clash_rules,
            clash_api::toggle_clash_rule,
            clash_api::update_clash_rule_provider,
            config::list_configs,
            config::copy_config_to_bin,
            config::save_subscription_config,
            config::delete_config,
            config::rename_config,
            config::open_config_file,
            config::open_app_directory,
            config::save_subscriptions,
            config::load_subscriptions,
            config::load_app_settings,
            config::save_app_settings,
            config::load_config_content,
            config::save_config_content,
            config::open_url,
            config::get_clash_api_url,
            config_override::enable_config_override,
            config_override::disable_config_override,
            config_override::save_config_override,
            config_override::clear_config_override,
            config_override::load_config_override,
            config_override::is_config_override_enabled,
            priority_config::save_priority_config,
            priority_config::load_priority_config,
            priority_config::clear_priority_config,
            priority_config::check_config_fields,
            priority_config::get_core_client_config,
            priority_config::generate_random_port,
            priority_config::generate_random_secret,
            update_mica_theme,
        ])
        .setup(|app| {
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
                api.prevent_close();
                let window_clone = window.clone();
                window_utils::run_after_delay(Duration::from_millis(10), move || {
                    let _ = window_clone.hide();
                });
            }
            tauri::WindowEvent::Focused(focused) => {
                if *focused {
                    let app = window.app_handle();
                    if let Some(state) = app.try_state::<SingboxState>() {
                        let state_clone = state.inner().clone();
                        window_utils::spawn_async_after_delay(
                            Duration::from_millis(50),
                            move || async move {
                                if let Ok(has_process) =
                                    refresh_singbox_detection_directly(&state_clone).await
                                {
                                    if has_process {
                                        println!(
                                            "Window focused: Sing-box process detected and under management"
                                        );
                                    }
                                }
                            },
                        );
                    }
                }
            }
            tauri::WindowEvent::Destroyed => {
                println!("Window destroyed, performing cleanup");
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
                if let Err(e) = window_utils::safe_show_window(&app_clone, "main") {
                    eprintln!("Failed to show window on second instance: {}", e);
                }
            });
        }))
        .run(tauri::generate_context!())
        .unwrap_or_else(|err| {
            eprintln!("Failed to run fresh-box: {}", err);
            std::process::exit(1);
        });
}
