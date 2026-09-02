use crate::errors::CommandError;
use crate::services::singbox::SingboxState;
use tauri::State;

#[tauri::command]
pub async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, SingboxState>,
    config_path: String,
) -> Result<(), CommandError> {
    crate::services::singbox::start_singbox(_app_handle, state, config_path).await
}

#[tauri::command]
pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    crate::services::singbox::stop_singbox(state).await
}

#[tauri::command]
pub async fn is_singbox_running(state: State<'_, SingboxState>) -> Result<bool, CommandError> {
    crate::services::singbox::is_singbox_running(state).await
}

#[tauri::command]
pub async fn health_check_singbox(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    crate::services::singbox::health_check_singbox(state).await
}

#[tauri::command]
pub async fn initialize_singbox_state(
    state: State<'_, SingboxState>,
) -> Result<String, CommandError> {
    crate::services::singbox::initialize_singbox_state(state).await
}

#[tauri::command]
pub async fn get_singbox_status(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    crate::services::singbox::get_singbox_status(state).await
}

#[tauri::command]
pub async fn refresh_singbox_detection(
    state: State<'_, SingboxState>,
) -> Result<bool, CommandError> {
    crate::services::singbox::refresh_singbox_detection(state).await
}

/// `true` once `sing-box-daemon` is registered as a Windows service —
/// drives whether Settings shows "install" or "uninstall".
#[tauri::command]
pub fn is_daemon_service_installed() -> bool {
    crate::daemon::install::is_service_installed()
}

/// Registers `sing-box-daemon.exe` as a Windows service. Blocks on a UAC
/// prompt (see `daemon::install::run_elevated`), so it runs off the async
/// runtime's worker threads via `spawn_blocking`. On success, immediately
/// tries to connect so the UI reflects the new state without a manual
/// refresh.
#[tauri::command]
pub async fn install_daemon_service(
    state: State<'_, SingboxState>,
) -> Result<String, CommandError> {
    tokio::task::spawn_blocking(crate::daemon::install::install_service)
        .await
        .map_err(|e| CommandError::io("install daemon service", e))??;
    crate::services::singbox::initialize_singbox_directly(state.inner()).await
}

/// Unregisters the `sing-box-daemon` Windows service. Stops our own
/// connection first so we're not holding a worker/pipe open to a service
/// that's about to disappear.
#[tauri::command]
pub async fn uninstall_daemon_service(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    crate::services::singbox::cleanup_process(state.inner()).await;
    tokio::task::spawn_blocking(crate::daemon::install::uninstall_service)
        .await
        .map_err(|e| CommandError::io("uninstall daemon service", e))?
}
