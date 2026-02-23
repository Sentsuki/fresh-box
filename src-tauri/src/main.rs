// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod config_override;
mod errors;
mod priority_config;
mod singbox;
mod tray;
mod window_utils;

use singbox::{initialize_singbox_directly, refresh_singbox_detection_directly, SingboxState};
use std::panic;
use tauri::Manager;

// 从 override 配置打开 Panel URL
#[tauri::command]
async fn open_panel_url() -> Result<(), String> {
    // 获取 override 配置
    let override_config = config_override::get_override_config_if_enabled()
        .await
        .map_err(|e| format!("Failed to get override config: {:?}", e))?;

    let config = match override_config {
        Some(cfg) => cfg,
        None => {
            return Err("Config override is not enabled".to_string());
        }
    };

    // 从 override 配置中提取 clash_api 信息
    let external_controller = config
        .get("experimental")
        .and_then(|exp| exp.get("clash_api"))
        .and_then(|clash| clash.get("external_controller"))
        .and_then(|ctrl| ctrl.as_str());

    let external_ui = config
        .get("experimental")
        .and_then(|exp| exp.get("clash_api"))
        .and_then(|clash| clash.get("external_ui"))
        .and_then(|ui| ui.as_str());

    // 如果两者都存在，构建 URL
    if let (Some(controller), Some(ui)) = (external_controller, external_ui) {
        // 确保 UI 路径以 / 开头
        let ui_path = if ui.starts_with('/') {
            ui.to_string()
        } else {
            format!("/{}", ui)
        };

        // 构建完整的 URL
        let url = format!("http://{}{}/", controller, ui_path);

        config::open_url(url)
            .await
            .map_err(|e| format!("Failed to open URL: {:?}", e))?;
        Ok(())
    } else {
        Err("Clash API not configured in override config".to_string())
    }
}

fn main() {
    // 设置panic hook来记录崩溃信息
    panic::set_hook(Box::new(|panic_info| {
        let exe_path = std::env::current_exe().unwrap_or_default();
        let exe_dir = exe_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."));
        
        // 尝试将崩溃日志写入 log 目录，如果失败则回退到 exe 目录
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
            config::open_config_file,
            config::open_app_directory,
            config::save_subscriptions,
            config::load_subscriptions,
            config::load_config_content,
            config::save_config_content,
            config::open_url,
            config::get_clash_api_url,
            open_panel_url,
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
                    // 阻止关闭并隐藏窗口
                    api.prevent_close();
                    // 使用延迟隐藏避免事件循环冲突
                    let window_clone = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(10));
                        let _ = window_clone.hide();
                    });
                }
                tauri::WindowEvent::Focused(focused) => {
                    if *focused {
                        // 延迟执行异步操作，避免在事件处理中直接执行
                        let app = window.app_handle();
                        if let Some(state) = app.try_state::<SingboxState>() {
                            let state_clone = state.inner().clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(50));
                                tauri::async_runtime::spawn(async move {
                                    if let Ok(has_process) = refresh_singbox_detection_directly(&state_clone).await {
                                        if has_process {
                                            println!("Window focused: Sing-box process detected and under management");
                                        }
                                    }
                                });
                            });
                        }
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    // 窗口被销毁时的清理逻辑
                    println!("Window destroyed, performing cleanup");
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!(
                "Second instance launched with args: {:?} in {:?}",
                argv, cwd
            );
            // 延迟执行窗口显示，避免在插件回调中直接操作
            let app_clone = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(50));
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
