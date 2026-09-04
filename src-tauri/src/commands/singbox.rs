use crate::errors::CommandError;
use crate::services::singbox::{ConnectionPhase, SingboxState};
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

/// Thin wrapper — see [`crate::services::singbox::get_daemon_state`] for
/// what this returns and how it stays current.
#[tauri::command]
pub fn get_daemon_state(state: State<'_, SingboxState>) -> ConnectionPhase {
    crate::services::singbox::get_daemon_state(state.inner())
}

/// Thin wrapper — see [`crate::services::singbox::retry_connection`] for
/// why/when to call this.
#[tauri::command]
pub fn retry_daemon_connection(state: State<'_, SingboxState>) {
    crate::services::singbox::retry_connection(state.inner());
}

/// `true` once `sing-box-daemon` is registered as a Windows service —
/// drives whether Settings shows "install" or "uninstall".
#[tauri::command]
pub fn is_daemon_service_installed() -> bool {
    crate::daemon::install::is_service_installed()
}

/// Registers `sing-box-daemon.exe` as a Windows service. Blocks on a UAC
/// prompt (see `daemon::install::run_elevated`), so it runs off the async
/// runtime's worker threads via `spawn_blocking`. On success, wakes the
/// reconciliation loop so the UI reflects the new state without waiting out
/// a backoff.
#[tauri::command]
pub async fn install_daemon_service(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    tokio::task::spawn_blocking(crate::daemon::install::install_service)
        .await
        .map_err(|e| CommandError::io("install daemon service", e))??;
    crate::services::singbox::retry_connection(state.inner());
    Ok(())
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

/// Lighter repair action for when the service is installed but the daemon
/// just isn't reachable: restarts it in place via an elevated `service
/// start` (see `daemon::install::start_service`) instead of a full
/// uninstall/reinstall, then wakes the reconciliation loop.
#[tauri::command]
pub async fn repair_daemon_service(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    tokio::task::spawn_blocking(crate::daemon::install::start_service)
        .await
        .map_err(|e| CommandError::io("repair daemon service", e))??;
    crate::services::singbox::retry_connection(state.inner());
    Ok(())
}
