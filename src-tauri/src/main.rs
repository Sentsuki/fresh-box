// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod config_override;
mod errors;
mod singbox;
mod tray;

use singbox::{SingboxState, initialize_singbox_directly, refresh_singbox_detection_directly};
use tauri::Manager;
use std::panic;

fn main() {
    // 设置panic hook来记录崩溃信息
    panic::set_hook(Box::new(|panic_info| {
        let exe_path = std::env::current_exe().unwrap_or_default();
        let exe_dir = exe_path.parent().unwrap_or_else(|| std::path::Path::new("."));
        let log_path = exe_dir.join("crash.log");
        
        let crash_msg = format!(
            "Application crashed at {}: {}\n",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            panic_info
        );
        
        // 尝试写入崩溃日志
        if std::fs::write(&log_path, &crash_msg).is_err() {
            // 如果写入失败，尝试追加到现有文件
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
            singbox::health_check_singbox,
            singbox::initialize_singbox_state,
            singbox::get_singbox_status,
            singbox::refresh_singbox_detection,
            config::list_configs,
            config::copy_config_to_bin,
            config::save_subscription_config,
            config::delete_config,
            config::rename_config,
            config::read_config_content,
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
            
            // 初始化时检测现有的sing-box进程
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
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Focused(focused) => {
                    if *focused {
                        // 窗口获得焦点时，检查sing-box进程状态
                        let app = window.app_handle();
                        let state = app.state::<SingboxState>();
                        
                        // 异步刷新进程检测状态
                        let state_clone = state.inner().clone();
                        tauri::async_runtime::spawn(async move {
                            if let Ok(has_process) = refresh_singbox_detection_directly(&state_clone).await {
                                if has_process {
                                    println!("Window focused: Sing-box process detected and under management");
                                }
                            }
                        });
                    }
                }
                _ => {}
            }
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
        .unwrap_or_else(|err| {
            eprintln!("Failed to run fresh-box: {}", err);
            std::process::exit(1);
        });
}
