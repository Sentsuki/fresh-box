// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod errors;
mod singbox;
mod config;
mod tray;

use singbox::SingboxState;

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
            config::list_configs,
            config::copy_config_to_bin,
            config::save_subscription_config
        ])
        .setup(|app| {
            // 设置系统托盘
            tray::setup_system_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}