// singbox.rs - 管理 singbox 进程的启动和停止

use crate::errors::CommandError;
use serde_json::Value;
use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::State;

#[derive(Clone)]
pub struct SingboxState {
    pub singbox_process: Arc<Mutex<Option<Child>>>,
    pub last_start_time: Arc<Mutex<Option<SystemTime>>>,
    pub external_process_detected: Arc<Mutex<bool>>,
}

impl Default for SingboxState {
    fn default() -> Self {
        Self::new()
    }
}

impl SingboxState {
    pub fn new() -> Self {
        Self {
            singbox_process: Arc::new(Mutex::new(None)),
            last_start_time: Arc::new(Mutex::new(None)),
            external_process_detected: Arc::new(Mutex::new(false)),
        }
    }
    
    // 检测系统中是否有sing-box进程在运行
    pub fn detect_existing_singbox(&self) -> Result<bool, CommandError> {
        #[cfg(windows)]
        {
            let output = Command::new("tasklist")
                .args(["/fi", "imagename eq sing-box.exe", "/fo", "csv", "/nh"])
                .output()
                .map_err(|e| CommandError::FailedToStartProcess(format!("Failed to run tasklist: {}", e)))?;
            
            let output_str = String::from_utf8_lossy(&output.stdout);
            let has_process = output_str.contains("sing-box.exe");
            
            if has_process {
                println!("Detected existing sing-box.exe process in system");
            }
            
            Ok(has_process)
        }
        
        #[cfg(not(windows))]
        {
            let output = Command::new("pgrep")
                .args(["-f", "sing-box"])
                .output()
                .map_err(|e| CommandError::FailedToStartProcess(format!("Failed to run pgrep: {}", e)))?;
            
            let has_process = !output.stdout.is_empty();
            
            if has_process {
                println!("Detected existing sing-box process in system");
            }
            
            Ok(has_process)
        }
    }
}

#[tauri::command]
pub async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, SingboxState>,
    config_path: String,
) -> Result<(), CommandError> {
    let mut process_guard = match state.singbox_process.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("Mutex was poisoned in start_singbox, recovering...");
            poisoned.into_inner()
        }
    };

    if process_guard.is_some() {
        return Err(CommandError::ProcessAlreadyRunning);
    }

    let exe_path = std::env::current_exe().map_err(|e| {
        CommandError::ResourceNotFound(format!("Failed to get executable path: {}", e))
    })?;
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
        fs::write(
            &temp_config_path,
            serde_json::to_string_pretty(&base_config)?,
        )?;

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
            println!(
                "Sing-box process started successfully (PID: {}).",
                child.id()
            );
            *process_guard = Some(child);
            
            // 记录启动时间
            if let Ok(mut time_guard) = state.last_start_time.lock() {
                *time_guard = Some(SystemTime::now());
            }
            
            Ok(())
        }
        Err(e) => Err(CommandError::FailedToStartProcess(e.to_string())),
    }
}

#[tauri::command]
pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    let mut process_guard = match state.singbox_process.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("Mutex was poisoned in stop_singbox, recovering...");
            poisoned.into_inner()
        }
    };

    // 首先尝试停止我们管理的进程
    if let Some(mut child) = process_guard.take() {
        println!(
            "Attempting to stop managed sing-box process (PID: {})...",
            child.id()
        );
        match child.kill() {
            Ok(_) => {
                // 使用非阻塞方式检查进程状态，避免挂起
                match child.try_wait() {
                    Ok(Some(status)) => println!(
                        "Managed sing-box process stopped successfully with status: {}",
                        status
                    ),
                    Ok(None) => {
                        println!("Managed sing-box process is still terminating, will be cleaned up by OS");
                        // 进程仍在终止中，我们不等待它
                    }
                    Err(e) => eprintln!("Error checking managed sing-box process status: {}", e),
                }
                
                // 清除外部进程标记
                if let Ok(mut external_flag) = state.external_process_detected.lock() {
                    *external_flag = false;
                }
                
                return Ok(());
            }
            Err(e) => {
                *process_guard = None;
                return Err(CommandError::FailedToStopProcess(e.to_string()));
            }
        }
    }
    
    // 如果没有管理的进程，检查是否有外部进程需要停止
    let external_flag = match state.external_process_detected.lock() {
        Ok(flag) => *flag,
        Err(poisoned) => {
            eprintln!("External flag mutex was poisoned, recovering...");
            *poisoned.into_inner()
        }
    };
    
    if external_flag {
        println!("Attempting to stop external sing-box process...");
        
        // 尝试停止外部进程
        match stop_external_singbox_process() {
            Ok(_) => {
                println!("External sing-box process stopped successfully");
                
                // 清除外部进程标记
                if let Ok(mut external_flag) = state.external_process_detected.lock() {
                    *external_flag = false;
                }
                
                Ok(())
            }
            Err(e) => {
                eprintln!("Failed to stop external sing-box process: {:?}", e);
                Err(CommandError::FailedToStopProcess(format!("Failed to stop external process: {:?}", e)))
            }
        }
    } else {
        Err(CommandError::ProcessNotRunning)
    }
}

#[tauri::command]
pub async fn is_singbox_running(state: State<'_, SingboxState>) -> Result<bool, CommandError> {
    let mut process_guard = match state.singbox_process.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("Mutex was poisoned in is_singbox_running, recovering...");
            poisoned.into_inner()
        }
    };

    // 首先检查我们管理的进程
    if let Some(child) = &mut *process_guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                // 进程已经结束，清理状态
                *process_guard = None;
                // 继续检查是否有外部进程
            }
            Ok(None) => return Ok(true), // 我们的进程还在运行
            Err(_) => {
                // 发生错误，清理状态
                *process_guard = None;
                // 继续检查是否有外部进程
            }
        }
    }
    
    // 如果我们没有管理的进程，检查外部进程标记（避免频繁系统调用）
    let external_flag = match state.external_process_detected.lock() {
        Ok(flag) => *flag,
        Err(poisoned) => {
            eprintln!("External flag mutex was poisoned, recovering...");
            *poisoned.into_inner()
        }
    };
    
    Ok(external_flag)
}

// 初始化时检测现有的sing-box进程
#[tauri::command]
pub async fn initialize_singbox_state(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    println!("Initializing sing-box state...");
    
    // 检测系统中是否有sing-box进程
    let has_existing = state.detect_existing_singbox()?;
    
    if has_existing {
        println!("Found existing sing-box process, updating state to running");
        
        // 设置外部进程标记
        if let Ok(mut external_flag) = state.external_process_detected.lock() {
            *external_flag = true;
        }
        
        // 获取进程详细信息
        let process_info = get_singbox_process_info()?;
        
        Ok(format!("Sing-box is running (External Process) - {}", process_info))
    } else {
        println!("No existing sing-box process found");
        
        // 清除外部进程标记
        if let Ok(mut external_flag) = state.external_process_detected.lock() {
            *external_flag = false;
        }
        
        Ok("No sing-box process detected".to_string())
    }
}

// 停止外部的sing-box进程
fn stop_external_singbox_process() -> Result<(), CommandError> {
    #[cfg(windows)]
    {
        // 在Windows上使用taskkill命令停止所有sing-box.exe进程
        let output = Command::new("taskkill")
            .args(["/f", "/im", "sing-box.exe"])
            .output()
            .map_err(|e| CommandError::FailedToStopProcess(format!("Failed to run taskkill: {}", e)))?;
        
        if output.status.success() {
            println!("Successfully killed external sing-box.exe processes");
            Ok(())
        } else {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            Err(CommandError::FailedToStopProcess(format!("taskkill failed: {}", error_msg)))
        }
    }
    
    #[cfg(not(windows))]
    {
        // 在Unix系统上使用pkill命令停止sing-box进程
        let output = Command::new("pkill")
            .args(["-f", "sing-box"])
            .output()
            .map_err(|e| CommandError::FailedToStopProcess(format!("Failed to run pkill: {}", e)))?;
        
        if output.status.success() {
            println!("Successfully killed external sing-box processes");
            Ok(())
        } else {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            Err(CommandError::FailedToStopProcess(format!("pkill failed: {}", error_msg)))
        }
    }
}

// 获取sing-box进程信息
fn get_singbox_process_info() -> Result<String, CommandError> {
    #[cfg(windows)]
    {
        let output = Command::new("tasklist")
            .args(["/fi", "imagename eq sing-box.exe", "/fo", "table"])
            .output()
            .map_err(|e| CommandError::FailedToStartProcess(format!("Failed to get process info: {}", e)))?;
        
        let output_str = String::from_utf8_lossy(&output.stdout);
        
        // 解析输出获取PID和内存使用情况
        for line in output_str.lines() {
            if line.contains("sing-box.exe") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    let pid = parts[1];
                    let memory = parts[4];
                    return Ok(format!("PID: {}, Memory: {}", pid, memory));
                }
            }
        }
        
        Ok("Process found but details unavailable".to_string())
    }
    
    #[cfg(not(windows))]
    {
        let output = Command::new("ps")
            .args(["-eo", "pid,rss,comm", "-C", "sing-box"])
            .output()
            .map_err(|e| CommandError::FailedToStartProcess(format!("Failed to get process info: {}", e)))?;
        
        let output_str = String::from_utf8_lossy(&output.stdout);
        
        for line in output_str.lines().skip(1) { // 跳过标题行
            if line.contains("sing-box") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let pid = parts[0];
                    let memory = parts[1];
                    return Ok(format!("PID: {}, Memory: {} KB", pid, memory));
                }
            }
        }
        
        Ok("Process found but details unavailable".to_string())
    }
}

// 刷新外部进程检测状态
#[tauri::command]
pub async fn refresh_singbox_detection(state: State<'_, SingboxState>) -> Result<bool, CommandError> {
    println!("Refreshing sing-box process detection...");
    
    // 检测系统中是否有外部的sing-box进程
    let has_external = state.detect_existing_singbox().unwrap_or(false);
    
    // 更新外部进程标记
    if let Ok(mut external_flag) = state.external_process_detected.lock() {
        *external_flag = has_external;
        if has_external {
            println!("External sing-box process detected and flag updated");
        } else {
            println!("No external sing-box process found, flag cleared");
        }
    }
    
    Ok(has_external)
}

// 获取详细的sing-box运行状态
#[tauri::command]
pub async fn get_singbox_status(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    let mut process_guard = match state.singbox_process.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("Mutex was poisoned in get_singbox_status, recovering...");
            poisoned.into_inner()
        }
    };
    
    let external_flag = match state.external_process_detected.lock() {
        Ok(flag) => *flag,
        Err(poisoned) => {
            eprintln!("External flag mutex was poisoned, recovering...");
            *poisoned.into_inner()
        }
    };
    
    // 检查我们管理的进程
    let managed_running = if let Some(child) = &mut *process_guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                *process_guard = None;
                false
            }
            Ok(None) => true,
            Err(_) => {
                *process_guard = None;
                false
            }
        }
    } else {
        false
    };
    
    if managed_running {
        let pid = process_guard.as_ref().unwrap().id();
        Ok(format!("Sing-box is running (Managed Process, PID: {})", pid))
    } else if external_flag {
        // 只有在需要详细信息时才调用系统命令
        let process_info = get_singbox_process_info().unwrap_or_else(|_| "Unknown".to_string());
        Ok(format!("Sing-box is running (External Process) - {}", process_info))
    } else {
        Ok("Sing-box is not running".to_string())
    }
}

// 健康检查函数
#[tauri::command]
pub async fn health_check_singbox(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    let mut process_guard = match state.singbox_process.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("Mutex was poisoned in health_check_singbox, recovering...");
            poisoned.into_inner()
        }
    };

    if let Some(child) = &mut *process_guard {
        match child.try_wait() {
            Ok(Some(status)) => {
                // 进程已经结束
                *process_guard = None;
                Ok(format!("Process exited with status: {}", status))
            }
            Ok(None) => Ok(format!("Process running (PID: {})", child.id())),
            Err(e) => {
                *process_guard = None;
                Ok(format!("Process check failed: {}", e))
            }
        }
    } else {
        Ok("No process running".to_string())
    }
}

// 直接调用的初始化函数（不通过Tauri命令系统）
pub async fn initialize_singbox_directly(state: &SingboxState) -> Result<String, CommandError> {
    println!("Initializing sing-box state...");
    
    // 检测系统中是否有sing-box进程
    let has_existing = state.detect_existing_singbox()?;
    
    if has_existing {
        println!("Found existing sing-box process, updating state to running");
        
        // 设置外部进程标记
        if let Ok(mut external_flag) = state.external_process_detected.lock() {
            *external_flag = true;
        }
        
        // 获取进程详细信息
        let process_info = get_singbox_process_info()?;
        
        Ok(format!("Sing-box is running (External Process) - {}", process_info))
    } else {
        println!("No existing sing-box process found");
        
        // 清除外部进程标记
        if let Ok(mut external_flag) = state.external_process_detected.lock() {
            *external_flag = false;
        }
        
        Ok("No sing-box process detected".to_string())
    }
}

// 直接调用的刷新检测函数（不通过Tauri命令系统）
pub async fn refresh_singbox_detection_directly(state: &SingboxState) -> Result<bool, CommandError> {
    // 检测系统中是否有外部的sing-box进程
    let has_external = state.detect_existing_singbox().unwrap_or(false);
    
    // 更新外部进程标记
    if let Ok(mut external_flag) = state.external_process_detected.lock() {
        *external_flag = has_external;
    }
    
    Ok(has_external)
}

// 清理系统资源的函数
pub fn cleanup_process(state: &SingboxState) {
    let mut process_guard = match state.singbox_process.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("Mutex was poisoned in cleanup_process, recovering...");
            poisoned.into_inner()
        }
    };
    
    if let Some(mut child) = process_guard.take() {
        println!("Cleaning up sing-box process (PID: {})...", child.id());
        let _ = child.kill();
        
        // 使用非阻塞方式检查进程状态，避免主线程挂起
        match child.try_wait() {
            Ok(Some(status)) => {
                println!("Sing-box process terminated with status: {}", status);
            }
            Ok(None) => {
                println!("Sing-box process is still running, will be cleaned up by OS");
                // 进程仍在运行，但我们不等待它，让操作系统清理
            }
            Err(e) => {
                eprintln!("Error checking sing-box process status: {}", e);
            }
        }
    }
}
