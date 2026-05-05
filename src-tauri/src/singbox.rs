// singbox.rs - 管理 singbox 进程的启动和停止

use crate::errors::CommandError;
use serde_json::Value;
use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};
use tauri::State;

struct ProcessState {
    child: Option<Child>,
    pid: Option<u32>,
    last_start_time: Option<SystemTime>,
    is_starting: bool,
    #[cfg(windows)]
    system: sysinfo::System,
}

impl Default for ProcessState {
    fn default() -> Self {
        Self {
            child: None,
            pid: None,
            last_start_time: None,
            is_starting: false,
            #[cfg(windows)]
            system: sysinfo::System::new(),
        }
    }
}

#[derive(Clone, Default)]
pub struct SingboxState {
    inner: Arc<Mutex<ProcessState>>,
}

enum ProcessOrigin {
    Direct(u32),
    Tracked(u32),
    Detected(u32),
}

struct StartupFlagGuard {
    state: SingboxState,
}

impl StartupFlagGuard {
    fn new(state: SingboxState) -> Self {
        Self { state }
    }
}

impl Drop for StartupFlagGuard {
    fn drop(&mut self) {
        if let Ok(mut process_state) = self.state.lock("startup_flag_guard") {
            process_state.is_starting = false;
        }
    }
}

impl SingboxState {
    pub fn new() -> Self {
        Self::default()
    }

    fn lock(&self, label: &str) -> Result<MutexGuard<'_, ProcessState>, CommandError> {
        self.inner
            .lock()
            .map_err(|_| CommandError::invalid_state(label, "process state mutex poisoned"))
    }
}

#[cfg(windows)]
fn refresh_process_table(process_state: &mut ProcessState) {
    process_state
        .system
        .refresh_processes(sysinfo::ProcessesToUpdate::All, true);
}

#[cfg(windows)]
fn is_singbox_process_name(process_name: &std::ffi::OsStr) -> bool {
    process_name
        .to_string_lossy()
        .to_lowercase()
        .contains("sing-box")
}

fn detect_existing_singbox(
    process_state: &mut ProcessState,
    refresh_table: bool,
) -> Result<Option<u32>, CommandError> {
    #[cfg(windows)]
    {
        if refresh_table {
            refresh_process_table(process_state);
        }

        for (pid, process) in process_state.system.processes() {
            if is_singbox_process_name(process.name()) {
                println!(
                    "Detected existing sing-box process (PID: {}, Name: {})",
                    pid,
                    process.name().to_string_lossy()
                );
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

fn is_process_running(process_state: &mut ProcessState, pid: u32, refresh_table: bool) -> bool {
    #[cfg(windows)]
    {
        if refresh_table {
            refresh_process_table(process_state);
        }

        if let Some(process) = process_state.system.process(sysinfo::Pid::from_u32(pid)) {
            is_singbox_process_name(process.name())
        } else {
            false
        }
    }

    #[cfg(not(windows))]
    {
        let proc_path = format!("/proc/{}", pid);
        std::path::Path::new(&proc_path).exists()
    }
}

fn clear_process_state(state: &mut ProcessState) {
    state.child = None;
    state.pid = None;
    state.last_start_time = None;
}

fn detect_and_track_existing_process(
    process_state: &mut ProcessState,
) -> Result<Option<(u32, String)>, CommandError> {
    match detect_existing_singbox(process_state, true)? {
        Some(pid) => {
            process_state.child = None;
            process_state.pid = Some(pid);
            let process_info = get_singbox_process_info_by_pid(process_state, pid, false)?;
            Ok(Some((pid, process_info)))
        }
        None => {
            clear_process_state(process_state);
            Ok(None)
        }
    }
}

fn inspect_running_process(
    process_state: &mut ProcessState,
) -> Result<Option<ProcessOrigin>, CommandError> {
    if let Some(child) = &mut process_state.child {
        match child.try_wait() {
            Ok(Some(_)) => {
                clear_process_state(process_state);
            }
            Ok(None) => {
                let pid = child.id();
                process_state.pid = Some(pid);
                return Ok(Some(ProcessOrigin::Direct(pid)));
            }
            Err(_) => {
                clear_process_state(process_state);
            }
        }
    }

    if let Some(pid) = process_state.pid {
        if is_process_running(process_state, pid, true) {
            return Ok(Some(ProcessOrigin::Tracked(pid)));
        }

        process_state.pid = None;
        process_state.last_start_time = None;

        match detect_existing_singbox(process_state, false)? {
            Some(pid) => {
                process_state.pid = Some(pid);
                return Ok(Some(ProcessOrigin::Detected(pid)));
            }
            None => {
                clear_process_state(process_state);
                return Ok(None);
            }
        }
    }

    match detect_existing_singbox(process_state, true)? {
        Some(pid) => {
            process_state.pid = Some(pid);
            Ok(Some(ProcessOrigin::Detected(pid)))
        }
        None => {
            clear_process_state(process_state);
            Ok(None)
        }
    }
}

fn initialize_state_inner(state: &SingboxState) -> Result<String, CommandError> {
    println!("Initializing sing-box state...");
    let mut process_state = state.lock("initialize_singbox_state")?;

    match detect_and_track_existing_process(&mut process_state)? {
        Some((pid, process_info)) => {
            println!(
                "Found existing sing-box process (PID: {}), taking over management",
                pid
            );
            Ok(format!(
                "Sing-box is running (PID: {}) - {}",
                pid, process_info
            ))
        }
        None => {
            println!("No existing sing-box process found");
            Ok("No sing-box process detected".to_string())
        }
    }
}

fn refresh_detection_inner(state: &SingboxState) -> Result<bool, CommandError> {
    println!("Refreshing sing-box process detection...");
    let mut process_state = state.lock("refresh_singbox_detection")?;
    Ok(detect_and_track_existing_process(&mut process_state)?.is_some())
}

fn terminate_child_process(
    child: &mut Child,
    wait_timeout: Option<Duration>,
) -> Result<(), CommandError> {
    let pid = child.id();
    child
        .kill()
        .map_err(|error| CommandError::FailedToStopProcess(error.to_string()))?;

    if let Some(timeout) = wait_timeout {
        let start_time = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    println!(
                        "Sing-box process (PID: {}) terminated with status: {}",
                        pid, status
                    );
                    break;
                }
                Ok(None) if start_time.elapsed() <= timeout => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Ok(None) => {
                    println!(
                        "Timeout waiting for sing-box process (PID: {}) to terminate",
                        pid
                    );
                    break;
                }
                Err(error) => {
                    return Err(CommandError::FailedToStopProcess(format!(
                        "Failed to wait for process PID {}: {}",
                        pid, error
                    )));
                }
            }
        }
    } else {
        child
            .wait()
            .map_err(|error| CommandError::FailedToStopProcess(error.to_string()))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, SingboxState>,
    config_path: String,
) -> Result<(), CommandError> {
    {
        let mut process_state = state.lock("start_singbox")?;
        if process_state.is_starting || inspect_running_process(&mut process_state)?.is_some() {
            return Err(CommandError::ProcessAlreadyRunning);
        }
        process_state.is_starting = true;
    }
    let _startup_flag_guard = StartupFlagGuard::new(state.inner().clone());

    let startup_result = async {
        let singbox_path = crate::config::get_active_singbox_core_executable()?;

        let log_dir = crate::config::get_log_dir()?;
        let data_dir = crate::config::get_data_dir()?;

        let log_file_path = log_dir.join("singbox.log");
        let log_file = std::fs::File::create(&log_file_path)
            .map_err(|error| CommandError::resource_not_found("log file", error))?;

        if !std::path::Path::new(&config_path).exists() {
            return Err(CommandError::resource_not_found(
                "config file",
                &config_path,
            ));
        }

        let config_content = fs::read_to_string(&config_path)?;
        let mut base_config: Value = serde_json::from_str(&config_content)?;

        if let Some(override_config) =
            crate::config_override::get_override_config_if_enabled().await?
        {
            crate::config_override::apply_config_override(&mut base_config, &override_config);
        }

        let priority_config = crate::priority_config::load_priority_config().await?;
        if let Err(error) =
            crate::priority_config::apply_priority_config(&mut base_config, &priority_config)
        {
            eprintln!(
                "Warning: Failed to apply priority configuration: {:?}",
                error
            );
        }

        let temp_config_path = data_dir.join("temp_config.json");
        fs::write(
            &temp_config_path,
            serde_json::to_string_pretty(&base_config)?,
        )?;

        let mut command = Command::new(&*singbox_path.to_string_lossy());
        command
            .args(["run", "-c", &*temp_config_path.to_string_lossy()])
            .current_dir(&data_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::from(log_file.try_clone()?))
            .stderr(Stdio::from(log_file));

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        command
            .spawn()
            .map_err(|error| CommandError::FailedToStartProcess(error.to_string()))
    }
    .await;

    let mut process_state = state.lock("start_singbox_finalize")?;

    match startup_result {
        Ok(child) => {
            let pid = child.id();
            println!("Sing-box process started successfully (PID: {}).", pid);
            process_state.child = Some(child);
            process_state.pid = Some(pid);
            process_state.last_start_time = Some(SystemTime::now());
            Ok(())
        }
        Err(error) => {
            clear_process_state(&mut process_state);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    let (managed_child, tracked_pid) = {
        let mut process_state = state.lock("stop_singbox")?;
        let child = process_state.child.take();
        let pid = process_state.pid.take();
        process_state.last_start_time = None;
        process_state.is_starting = false;
        (child, pid)
    };

    if let Some(mut child) = managed_child {
        let pid = child.id();
        println!(
            "Attempting to stop managed sing-box process (PID: {})...",
            pid
        );

        return terminate_child_process(&mut child, None);
    }

    if let Some(pid) = tracked_pid {
        println!("Attempting to stop sing-box process by PID: {}", pid);
        let mut process_state = state.lock("stop_singbox_by_pid")?;
        return stop_process_by_pid(&mut process_state, pid);
    }

    let mut process_state = state.lock("stop_any_singbox_process")?;
    match stop_any_singbox_process(&mut process_state) {
        Ok(true) => {
            println!("Stopped sing-box process");
            Ok(())
        }
        Ok(false) => Err(CommandError::ProcessNotRunning),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn is_singbox_running(state: State<'_, SingboxState>) -> Result<bool, CommandError> {
    let mut process_state = state.lock("is_singbox_running")?;
    Ok(inspect_running_process(&mut process_state)?.is_some())
}

#[tauri::command]
pub async fn initialize_singbox_state(
    state: State<'_, SingboxState>,
) -> Result<String, CommandError> {
    initialize_state_inner(&state)
}

#[cfg(windows)]
fn stop_process_by_pid(process_state: &mut ProcessState, pid: u32) -> Result<(), CommandError> {
    refresh_process_table(process_state);

    if let Some(process) = process_state.system.process(sysinfo::Pid::from_u32(pid)) {
        let process_name = process.name().to_string_lossy().to_lowercase();
        if process_name.contains("sing-box") || process_name.contains("sing-box.exe") {
            println!(
                "Attempting to kill sing-box process (PID: {}, Name: {})",
                pid,
                process.name().to_string_lossy()
            );

            if process.kill() {
                println!("Successfully terminated sing-box process (PID: {})", pid);
                Ok(())
            } else {
                Err(CommandError::FailedToStopProcess(format!(
                    "Failed to terminate process PID: {}",
                    pid
                )))
            }
        } else {
            Err(CommandError::FailedToStopProcess(format!(
                "Process PID {} is not a sing-box process",
                pid
            )))
        }
    } else {
        Err(CommandError::ProcessNotRunning)
    }
}

#[cfg(not(windows))]
fn stop_process_by_pid(_process_state: &mut ProcessState, pid: u32) -> Result<(), CommandError> {
    let _ = pid;
    Err(CommandError::invalid_state(
        "stop_process_by_pid",
        "non-Windows process termination is not implemented",
    ))
}

#[cfg(windows)]
fn stop_any_singbox_process(process_state: &mut ProcessState) -> Result<bool, CommandError> {
    refresh_process_table(process_state);

    let mut killed_any = false;

    for (pid, process) in process_state.system.processes() {
        let process_name = process.name().to_string_lossy().to_lowercase();
        if process_name.contains("sing-box") || process_name.contains("sing-box.exe") {
            println!(
                "Attempting to kill sing-box process (PID: {}, Name: {})",
                pid,
                process.name().to_string_lossy()
            );

            if process.kill() {
                killed_any = true;
                println!("Successfully terminated sing-box process (PID: {})", pid);
            } else {
                eprintln!("Failed to terminate sing-box process (PID: {})", pid);
            }
        }
    }

    Ok(killed_any)
}

#[cfg(not(windows))]
fn stop_any_singbox_process(_process_state: &mut ProcessState) -> Result<bool, CommandError> {
    Err(CommandError::invalid_state(
        "stop_any_singbox_process",
        "non-Windows process sweep is not implemented",
    ))
}

fn get_singbox_process_info_by_pid(
    process_state: &mut ProcessState,
    pid: u32,
    refresh_table: bool,
) -> Result<String, CommandError> {
    #[cfg(windows)]
    {
        if refresh_table {
            refresh_process_table(process_state);
        }

        if let Some(process) = process_state.system.process(sysinfo::Pid::from_u32(pid)) {
            if is_singbox_process_name(process.name()) {
                let memory_kb = process.memory() / 1024;
                let cpu_usage = process.cpu_usage();

                return Ok(format!("Memory: {} KB, CPU: {:.1}%", memory_kb, cpu_usage));
            }
        }
    }

    #[cfg(not(windows))]
    {
        if is_process_running(process_state, pid, refresh_table) {
            return Ok("Process metrics unavailable on this platform".to_string());
        }
    }

    Ok("Process not found or not a sing-box process".to_string())
}

#[tauri::command]
pub async fn refresh_singbox_detection(
    state: State<'_, SingboxState>,
) -> Result<bool, CommandError> {
    refresh_detection_inner(&state)
}

#[tauri::command]
pub async fn get_singbox_status(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    let mut process_state = state.lock("get_singbox_status")?;
    match inspect_running_process(&mut process_state)? {
        Some(ProcessOrigin::Direct(pid)) => {
            let process_info = get_singbox_process_info_by_pid(&mut process_state, pid, true)
                .unwrap_or_else(|_| "Unknown".to_string());
            Ok(format!(
                "Sing-box is running (Direct Management, PID: {}) - {}",
                pid, process_info
            ))
        }
        Some(ProcessOrigin::Tracked(pid)) => {
            let process_info = get_singbox_process_info_by_pid(&mut process_state, pid, false)
                .unwrap_or_else(|_| "Unknown".to_string());
            Ok(format!(
                "Sing-box is running (PID Management, PID: {}) - {}",
                pid, process_info
            ))
        }
        Some(ProcessOrigin::Detected(pid)) => {
            let process_info = get_singbox_process_info_by_pid(&mut process_state, pid, false)
                .unwrap_or_else(|_| "Unknown".to_string());
            Ok(format!(
                "Sing-box is running (Detected, PID: {}) - {}",
                pid, process_info
            ))
        }
        None => Ok("Sing-box is not running".to_string()),
    }
}

#[tauri::command]
pub async fn health_check_singbox(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    let mut process_state = state.lock("health_check_singbox")?;

    if let Some(child) = &mut process_state.child {
        match child.try_wait() {
            Ok(Some(status)) => {
                clear_process_state(&mut process_state);
                return Ok(format!(
                    "Direct managed process exited with status: {}",
                    status
                ));
            }
            Ok(None) => {
                return Ok(format!(
                    "Direct managed process running (PID: {})",
                    child.id()
                ));
            }
            Err(error) => {
                clear_process_state(&mut process_state);
                return Ok(format!("Direct managed process check failed: {}", error));
            }
        }
    }

    if let Some(pid) = process_state.pid {
        if is_process_running(&mut process_state, pid, true) {
            return Ok(format!("PID managed process running (PID: {})", pid));
        }

        clear_process_state(&mut process_state);
        return Ok("PID managed process no longer running".to_string());
    }

    Ok("No process under management".to_string())
}

pub async fn initialize_singbox_directly(state: &SingboxState) -> Result<String, CommandError> {
    initialize_state_inner(state)
}

pub async fn refresh_singbox_detection_directly(
    state: &SingboxState,
) -> Result<bool, CommandError> {
    refresh_detection_inner(state)
}

pub fn cleanup_process(state: &SingboxState) {
    let (managed_child, tracked_pid) = match state.lock("cleanup_process") {
        Ok(mut process_state) => {
            let child = process_state.child.take();
            let pid = process_state.pid.take();
            process_state.last_start_time = None;
            process_state.is_starting = false;
            (child, pid)
        }
        Err(error) => {
            eprintln!("Failed to lock sing-box state during cleanup: {}", error);
            (None, None)
        }
    };

    if let Some(mut child) = managed_child {
        let pid = child.id();
        println!(
            "Cleaning up directly managed sing-box process (PID: {})...",
            pid
        );

        match terminate_child_process(&mut child, Some(Duration::from_secs(3))) {
            Ok(_) => {
                println!("Sent kill signal to sing-box process (PID: {})", pid);
            }
            Err(error) => {
                eprintln!("Failed to kill sing-box process (PID: {}): {}", pid, error);
            }
        }
    }

    if let Some(pid) = tracked_pid {
        println!("Cleaning up PID managed sing-box process (PID: {})...", pid);
        match state.lock("cleanup_process_by_pid") {
            Ok(mut process_state) => {
                if let Err(error) = stop_process_by_pid(&mut process_state, pid) {
                    eprintln!("Failed to stop PID managed process: {:?}", error);
                }
            }
            Err(error) => {
                eprintln!(
                    "Failed to lock sing-box state during PID cleanup: {}",
                    error
                );
            }
        }
    }

    match state.lock("cleanup_process_sweep") {
        Ok(mut process_state) => {
            if let Err(error) = stop_any_singbox_process(&mut process_state) {
                eprintln!("Failed final sing-box cleanup sweep: {:?}", error);
            }
        }
        Err(error) => {
            eprintln!(
                "Failed to lock sing-box state during cleanup sweep: {}",
                error
            );
        }
    }
}
