// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod config_override;
mod errors;
mod singbox;
mod tray;

use singbox::SingboxState;
use tauri::Manager;

fn main() {
    // 创建初始状态
    let singbox_state = SingboxState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(singbox_state)
        .invoke_handler(tauri::generate_handler![
            singbox::start_singbox,
            singbox::stop_singbox,
            singbox::is_singbox_running,
            config::list_configs,
            config::copy_config_to_bin,
            config::save_subscription_config,
            config::delete_config,
            config::rename_config,
            config::open_app_directory,
            config::save_subscriptions,
            config::load_subscriptions,
            config_override::enable_config_override,
            config_override::disable_config_override,
            config_override::save_config_override,
            config_override::clear_config_override,
            config_override::load_config_override,
        ])
        .setup(|app| {
            // 设置系统托盘
            tray::setup_system_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!(
                "Second instance launched with args: {:?} in {:?}",
                argv, cwd
            );
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .run(tauri::generate_context!())
        .expect("error while running fresh-box");
}
