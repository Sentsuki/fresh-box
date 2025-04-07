// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}, menu::{Menu, MenuItem}};

struct AppState {
    singbox_process: Mutex<Option<Child>>,
}

#[derive(Debug, serde::Serialize)]
enum CommandError {
    ProcessAlreadyRunning,
    ProcessNotRunning,
    ResourceNotFound(String),
    FailedToStartProcess(String),
    FailedToStopProcess(String),
}

#[tauri::command]
async fn save_subscription_config(
    file_name: String,
    content: String
) -> Result<String, CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to get executable path: {}", e)))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::ResourceNotFound("Failed to get executable directory".to_string())
    })?;
    let bin_dir = exe_dir.join("bin");
    let target_path = bin_dir.join(&file_name);

    std::fs::write(&target_path, content)
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to write config file: {}", e)))?;

    Ok(target_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn copy_config_to_bin(config_path: String) -> Result<String, CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to get executable path: {}", e)))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::ResourceNotFound("Failed to get executable directory".to_string())
    })?;
    let bin_dir = exe_dir.join("bin");
    let source_config_path = std::path::Path::new(&config_path);

    if !source_config_path.exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "Source config file not found at: {}",
            config_path
        )));
    }

    let config_file = source_config_path
        .file_name()
        .ok_or_else(|| CommandError::ResourceNotFound("Invalid config file path".to_string()))?;
    let target_config_path = bin_dir.join(config_file);

    // 如果文件已存在且内容相同，则无需复制
    if target_config_path.exists() {
        let source_content = std::fs::read(&config_path)
            .map_err(|e| CommandError::ResourceNotFound(format!("Failed to read source file: {}", e)))?;
        let target_content = std::fs::read(&target_config_path)
            .map_err(|e| CommandError::ResourceNotFound(format!("Failed to read target file: {}", e)))?;
        if source_content == target_content {
            return Ok(target_config_path.to_string_lossy().into_owned());
        }
    }

    std::fs::copy(&config_path, &target_config_path)
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to copy config file: {}", e)))?;
    
    Ok(target_config_path.to_string_lossy().into_owned())
}

// 更新 start_singbox，移除复制逻辑，直接使用目标路径
#[tauri::command]
async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config_path: String,
) -> Result<(), CommandError> {
    let mut process_guard = state.singbox_process.lock().unwrap();

    if process_guard.is_some() {
        return Err(CommandError::ProcessAlreadyRunning);
    }

    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to get executable path: {}", e)))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::ResourceNotFound("Failed to get executable directory".to_string())
    })?;
    let bin_dir = exe_dir.join("bin");
    let singbox_path = bin_dir.join("sing-box.exe");

    if !singbox_path.exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "sing-box.exe not found at: {}",
            singbox_path.display()
        )));
    }
    if !std::path::Path::new(&config_path).exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "Config file not found at: {}",
            config_path
        )));
    }

    let mut command = Command::new(&singbox_path);
    command
        .args(["run", "-c", &config_path])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.spawn() {
        Ok(child) => {
            println!("Sing-box process started successfully (PID: {}).", child.id());
            *process_guard = Some(child);
            Ok(())
        }
        Err(e) => Err(CommandError::FailedToStartProcess(e.to_string())),
    }
}

#[tauri::command]
async fn stop_singbox(state: State<'_, AppState>) -> Result<(), CommandError> {
    let mut process_guard = state.singbox_process.lock().unwrap();

    if let Some(mut child) = process_guard.take() {
        println!("Attempting to stop sing-box process (PID: {})...", child.id());
        match child.kill() {
            Ok(_) => {
                match child.wait() {
                    Ok(status) => println!("Sing-box process stopped successfully with status: {}", status),
                    Err(e) => eprintln!("Error waiting for sing-box process termination: {}", e),
                }
                Ok(())
            }
            Err(e) => {
                *process_guard = None;
                Err(CommandError::FailedToStopProcess(e.to_string()))
            }
        }
    } else {
        Err(CommandError::ProcessNotRunning)
    }
}

#[tauri::command]
async fn list_configs(_app_handle: tauri::AppHandle) -> Result<Vec<String>, CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to get executable path: {}", e)))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::ResourceNotFound("Failed to get executable directory".to_string())
    })?;
    let bin_dir = exe_dir.join("bin");

    let mut config_files = Vec::new();
    for entry in std::fs::read_dir(bin_dir)
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to read bin directory: {}", e)))?
    {
        let entry = entry.map_err(|e| CommandError::ResourceNotFound(format!("Failed to read entry: {}", e)))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Some(path_str) = path.to_str() {
                config_files.push(path_str.to_string());
            }
        }
    }
    Ok(config_files)
}

fn main() {
    let initial_state = AppState {
        singbox_process: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .manage(initial_state)
        .invoke_handler(tauri::generate_handler![
            start_singbox,
            stop_singbox,
            list_configs,
            copy_config_to_bin,
            save_subscription_config
        ])
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            let state = app.state::<AppState>();
                            if let Ok(mut process_guard) = state.singbox_process.lock() {
                                if let Some(mut child) = process_guard.take() {
                                    let _ = child.kill();
                                    let _ = child.wait();
                                }
                            }
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

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