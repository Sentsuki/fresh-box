// singbox.rs — own the connection to `sing-box-daemon.exe` (Windows only).
//
// Replaces the old PID-sniffing subprocess manager entirely: fresh-box no
// longer spawns `sing-box.exe run` itself. Instead it spawns a
// `sing-box-daemon.exe worker` relay (see `crate::daemon::worker`), talks
// gRPC to the privileged daemon service through it, and asks the daemon to
// start/stop the sing-box instance on our behalf. See `crate::daemon` for
// the transport plumbing and `crate::daemon::install` for why the worker
// hop and the fixed install layout are both load-bearing, not incidental.

use std::sync::Arc;
use std::time::Duration;

use tauri::State;
use tokio::sync::{Mutex, watch};

use crate::daemon::daemon_api::ServiceStatus;
use crate::daemon::daemon_api::service_status::Type as ServiceStatusType;
use crate::daemon::{DaemonClient, DaemonConnection};
use crate::errors::CommandError;

#[derive(Clone)]
pub struct SingboxState {
    client: Arc<Mutex<Option<DaemonClient>>>,
    status_tx: Arc<watch::Sender<ServiceStatus>>,
    status_rx: watch::Receiver<ServiceStatus>,
}

impl SingboxState {
    pub fn new() -> Self {
        let (status_tx, status_rx) = watch::channel(ServiceStatus::default());
        Self {
            client: Arc::new(Mutex::new(None)),
            status_tx: Arc::new(status_tx),
            status_rx,
        }
    }
}

impl Default for SingboxState {
    fn default() -> Self {
        Self::new()
    }
}

fn describe_status(status: &ServiceStatus) -> String {
    match status.status() {
        ServiceStatusType::Idle => "sing-box is not running".to_string(),
        ServiceStatusType::Starting => "sing-box is starting".to_string(),
        ServiceStatusType::Started => "sing-box is running".to_string(),
        ServiceStatusType::Stopping => "sing-box is stopping".to_string(),
        ServiceStatusType::Fatal => {
            if status.error_message.is_empty() {
                "sing-box failed".to_string()
            } else {
                format!("sing-box failed: {}", status.error_message)
            }
        }
    }
}

/// Get a handle to the live gRPC connection, if one exists. Used by the
/// other daemon-backed services (`daemon_control`, `streams`) that need to
/// issue their own calls/subscriptions without going through this module.
pub async fn get_connection(state: &SingboxState) -> Result<DaemonConnection, CommandError> {
    let guard = state.client.lock().await;
    guard
        .as_ref()
        .map(|c| c.connection.clone())
        .ok_or(CommandError::ProcessNotRunning)
}

/// Ensure a worker + gRPC connection exists and this user owns the daemon's
/// working directory. Idempotent — a no-op if already connected. Spawns the
/// background task that keeps `status_rx` in sync the first time it
/// actually connects.
async fn ensure_connected(state: &SingboxState) -> Result<(), CommandError> {
    let mut guard = state.client.lock().await;
    if guard.is_some() {
        return Ok(());
    }

    let daemon_path = crate::daemon::install::daemon_executable_path()?;
    if !daemon_path.exists() {
        return Err(CommandError::resource_not_found(
            "sing-box-daemon executable",
            daemon_path.display(),
        ));
    }

    let client = DaemonClient::connect(&daemon_path).await?;

    // Best-effort version-consistency check, mirroring the official
    // client's `state.ts`: if the *running* privileged service reports a
    // different version than the exe currently bundled with this install
    // (e.g. the app was updated but the Windows service wasn't
    // reinstalled), refuse to claim/start against it rather than talking
    // an unknown protocol to a stale daemon. Skipped (not failed) if we
    // can't determine the bundled version at all — this is a UX/integrity
    // guard, not the actual security boundary (that's boxdd's own
    // signature/ACL checks in `security_windows.go`).
    if let Ok(bundled_version) = crate::daemon::install::bundled_daemon_version() {
        match client.connection.daemon_info().await {
            Ok(info) if info.version != bundled_version => {
                client.shutdown().await;
                return Err(CommandError::invalid_state(
                    "sing-box-daemon version mismatch",
                    format!(
                        "installed service reports version {}, but this app bundles {}. \
                         Reinstall the daemon service to continue.",
                        info.version, bundled_version
                    ),
                ));
            }
            Ok(_) => {}
            Err(e) => {
                client.shutdown().await;
                return Err(e);
            }
        }
    }

    client.connection.claim_service().await?;
    *guard = Some(client);
    drop(guard);

    spawn_status_watcher(state.clone());

    // Give the watcher a moment to report the daemon's actual current
    // state before returning, instead of leaving `status_rx` on its
    // freshly-initialized default (Idle). Without this, a caller that
    // reads `status_rx` right after this returns — e.g. `is_singbox_running`,
    // which the frontend calls once at app startup to decide whether to
    // show sing-box as running — would race the watcher's first
    // `SubscribeServiceStatus` message and report "not running" even when
    // sing-box actually is (most visibly right after a reboot, when boxdd
    // auto-resumes the last config on its own before fresh-box ever asked
    // it to: see `Daemon.restore()` upstream). Bounded so a slow/stuck
    // daemon doesn't hang every first-time connector.
    let mut rx = state.status_rx.clone();
    let _ = tokio::time::timeout(Duration::from_secs(3), rx.changed()).await;

    Ok(())
}

/// Background task: keeps `status_rx` mirroring the daemon's
/// `SubscribeServiceStatus` stream for as long as the connection lives.
/// When the stream ends (worker died, daemon service restarted out from
/// under us, pipe dropped, ...) it clears `state.client` and publishes a
/// synthetic `FATAL` status — the next call through `ensure_connected` will
/// transparently spin up a fresh worker.
fn spawn_status_watcher(state: SingboxState) {
    tauri::async_runtime::spawn(async move {
        let connection = {
            let guard = state.client.lock().await;
            match guard.as_ref() {
                Some(c) => c.connection.clone(),
                None => return,
            }
        };

        match connection.subscribe_service_status().await {
            Ok(mut stream) => loop {
                match stream.message().await {
                    Ok(Some(status)) => {
                        let _ = state.status_tx.send(status);
                    }
                    Ok(None) => break,
                    Err(e) => {
                        eprintln!("[singbox] status stream error: {}", e);
                        break;
                    }
                }
            },
            Err(e) => {
                eprintln!("[singbox] failed to subscribe to service status: {:?}", e);
            }
        }

        let mut guard = state.client.lock().await;
        if let Some(client) = guard.take() {
            drop(guard);
            client.shutdown().await;
        }
        let _ = state.status_tx.send(ServiceStatus {
            status: ServiceStatusType::Fatal as i32,
            error_message: "lost connection to sing-box-daemon".to_string(),
        });
    });
}

async fn build_config_content(config_path: &str) -> Result<String, CommandError> {
    if !std::path::Path::new(config_path).exists() {
        return Err(CommandError::resource_not_found("config file", config_path));
    }

    let config_content = std::fs::read_to_string(config_path)?;
    let mut base_config: serde_json::Value = serde_json::from_str(&config_content)?;

    if let Some(override_config) = crate::config::get_override_config_if_enabled().await? {
        crate::config::apply_config_override(&mut base_config, &override_config);
    }

    let priority_config: crate::config::PriorityConfig =
        crate::config::load_named_config_or_default(crate::config::priority::PRIORITY_CONFIG_FILE)?;
    if let Err(e) = crate::config::apply_priority_config(&mut base_config, &priority_config) {
        eprintln!("Warning: Failed to apply priority configuration: {:?}", e);
    }

    Ok(serde_json::to_string_pretty(&base_config)?)
}

// ── Public async commands ──────────────────────────────────────────────────

/// Both `StartService` and `StopService` run on the daemon under a single
/// process-wide lock (`Daemon.lifecycleAccess` in `desktop_service.go`/
/// `managed_service.go` upstream) that every other lifecycle RPC also needs
/// — so if either call hangs inside the daemon (e.g. `CloseService`/
/// `StartOrReloadService` getting stuck tearing down or standing up a
/// config), it doesn't just strand this one request, it wedges the daemon
/// for every other client too. fresh-box can't fix a hang on the other side
/// of the pipe, but it can refuse to wait on it forever: past this timeout
/// we give up and surface a clear, actionable error instead of leaving the
/// UI's pending-operation flag (and thus the Start/Stop buttons) stuck
/// forever — which previously left force-killing fresh-box.exe as the only
/// way out.
const LIFECYCLE_RPC_TIMEOUT: Duration = Duration::from_secs(20);

async fn with_lifecycle_timeout<T>(
    action: &str,
    fut: impl std::future::Future<Output = Result<T, CommandError>>,
) -> Result<T, CommandError> {
    match tokio::time::timeout(LIFECYCLE_RPC_TIMEOUT, fut).await {
        Ok(result) => result,
        Err(_) => Err(CommandError::invalid_state(
            format!("{action} timed out"),
            format!(
                "sing-box-daemon did not respond within {}s. It may still be working in the \
                 background, or it may be stuck — if this keeps happening, try restarting the \
                 sing-box-daemon Windows service (Settings > reinstall the service, or `sc stop \
                 sing-box-daemon` followed by `sc start sing-box-daemon` from an elevated \
                 prompt).",
                LIFECYCLE_RPC_TIMEOUT.as_secs()
            ),
        )),
    }
}

pub async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, SingboxState>,
    config_path: String,
) -> Result<(), CommandError> {
    let state = state.inner().clone();

    if matches!(
        state.status_rx.borrow().status(),
        ServiceStatusType::Starting | ServiceStatusType::Started
    ) {
        return Err(CommandError::ProcessAlreadyRunning);
    }

    let config_content = build_config_content(&config_path).await?;
    ensure_connected(&state).await?;

    let connection = get_connection(&state).await?;
    with_lifecycle_timeout(
        "start sing-box service",
        connection.start_service(config_content),
    )
    .await
}

pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    let state = state.inner().clone();
    let connection = get_connection(&state).await?;
    with_lifecycle_timeout("stop sing-box service", connection.stop_service()).await
}

pub async fn is_singbox_running(state: State<'_, SingboxState>) -> Result<bool, CommandError> {
    let state = state.inner().clone();

    // Best-effort: make sure we're actually connected before trusting
    // `status_rx`. This is the frontend's only way to learn the true
    // running state at app startup (`initializeApp()` calls this once,
    // synchronously, in its startup `Promise.all`), and it otherwise races
    // the fire-and-forget `initialize_singbox_directly` task `main.rs`
    // spawns from `setup()` — without this, a fast enough frontend would
    // read the watch channel's default Idle value before that background
    // task ever got the lock, and permanently believe sing-box is stopped
    // even though it's actually running (nothing re-checks after this one
    // startup call). Idempotent and near-instant once already connected,
    // so this adds no meaningful cost to the 5s steady-state poll.
    let _ = ensure_connected(&state).await;

    let status = state.status_rx.borrow().status();
    Ok(matches!(status, ServiceStatusType::Started))
}

/// Called once at app startup (see `main.rs`) and again whenever the main
/// window regains focus, to pick up a sing-box instance that was already
/// running under the daemon service from a previous session.
pub async fn initialize_singbox_directly(state: &SingboxState) -> Result<String, CommandError> {
    initialize_state_inner(state).await
}

pub async fn refresh_singbox_detection_directly(
    state: &SingboxState,
) -> Result<bool, CommandError> {
    refresh_detection_inner(state).await
}

async fn initialize_state_inner(state: &SingboxState) -> Result<String, CommandError> {
    if !crate::daemon::install::is_service_installed() {
        return Ok("sing-box-daemon service is not installed".to_string());
    }

    println!("Connecting to sing-box-daemon...");
    if let Err(e) = ensure_connected(state).await {
        eprintln!("Failed to connect to sing-box-daemon: {:?}", e);
        return Ok(format!("Failed to connect to sing-box-daemon: {}", e));
    }

    Ok(describe_status(&state.status_rx.borrow()))
}

async fn refresh_detection_inner(state: &SingboxState) -> Result<bool, CommandError> {
    if !crate::daemon::install::is_service_installed() {
        return Ok(false);
    }
    if ensure_connected(state).await.is_err() {
        return Ok(false);
    }
    Ok(matches!(
        state.status_rx.borrow().status(),
        ServiceStatusType::Starting | ServiceStatusType::Started
    ))
}

/// Stop the sing-box instance and disconnect. Called on app quit (see
/// `tray.rs`) — preserves the old subprocess model's behavior where
/// quitting fresh-box stops the proxy rather than leaving it running
/// unattended. The daemon service itself, and any other owner, is
/// unaffected.
pub async fn cleanup_process(state: &SingboxState) {
    let client = {
        let mut guard = state.client.lock().await;
        guard.take()
    };
    let Some(client) = client else { return };

    if let Err(e) = client.connection.stop_service().await {
        eprintln!("Failed to stop sing-box service during cleanup: {:?}", e);
    }
    client.shutdown().await;
}
