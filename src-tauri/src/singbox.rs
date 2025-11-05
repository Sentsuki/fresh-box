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
    pub process_pid: Arc<Mutex<Option<u32>>>, // 记录当前管理的进程PID，无论是自启动还是接管的
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
            process_pid: Arc::new(Mutex::new(None)),
        }
    }
    
    // 检测系统中是否有sing-box进程在运行，返回进程PID
    pub fn detect_existing_singbox(&self) -> Result<Option<u32>, CommandError> {
        #[cfg(windows)]
        {
            use sysinfo::System;
            
            let mut system = System::new_all();
            system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            
            for (pid, process) in system.processes() {
                let process_name = process.name().to_string_lossy().to_lowercase();
                if process_name.contains("sing-box") || process_name.contains("sing-box.exe") {
                    println!("Detected existing sing-box process (PID: {}, Name: {})", pid, process.name().to_string_lossy());
                    return Ok(Some(pid.as_u32()));
                }
            }
            
            Ok(None)
        }
        
        #[cfg(not(windows))]
        {
            use std::fs;
            
            let proc_dir = match fs::read_dir("/proc") {
                Ok(dir) => dir,
                Err(_) => return Ok(None),
            };
            
            for entry in proc_dir {
                if let Ok(entry) = entry {
                    if let Ok(file_name) = entry.file_name().into_string() {
                        if file_name.chars().all(|c| c.is_ascii_digit()) {
                            let cmdline_path = format!("/proc/{}/cmdline", file_name);
                            if let Ok(cmdline) = fs::read_to_string(&cmdline_path) {
                                if cmdline.contains("sing-box") {
                                    if let Ok(pid) = file_name.parse::<u32>() {
                                        println!("Detected existing sing-box process (PID: {})", pid);
                                        return Ok(Some(pid));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            Ok(None)
        }
    }
    
    // 检查指定PID的进程是否还在运行
    pub fn is_process_running(&self, pid: u32) -> bool {
        use sysinfo::System;
        
        let mut system = System::new_all();
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        
        if let Some(process) = system.process(sysinfo::Pid::from_u32(pid)) {
            let process_name = process.name().to_string_lossy().to_lowercase();
            process_name.contains("sing-box") || process_name.contains("sing-box.exe")
        } else {
            false
        }
    }
}

#[tauri::command]
pub async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, SingboxState>,
    config_path: String,
) -> Result<(), CommandError> {
    // 先检查进程状态，不持有锁
    {
        let process_guard = match state.singbox_process.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                eprintln!("Mutex was poisoned in start_singbox, recovering...");
                poisoned.into_inner()
            }
        };

        if process_guard.is_some() {
            return Err(CommandError::ProcessAlreadyRunning);
        }
    } // 释放锁

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
    }

    // 检查并应用 Priority Configuration（优先级高于 Config Override）
    let priority_config = crate::priority_config::load_priority_config().await?;
    if let Err(e) = crate::priority_config::apply_priority_config(&mut base_config, &priority_config) {
        eprintln!("Warning: Failed to apply priority configuration: {:?}", e);
        // 不返回错误，继续启动，但记录警告
    }

    // 将最终配置写入临时文件
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

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.spawn() {
        Ok(child) => {
            let pid = child.id();
            println!("Sing-box process started successfully (PID: {}).", pid);
            
            // 重新获取锁来存储进程
            let mut process_guard = match state.singbox_process.lock() {
                Ok(guard) => guard,
                Err(poisoned) => {
                    eprintln!("Mutex was poisoned when storing process, recovering...");
                    poisoned.into_inner()
                }
            };
            *process_guard = Some(child);
            
            // 记录启动时间和PID
            if let Ok(mut time_guard) = state.last_start_time.lock() {
                *time_guard = Some(SystemTime::now());
            }
            if let Ok(mut pid_guard) = state.process_pid.lock() {
                *pid_guard = Some(pid);
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

    let mut pid_guard = match state.process_pid.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("PID mutex was poisoned in stop_singbox, recovering...");
            poisoned.into_inner()
        }
    };

    // 首先尝试停止我们直接管理的进程
    if let Some(mut child) = process_guard.take() {
        let pid = child.id();
        println!("Attempting to stop managed sing-box process (PID: {})...", pid);
        
        match child.kill() {
            Ok(_) => {
                match child.wait() {
                    Ok(status) => println!("Sing-box process stopped successfully with status: {}", status),
                    Err(e) => eprintln!("Error waiting for process termination: {}", e),
                }
                
                // 清除状态
                *pid_guard = None;
                return Ok(());
            }
            Err(e) => {
                *process_guard = None;
                *pid_guard = None;
                return Err(CommandError::FailedToStopProcess(e.to_string()));
            }
        }
    }
    
    // 如果没有直接管理的进程，但有记录的PID，尝试停止该进程
    if let Some(pid) = *pid_guard {
        println!("Attempting to stop sing-box process by PID: {}", pid);
        
        match stop_process_by_pid(pid) {
            Ok(_) => {
                println!("Sing-box process (PID: {}) stopped successfully", pid);
                *pid_guard = None;
                Ok(())
            }
            Err(e) => {
                eprintln!("Failed to stop process by PID {}: {:?}", pid, e);
                *pid_guard = None; // 清除无效的PID
                Err(CommandError::FailedToStopProcess(format!("Failed to stop process: {:?}", e)))
            }
        }
    } else {
        // 最后尝试停止任何找到的sing-box进程
        match stop_any_singbox_process() {
            Ok(stopped) => {
                if stopped {
                    println!("Stopped sing-box process");
                    Ok(())
                } else {
                    Err(CommandError::ProcessNotRunning)
                }
            }
            Err(e) => Err(CommandError::FailedToStopProcess(format!("Failed to stop process: {:?}", e)))
        }
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

    let mut pid_guard = match state.process_pid.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("PID mutex was poisoned in is_singbox_running, recovering...");
            poisoned.into_inner()
        }
    };

    // 首先检查我们直接管理的进程
    if let Some(child) = &mut *process_guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                // 进程已经结束，清理状态
                *process_guard = None;
                *pid_guard = None;
            }
            Ok(None) => return Ok(true), // 我们的进程还在运行
            Err(_) => {
                // 发生错误，清理状态
                *process_guard = None;
                *pid_guard = None;
            }
        }
    }
    
    // 如果有记录的PID，检查该进程是否还在运行
    if let Some(pid) = *pid_guard {
        if state.is_process_running(pid) {
            return Ok(true);
        } else {
            // 进程已经不存在，清理PID
            *pid_guard = None;
        }
    }
    
    // 最后检查系统中是否有任何sing-box进程
    match state.detect_existing_singbox() {
        Ok(Some(pid)) => {
            // 发现了进程，更新PID记录以便后续管理
            *pid_guard = Some(pid);
            println!("Detected and now managing existing sing-box process (PID: {})", pid);
            Ok(true)
        }
        Ok(None) => Ok(false),
        Err(e) => {
            eprintln!("Failed to detect existing process: {:?}", e);
            Ok(false)
        }
    }
}

// 初始化时检测现有的sing-box进程
#[tauri::command]
pub async fn initialize_singbox_state(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    println!("Initializing sing-box state...");
    
    // 检测系统中是否有sing-box进程
    match state.detect_existing_singbox()? {
        Some(pid) => {
            println!("Found existing sing-box process (PID: {}), taking over management", pid);
            
            // 记录PID以便后续管理
            if let Ok(mut pid_guard) = state.process_pid.lock() {
                *pid_guard = Some(pid);
            }
            
            // 获取进程详细信息
            let process_info = get_singbox_process_info_by_pid(pid)?;
            
            Ok(format!("Sing-box is running (PID: {}) - {}", pid, process_info))
        }
        None => {
            println!("No existing sing-box process found");
            
            // 清除状态
            if let Ok(mut pid_guard) = state.process_pid.lock() {
                *pid_guard = None;
            }
            
            Ok("No sing-box process detected".to_string())
        }
    }
}

// 通过PID停止指定的进程
fn stop_process_by_pid(pid: u32) -> Result<(), CommandError> {
    use sysinfo::System;
    
    let mut system = System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    
    if let Some(process) = system.process(sysinfo::Pid::from_u32(pid)) {
        let process_name = process.name().to_string_lossy().to_lowercase();
        if process_name.contains("sing-box") || process_name.contains("sing-box.exe") {
            println!("Attempting to kill sing-box process (PID: {}, Name: {})", pid, process.name().to_string_lossy());
            
            #[cfg(windows)]
            {
                if process.kill() {
                    println!("Successfully terminated sing-box process (PID: {})", pid);
                    Ok(())
                } else {
                    Err(CommandError::FailedToStopProcess(format!("Failed to terminate process PID: {}", pid)))
                }
            }
            
            #[cfg(not(windows))]
            {
                use sysinfo::Signal;
                if process.kill_with(Signal::Term).unwrap_or(false) {
                    println!("Successfully sent SIGTERM to sing-box process (PID: {})", pid);
                    Ok(())
                } else {
                    Err(CommandError::FailedToStopProcess(format!("Failed to send SIGTERM to process PID: {}", pid)))
                }
            }
        } else {
            Err(CommandError::FailedToStopProcess(format!("Process PID {} is not a sing-box process", pid)))
        }
    } else {
        Err(CommandError::ProcessNotRunning)
    }
}

// 停止任何找到的sing-box进程
fn stop_any_singbox_process() -> Result<bool, CommandError> {
    use sysinfo::System;
    
    let mut system = System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    
    let mut killed_any = false;
    
    for (pid, process) in system.processes() {
        let process_name = process.name().to_string_lossy().to_lowercase();
        if process_name.contains("sing-box") || process_name.contains("sing-box.exe") {
            println!("Attempting to kill sing-box process (PID: {}, Name: {})", pid, process.name().to_string_lossy());
            
            #[cfg(windows)]
            {
                if process.kill() {
                    killed_any = true;
                    println!("Successfully terminated sing-box process (PID: {})", pid);
                } else {
                    eprintln!("Failed to terminate sing-box process (PID: {})", pid);
                }
            }
            
            #[cfg(not(windows))]
            {
                use sysinfo::Signal;
                if process.kill_with(Signal::Term).unwrap_or(false) {
                    killed_any = true;
                    println!("Successfully sent SIGTERM to sing-box process (PID: {})", pid);
                } else {
                    eprintln!("Failed to send SIGTERM to sing-box process (PID: {})", pid);
                }
            }
        }
    }
    
    Ok(killed_any)
}

// 获取指定PID的sing-box进程信息
fn get_singbox_process_info_by_pid(pid: u32) -> Result<String, CommandError> {
    use sysinfo::System;
    
    let mut system = System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    
    if let Some(process) = system.process(sysinfo::Pid::from_u32(pid)) {
        let process_name = process.name().to_string_lossy().to_lowercase();
        if process_name.contains("sing-box") || process_name.contains("sing-box.exe") {
            let memory_kb = process.memory() / 1024;
            let cpu_usage = process.cpu_usage();
            
            return Ok(format!(
                "Memory: {} KB, CPU: {:.1}%", 
                memory_kb, 
                cpu_usage
            ));
        }
    }
    
    Ok("Process not found or not a sing-box process".to_string())
}



// 刷新进程检测状态
#[tauri::command]
pub async fn refresh_singbox_detection(state: State<'_, SingboxState>) -> Result<bool, CommandError> {
    println!("Refreshing sing-box process detection...");
    
    let mut pid_guard = match state.process_pid.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("PID mutex was poisoned in refresh_singbox_detection, recovering...");
            poisoned.into_inner()
        }
    };
    
    // 检测系统中是否有sing-box进程
    match state.detect_existing_singbox().unwrap_or(None) {
        Some(pid) => {
            *pid_guard = Some(pid);
            println!("Sing-box process detected (PID: {}) and now under management", pid);
            Ok(true)
        }
        None => {
            *pid_guard = None;
            println!("No sing-box process found");
            Ok(false)
        }
    }
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
    
    let mut pid_guard = match state.process_pid.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("PID mutex was poisoned in get_singbox_status, recovering...");
            poisoned.into_inner()
        }
    };
    
    // 检查我们直接管理的进程
    if let Some(child) = &mut *process_guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                *process_guard = None;
                *pid_guard = None;
            }
            Ok(None) => {
                let pid = child.id();
                let process_info = get_singbox_process_info_by_pid(pid).unwrap_or_else(|_| "Unknown".to_string());
                return Ok(format!("Sing-box is running (Direct Management, PID: {}) - {}", pid, process_info));
            }
            Err(_) => {
                *process_guard = None;
                *pid_guard = None;
            }
        }
    }
    
    // 检查记录的PID
    if let Some(pid) = *pid_guard {
        if state.is_process_running(pid) {
            let process_info = get_singbox_process_info_by_pid(pid).unwrap_or_else(|_| "Unknown".to_string());
            Ok(format!("Sing-box is running (PID Management, PID: {}) - {}", pid, process_info))
        } else {
            *pid_guard = None;
            Ok("Sing-box is not running".to_string())
        }
    } else {
        // 最后检查系统中是否有任何sing-box进程
        match state.detect_existing_singbox() {
            Ok(Some(pid)) => {
                *pid_guard = Some(pid);
                let process_info = get_singbox_process_info_by_pid(pid).unwrap_or_else(|_| "Unknown".to_string());
                Ok(format!("Sing-box is running (Detected, PID: {}) - {}", pid, process_info))
            }
            Ok(None) => Ok("Sing-box is not running".to_string()),
            Err(_) => Ok("Sing-box is not running".to_string()),
        }
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

    let mut pid_guard = match state.process_pid.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("PID mutex was poisoned in health_check_singbox, recovering...");
            poisoned.into_inner()
        }
    };

    // 检查直接管理的进程
    if let Some(child) = &mut *process_guard {
        match child.try_wait() {
            Ok(Some(status)) => {
                *process_guard = None;
                *pid_guard = None;
                Ok(format!("Direct managed process exited with status: {}", status))
            }
            Ok(None) => Ok(format!("Direct managed process running (PID: {})", child.id())),
            Err(e) => {
                *process_guard = None;
                *pid_guard = None;
                Ok(format!("Direct managed process check failed: {}", e))
            }
        }
    } else if let Some(pid) = *pid_guard {
        // 检查PID管理的进程
        if state.is_process_running(pid) {
            Ok(format!("PID managed process running (PID: {})", pid))
        } else {
            *pid_guard = None;
            Ok("PID managed process no longer running".to_string())
        }
    } else {
        Ok("No process under management".to_string())
    }
}

// 直接调用的初始化函数（不通过Tauri命令系统）
pub async fn initialize_singbox_directly(state: &SingboxState) -> Result<String, CommandError> {
    println!("Initializing sing-box state...");
    
    // 检测系统中是否有sing-box进程
    match state.detect_existing_singbox()? {
        Some(pid) => {
            println!("Found existing sing-box process (PID: {}), taking over management", pid);
            
            // 记录PID以便后续管理
            if let Ok(mut pid_guard) = state.process_pid.lock() {
                *pid_guard = Some(pid);
            }
            
            // 获取进程详细信息
            let process_info = get_singbox_process_info_by_pid(pid)?;
            
            Ok(format!("Sing-box is running (PID: {}) - {}", pid, process_info))
        }
        None => {
            println!("No existing sing-box process found");
            
            // 清除状态
            if let Ok(mut pid_guard) = state.process_pid.lock() {
                *pid_guard = None;
            }
            
            Ok("No sing-box process detected".to_string())
        }
    }
}

// 直接调用的刷新检测函数（不通过Tauri命令系统）
pub async fn refresh_singbox_detection_directly(state: &SingboxState) -> Result<bool, CommandError> {
    // 检测系统中是否有sing-box进程
    match state.detect_existing_singbox().unwrap_or(None) {
        Some(pid) => {
            if let Ok(mut pid_guard) = state.process_pid.lock() {
                *pid_guard = Some(pid);
            }
            Ok(true)
        }
        None => {
            if let Ok(mut pid_guard) = state.process_pid.lock() {
                *pid_guard = None;
            }
            Ok(false)
        }
    }
}

// 清理系统资源的函数 - 使用异步和超时机制避免挂起
pub fn cleanup_process(state: &SingboxState) {
    let mut process_guard = match state.singbox_process.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("Mutex was poisoned in cleanup_process, recovering...");
            poisoned.into_inner()
        }
    };
    
    let mut pid_guard = match state.process_pid.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("PID mutex was poisoned in cleanup_process, recovering...");
            poisoned.into_inner()
        }
    };
    
    // 清理直接管理的进程
    if let Some(mut child) = process_guard.take() {
        let pid = child.id();
        println!("Cleaning up directly managed sing-box process (PID: {})...", pid);
        
        match child.kill() {
            Ok(_) => {
                println!("Sent kill signal to sing-box process (PID: {})", pid);
                
                let start_time = std::time::Instant::now();
                let timeout = std::time::Duration::from_secs(3);
                
                loop {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            println!("Sing-box process (PID: {}) terminated with status: {}", pid, status);
                            break;
                        }
                        Ok(None) => {
                            if start_time.elapsed() > timeout {
                                println!("Timeout waiting for sing-box process (PID: {}) to terminate", pid);
                                break;
                            }
                            std::thread::sleep(std::time::Duration::from_millis(100));
                        }
                        Err(e) => {
                            eprintln!("Error checking sing-box process (PID: {}) status: {}", pid, e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to kill sing-box process (PID: {}): {}", pid, e);
            }
        }
    }
    
    // 清理PID管理的进程
    if let Some(pid) = *pid_guard {
        println!("Cleaning up PID managed sing-box process (PID: {})...", pid);
        if let Err(e) = stop_process_by_pid(pid) {
            eprintln!("Failed to stop PID managed process: {:?}", e);
        }
    }
    
    // 清理状态
    *pid_guard = None;
}
