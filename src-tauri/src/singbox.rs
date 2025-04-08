// singbox.rs - 管理 singbox 进程的启动和停止

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{State};
use crate::errors::CommandError;

pub struct SingboxState {
    pub singbox_process: Mutex<Option<Child>>,
}

impl SingboxState {
    pub fn new() -> Self {
        Self {
            singbox_process: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, SingboxState>,
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
pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
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

// 清理系统资源的函数
pub fn cleanup_process(state: &SingboxState) {
    if let Ok(mut process_guard) = state.singbox_process.lock() {
        if let Some(mut child) = process_guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}