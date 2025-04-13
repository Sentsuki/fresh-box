// singbox.rs - 管理 singbox 进程的启动和停止

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{State};
use crate::errors::CommandError;
use serde_json::Value;
use std::fs;

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

    // 创建日志文件
    let log_file = bin_dir.join("singbox.log");
    let log_file = std::fs::File::create(&log_file)
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to create log file: {}", e)))?;

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

    // 读取原始配置
    let config_content = fs::read_to_string(&config_path)?;
    let mut base_config: Value = serde_json::from_str(&config_content)?;

    // 创建命令
    let mut command = Command::new(&*singbox_path.to_string_lossy());

    // 检查是否存在覆盖配置
    let override_path = bin_dir.join("config_override.json");
    if override_path.exists() {
        let override_content = fs::read_to_string(&override_path)?;
        let override_config: Value = serde_json::from_str(&override_content)?;
        
        // 应用覆盖配置
        crate::config_override::apply_config_override(&mut base_config, &override_config);
        
        // 将合并后的配置写入临时文件
        let temp_config_path = bin_dir.join("temp_config.json");
        fs::write(&temp_config_path, serde_json::to_string_pretty(&base_config)?)?;
        
        // 使用临时配置文件启动 sing-box
        command
            .args(["run", "-c", &*temp_config_path.to_string_lossy()])
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_file.try_clone()?))
            .stderr(Stdio::from(log_file));
    } else {
        // 没有覆盖配置，直接使用原始配置文件
        command
            .args(["run", "-c", &config_path])
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_file.try_clone()?))
            .stderr(Stdio::from(log_file));
    }

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