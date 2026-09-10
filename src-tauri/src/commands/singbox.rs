use crate::errors::CommandError;
use crate::services::singbox::{ConnectionPhase, SingboxState};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn start_singbox(
    state: State<'_, SingboxState>,
    store: State<'_, crate::store::Store>,
    profile_id: String,
) -> Result<(), CommandError> {
    crate::services::singbox::start_singbox(state, store, profile_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    crate::services::singbox::stop_singbox(state).await
}

/// Thin wrapper — see [`crate::services::singbox::get_daemon_state`] for
/// what this returns and how it stays current.
#[tauri::command]
#[specta::specta]
pub fn get_daemon_state(state: State<'_, SingboxState>) -> ConnectionPhase {
    crate::services::singbox::get_daemon_state(state.inner())
}

/// Thin wrapper — see [`crate::services::singbox::retry_connection`] for
/// why/when to call this.
#[tauri::command]
#[specta::specta]
pub fn retry_daemon_connection(state: State<'_, SingboxState>) {
    crate::services::singbox::retry_connection(state.inner());
}

/// `true` once `sing-box-daemon` is registered as a Windows service —
/// drives whether Settings shows "install" or "uninstall".
///
/// `spawn_blocking`，因为探测是一次真正的子进程调用（`sing-box-daemon service
/// status`）：作为同步命令它会在主消息循环线程上等那个进程退出，而 Settings
/// 页一挂载就调它 —— 打开设置页时的那一下卡顿就是这么来的（审计项 H-3）。
#[tauri::command]
#[specta::specta]
pub async fn is_daemon_service_installed() -> Result<bool, CommandError> {
    tokio::task::spawn_blocking(crate::daemon::install::is_service_installed)
        .await
        .map_err(|e| CommandError::io("probe the daemon service", e))
}

/// Registers `sing-box-daemon.exe` as a Windows service. Blocks on a UAC
/// prompt (see `daemon::install::run_elevated`), so it runs off the async
/// runtime's worker threads via `spawn_blocking`. On success, wakes the
/// reconciliation loop so the UI reflects the new state without waiting out
/// a backoff.
#[tauri::command]
#[specta::specta]
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
#[specta::specta]
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
#[specta::specta]
pub async fn repair_daemon_service(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    tokio::task::spawn_blocking(crate::daemon::install::start_service)
        .await
        .map_err(|e| CommandError::io("repair daemon service", e))??;
    crate::services::singbox::retry_connection(state.inner());
    Ok(())
}

/// 从另一个 Windows 用户会话接管 daemon —— `owned-by-other-user` 相位的出口。
#[tauri::command]
#[specta::specta]
pub async fn take_over_daemon(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    let connection = crate::services::singbox::get_connection(state.inner()).await?;
    connection.take_over_service().await?;
    crate::services::singbox::retry_connection(state.inner());
    Ok(())
}
