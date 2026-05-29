// singbox.rs — manage the sing-box process lifecycle (Windows only)

use crate::errors::CommandError;
use serde_json::Value;
use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};
use tauri::State;

// ── Process state ──────────────────────────────────────────────────────────

struct ProcessState {
    child: Option<Child>,
    pid: Option<u32>,
    last_start_time: Option<SystemTime>,
    is_starting: bool,
    system: sysinfo::System,
}

impl Default for ProcessState {
    fn default() -> Self {
        Self {
            child: None,
            pid: None,
            last_start_time: None,
            is_starting: false,
            system: sysinfo::System::new(),
        }
    }
}

#[derive(Clone, Default)]
pub struct SingboxState {
    inner: Arc<Mutex<ProcessState>>,
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

enum ProcessOrigin {
    Direct(u32),
    Tracked(u32),
    Detected(u32),
}

// ── sysinfo helpers ────────────────────────────────────────────────────────

fn refresh_process_table(process_state: &mut ProcessState) {
    process_state
        .system
        .refresh_processes(sysinfo::ProcessesToUpdate::All, true);
}

fn is_singbox_process_name(process_name: &std::ffi::OsStr) -> bool {
    process_name
        .to_string_lossy()
        .to_lowercase()
        .contains("sing-box")
}

// ── Process detection ──────────────────────────────────────────────────────

fn detect_existing_singbox(
    process_state: &mut ProcessState,
    refresh_table: bool,
) -> Result<Option<u32>, CommandError> {
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

fn is_process_running(process_state: &mut ProcessState, pid: u32, refresh_table: bool) -> bool {
    if refresh_table {
        refresh_process_table(process_state);
    }
    if let Some(process) = process_state.system.process(sysinfo::Pid::from_u32(pid)) {
        is_singbox_process_name(process.name())
    } else {
        false
    }
}

fn get_singbox_process_info_by_pid(
    process_state: &mut ProcessState,
    pid: u32,
    refresh_table: bool,
) -> String {
    if refresh_table {
        refresh_process_table(process_state);
    }
    if let Some(process) = process_state.system.process(sysinfo::Pid::from_u32(pid))
        && is_singbox_process_name(process.name())
    {
        let memory_kb = process.memory() / 1024;
        let cpu_usage = process.cpu_usage();
        format!("Memory: {} KB, CPU: {:.1}%", memory_kb, cpu_usage)
    } else {
        "Process not found or not a sing-box process".to_string()
    }
}

// ── State helpers ──────────────────────────────────────────────────────────

fn clear_process_state(state: &mut ProcessState) {
    state.child = None;
    state.pid = None;
    state.last_start_time = None;
}

fn detect_and_track_existing_process(
    process_state: &mut ProcessState,
) -> Result<Option<(u32, String)>, CommandError> {
    // Prefer the directly managed child over external detection.
    if let Some(child) = &mut process_state.child {
        match child.try_wait() {
            Ok(None) => {
                let pid = child.id();
                process_state.pid = Some(pid);
                let info = get_singbox_process_info_by_pid(process_state, pid, true);
                return Ok(Some((pid, info)));
            }
            _ => clear_process_state(process_state),
        }
    }

    match detect_existing_singbox(process_state, true)? {
        Some(pid) => {
            process_state.pid = Some(pid);
            let info = get_singbox_process_info_by_pid(process_state, pid, false);
            Ok(Some((pid, info)))
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
            Ok(Some(_)) | Err(_) => clear_process_state(process_state),
            Ok(None) => {
                let pid = child.id();
                process_state.pid = Some(pid);
                return Ok(Some(ProcessOrigin::Direct(pid)));
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

// ── Process termination ────────────────────────────────────────────────────

fn terminate_child_process(
    child: &mut Child,
    wait_timeout: Option<Duration>,
) -> Result<(), CommandError> {
    let pid = child.id();
    child
        .kill()
        .map_err(|e| CommandError::FailedToStopProcess(e.to_string()))?;

    if let Some(timeout) = wait_timeout {
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    println!("sing-box (PID: {}) terminated with status: {}", pid, status);
                    break;
                }
                Ok(None) if start.elapsed() <= timeout => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Ok(None) => {
                    println!("Timeout waiting for sing-box (PID: {}) to terminate", pid);
                    break;
                }
                Err(e) => {
                    return Err(CommandError::FailedToStopProcess(format!(
                        "Failed to wait for process PID {}: {}",
                        pid, e
                    )));
                }
            }
        }
    } else {
        child
            .wait()
            .map_err(|e| CommandError::FailedToStopProcess(e.to_string()))?;
    }
    Ok(())
}

fn stop_process_by_pid(process_state: &mut ProcessState, pid: u32) -> Result<(), CommandError> {
    refresh_process_table(process_state);
    if let Some(process) = process_state.system.process(sysinfo::Pid::from_u32(pid)) {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("sing-box") {
            println!(
                "Killing sing-box process (PID: {}, Name: {})",
                pid,
                process.name().to_string_lossy()
            );
            if process.kill() {
                println!("Terminated sing-box process (PID: {})", pid);
                return Ok(());
            }
            return Err(CommandError::FailedToStopProcess(format!(
                "Failed to terminate process PID: {}",
                pid
            )));
        }
        return Err(CommandError::FailedToStopProcess(format!(
            "Process PID {} is not a sing-box process",
            pid
        )));
    }
    Err(CommandError::ProcessNotRunning)
}

fn stop_any_singbox_process(process_state: &mut ProcessState) -> Result<bool, CommandError> {
    refresh_process_table(process_state);
    let mut killed_any = false;
    for (pid, process) in process_state.system.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("sing-box") {
            println!(
                "Killing sing-box process (PID: {}, Name: {})",
                pid,
                process.name().to_string_lossy()
            );
            if process.kill() {
                killed_any = true;
                println!("Terminated sing-box process (PID: {})", pid);
            } else {
                eprintln!("Failed to terminate sing-box process (PID: {})", pid);
            }
        }
    }
    Ok(killed_any)
}

// ── Inner helpers (called from both State<> and &SingboxState paths) ───────

fn initialize_state_inner(state: &SingboxState) -> Result<String, CommandError> {
    println!("Initializing sing-box state...");
    let mut ps = state.lock("initialize_singbox_state")?;
    match detect_and_track_existing_process(&mut ps)? {
        Some((pid, info)) => {
            println!(
                "Found existing sing-box process (PID: {}), taking over",
                pid
            );
            Ok(format!("sing-box is running (PID: {}) - {}", pid, info))
        }
        None => {
            println!("No existing sing-box process found");
            Ok("No sing-box process detected".to_string())
        }
    }
}

fn refresh_detection_inner(state: &SingboxState) -> Result<bool, CommandError> {
    println!("Refreshing sing-box process detection...");
    let mut ps = state.lock("refresh_singbox_detection")?;
    Ok(detect_and_track_existing_process(&mut ps)?.is_some())
}

// ── Public async commands ──────────────────────────────────────────────────

pub async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, SingboxState>,
    config_path: String,
) -> Result<(), CommandError> {
    // Check preconditions and set is_starting under the lock.
    {
        let mut ps = state.lock("start_singbox")?;
        if ps.is_starting || inspect_running_process(&mut ps)?.is_some() {
            return Err(CommandError::ProcessAlreadyRunning);
        }
        ps.is_starting = true;
    }
    // is_starting must be cleared on every exit path.  We use a plain
    // boolean and clear it explicitly before returning, which makes the
    // drop order completely unambiguous — no implicit dependency on
    // declaration order or RAII guards that call back into the mutex.

    let startup_result = async {
        let singbox_path = crate::config::get_active_singbox_core_executable()?;
        let data_dir = crate::config::get_data_dir()?;

        if !std::path::Path::new(&config_path).exists() {
            return Err(CommandError::resource_not_found(
                "config file",
                &config_path,
            ));
        }

        let config_content = fs::read_to_string(&config_path)?;
        let mut base_config: Value = serde_json::from_str(&config_content)?;

        if let Some(override_config) = crate::config::get_override_config_if_enabled().await? {
            crate::config::apply_config_override(&mut base_config, &override_config);
        }

        let priority_config: crate::config::PriorityConfig =
            crate::config::load_named_config_or_default(
                crate::config::priority::PRIORITY_CONFIG_FILE,
            )?;
        if let Err(e) = crate::config::apply_priority_config(&mut base_config, &priority_config) {
            eprintln!("Warning: Failed to apply priority configuration: {:?}", e);
        }

        let temp_config_path = data_dir.join("temp_config.json");
        fs::write(
            &temp_config_path,
            serde_json::to_string_pretty(&base_config)?,
        )?;

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new(&*singbox_path.to_string_lossy())
            .args(["run", "-c", &*temp_config_path.to_string_lossy()])
            .current_dir(&data_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| CommandError::FailedToStartProcess(e.to_string()))
    }
    .await;

    // Always clear is_starting before returning, regardless of outcome.
    let mut ps = state.lock("start_singbox_finalize")?;
    ps.is_starting = false;

    match startup_result {
        Ok(child) => {
            let pid = child.id();
            println!("sing-box started (PID: {}).", pid);
            ps.child = Some(child);
            ps.pid = Some(pid);
            ps.last_start_time = Some(SystemTime::now());
            Ok(())
        }
        Err(e) => {
            clear_process_state(&mut ps);
            Err(e)
        }
    }
}

pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    let (managed_child, tracked_pid) = {
        let mut ps = state.lock("stop_singbox")?;
        let child = ps.child.take();
        let pid = ps.pid.take();
        ps.last_start_time = None;
        ps.is_starting = false;
        (child, pid)
    };

    if let Some(mut child) = managed_child {
        println!("Stopping managed sing-box (PID: {})...", child.id());
        return terminate_child_process(&mut child, None);
    }

    if let Some(pid) = tracked_pid {
        println!("Stopping sing-box by PID: {}", pid);
        let mut ps = state.lock("stop_singbox_by_pid")?;
        return stop_process_by_pid(&mut ps, pid);
    }

    let mut ps = state.lock("stop_any_singbox_process")?;
    match stop_any_singbox_process(&mut ps) {
        Ok(true) => {
            println!("Stopped sing-box process");
            Ok(())
        }
        Ok(false) => Err(CommandError::ProcessNotRunning),
        Err(e) => Err(e),
    }
}

pub async fn is_singbox_running(state: State<'_, SingboxState>) -> Result<bool, CommandError> {
    let mut ps = state.lock("is_singbox_running")?;
    Ok(inspect_running_process(&mut ps)?.is_some())
}

pub async fn initialize_singbox_state(
    state: State<'_, SingboxState>,
) -> Result<String, CommandError> {
    initialize_state_inner(&state)
}

pub async fn refresh_singbox_detection(
    state: State<'_, SingboxState>,
) -> Result<bool, CommandError> {
    refresh_detection_inner(&state)
}

pub async fn get_singbox_status(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    let mut ps = state.lock("get_singbox_status")?;
    match inspect_running_process(&mut ps)? {
        Some(ProcessOrigin::Direct(pid)) => {
            let info = get_singbox_process_info_by_pid(&mut ps, pid, true);
            Ok(format!(
                "sing-box is running (Direct, PID: {}) - {}",
                pid, info
            ))
        }
        Some(ProcessOrigin::Tracked(pid)) => {
            let info = get_singbox_process_info_by_pid(&mut ps, pid, false);
            Ok(format!(
                "sing-box is running (Tracked, PID: {}) - {}",
                pid, info
            ))
        }
        Some(ProcessOrigin::Detected(pid)) => {
            let info = get_singbox_process_info_by_pid(&mut ps, pid, false);
            Ok(format!(
                "sing-box is running (Detected, PID: {}) - {}",
                pid, info
            ))
        }
        None => Ok("sing-box is not running".to_string()),
    }
}

pub async fn health_check_singbox(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    let mut ps = state.lock("health_check_singbox")?;

    if let Some(child) = &mut ps.child {
        return match child.try_wait() {
            Ok(Some(status)) => {
                clear_process_state(&mut ps);
                Ok(format!(
                    "Direct managed process exited with status: {}",
                    status
                ))
            }
            Ok(None) => Ok(format!(
                "Direct managed process running (PID: {})",
                child.id()
            )),
            Err(e) => {
                clear_process_state(&mut ps);
                Ok(format!("Direct managed process check failed: {}", e))
            }
        };
    }

    if let Some(pid) = ps.pid {
        if is_process_running(&mut ps, pid, true) {
            return Ok(format!("PID managed process running (PID: {})", pid));
        }
        clear_process_state(&mut ps);
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
        Ok(mut ps) => {
            let child = ps.child.take();
            let pid = ps.pid.take();
            ps.last_start_time = None;
            ps.is_starting = false;
            (child, pid)
        }
        Err(e) => {
            eprintln!("Failed to lock sing-box state during cleanup: {}", e);
            (None, None)
        }
    };

    if let Some(mut child) = managed_child {
        let pid = child.id();
        println!("Cleaning up directly managed sing-box (PID: {})...", pid);
        if let Err(e) = terminate_child_process(&mut child, Some(Duration::from_secs(3))) {
            eprintln!("Failed to kill sing-box (PID: {}): {}", pid, e);
        }
    }

    if let Some(pid) = tracked_pid {
        println!("Cleaning up PID-managed sing-box (PID: {})...", pid);
        match state.lock("cleanup_process_by_pid") {
            Ok(mut ps) => {
                if let Err(e) = stop_process_by_pid(&mut ps, pid) {
                    eprintln!("Failed to stop PID-managed process: {:?}", e);
                }
            }
            Err(e) => eprintln!("Failed to lock sing-box state during PID cleanup: {}", e),
        }
    }

    match state.lock("cleanup_process_sweep") {
        Ok(mut ps) => {
            if let Err(e) = stop_any_singbox_process(&mut ps) {
                eprintln!("Failed final sing-box cleanup sweep: {:?}", e);
            }
        }
        Err(e) => eprintln!("Failed to lock sing-box state during cleanup sweep: {}", e),
    }
}
