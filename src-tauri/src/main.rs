// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod config_override;
mod core_update;
mod errors;
mod logger;
mod priority_config;
mod singbox;
mod tray;
mod window_utils;

use singbox::{initialize_singbox_directly, refresh_singbox_detection_directly, SingboxState};
use std::time::Duration;
use tauri::Manager;

fn main() {
    logger::install_panic_hook();

    let singbox_state = SingboxState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(singbox_state)
        .invoke_handler(tauri::generate_handler![
            singbox::start_singbox,
            singbox::stop_singbox,
            singbox::is_singbox_running,
            singbox::health_check_singbox,
            singbox::initialize_singbox_state,
            singbox::get_singbox_status,
            singbox::refresh_singbox_detection,
            core_update::get_singbox_core_status,
            core_update::update_singbox_core,
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
            config::open_panel_url,
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
        ])
        .setup(|app| {
            tray::setup_system_tray(app)?;

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
