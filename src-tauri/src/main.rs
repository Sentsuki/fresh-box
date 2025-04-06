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
async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    let mut process_guard = state.singbox_process.lock().unwrap();

    if process_guard.is_some() {
        println!("Sing-box process is already running.");
        return Err(CommandError::ProcessAlreadyRunning);
    }

    println!("Attempting to start sing-box...");

    // 获取当前可执行文件路径
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to get executable path: {}", e)))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::ResourceNotFound("Failed to get executable directory".to_string())
    })?;

    // 构造 bin/ 目录下的文件路径
    let config_path = exe_dir.join("bin").join("config.json");
    let singbox_path = exe_dir.join("bin").join("sing-box.exe");

    // 打印路径以便调试
    println!("Sing-box path: {}", singbox_path.display());
    println!("Config path: {}", config_path.display());

    // 检查文件是否存在
    if !singbox_path.exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "sing-box.exe not found at: {}",
            singbox_path.display()
        )));
    }
    if !config_path.exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "config.json not found at: {}",
            config_path.display()
        )));
    }

    let mut command = Command::new(&singbox_path);
    command
        .args(["run", "-c", config_path.to_str().unwrap()])
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

fn main() {
    let initial_state = AppState {
        singbox_process: Mutex::new(None),
    };

    tauri::Builder::default()
        .manage(initial_state)
        .invoke_handler(tauri::generate_handler![start_singbox, stop_singbox])
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            // 解决警告：不需要存储 tray 变量
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
                            // 退出前的清理
                            let state = app.state::<AppState>();
                            if let Ok(mut process_guard) = state.singbox_process.lock() {
                                if let Some(mut child) = process_guard.take() {
                                    let _ = child.kill();
                                    let _ = child.wait(); // 等待进程结束
                                }
                            }
                            // 先隐藏窗口，给系统时间处理
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