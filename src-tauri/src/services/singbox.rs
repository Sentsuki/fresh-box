// singbox.rs — own the connection to `sing-box-daemon.exe` (Windows only).
//
// Replaces the old PID-sniffing subprocess manager entirely: fresh-box no
// longer spawns `sing-box.exe run` itself. Instead it spawns a
// `sing-box-daemon.exe worker` relay (see `crate::daemon::worker`), talks
// gRPC to the privileged daemon service through it, and asks the daemon to
// start/stop the sing-box instance on our behalf. See `crate::daemon` for
// the transport plumbing and `crate::daemon::install` for why the worker
// hop and the fixed install layout are both load-bearing, not incidental.
//
// Connection lifecycle is a single, always-running reconciliation loop
// (`spawn_reconciliation_loop`) modeled on the official Electron client's
// `DaemonState`/`loopConnection()` (`sing-box-for-desktop/src/main/state.ts`):
// connect, claim ownership, subscribe to status, and on any failure or
// disconnect back off and retry — publishing every phase change as a
// `daemon-state-changed` event the frontend just listens to. This replaces
// what used to be several independent one-shot checks (a fire-and-forget
// connect at app startup that never retried, a window-focus reconnect that
// never told the frontend anything, a `is_singbox_running` poll that only
// ran while already believed running) with no shared retry/backoff and no
// way for the frontend to learn about most kinds of state change — which is
// exactly what let the UI drift out of sync with reality (e.g. showing
// "not running" right after a reboot when boxdd had already auto-resumed
// the last config on its own, see `Daemon.restore()` upstream).

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex, Notify, watch};

use crate::daemon::daemon_api::ServiceStatus;
use crate::daemon::daemon_api::service_status::Type as ServiceStatusType;
use crate::daemon::desktop_api::DaemonOwnership;
use crate::daemon::{DaemonClient, DaemonConnection};
use crate::errors::CommandError;

/// The Tauri event name every `ConnectionPhase` change is published under.
pub const DAEMON_STATE_EVENT: &str = "daemon-state-changed";

/// sing-box's own run state, once we're actually connected — mirrors
/// `daemon_api::service_status::Type` in a form that serializes cleanly for
/// the frontend (the generated prost enum doesn't derive `Serialize`).
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SingboxRunState {
    Idle,
    Starting,
    Started,
    Stopping,
    Fatal,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SingboxStatus {
    pub state: SingboxRunState,
    pub error_message: String,
}

fn to_singbox_status(status: &ServiceStatus) -> SingboxStatus {
    let state = match status.status() {
        ServiceStatusType::Idle => SingboxRunState::Idle,
        ServiceStatusType::Starting => SingboxRunState::Starting,
        ServiceStatusType::Started => SingboxRunState::Started,
        ServiceStatusType::Stopping => SingboxRunState::Stopping,
        ServiceStatusType::Fatal => SingboxRunState::Fatal,
    };
    SingboxStatus {
        state,
        error_message: status.error_message.clone(),
    }
}

/// The daemon connection's current phase — the single source of truth the
/// frontend renders off, published on every change via `DAEMON_STATE_EVENT`
/// and readable synchronously through the `get_daemon_state` command for a
/// component's first render. Mirrors the official client's
/// `DaemonConnectionState` (`shared/ipc.ts`) phase for phase, including the
/// two states fresh-box previously didn't model at all: a stale service
/// left running after an app update (`VersionMismatch`) and a daemon
/// already claimed by a different Windows user session
/// (`OwnedByOtherUser`) — both used to just surface as an opaque
/// `CommandError` with no dedicated UI.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(tag = "phase", rename_all = "kebab-case")]
pub enum ConnectionPhase {
    /// Establishing (or re-establishing) the connection — also the phase
    /// while backed off waiting to retry after a failure.
    Connecting,
    /// Connected and owning (or nobody yet owns) the daemon's working
    /// directory. `status` is the actual sing-box instance state.
    Connected { status: SingboxStatus },
    /// `sing-box-daemon` isn't registered as a Windows service at all —
    /// see `daemon::install`.
    NotInstalled,
    /// The running service reports a different version than the daemon exe
    /// bundled with this install (stale service after an app update).
    #[serde(rename_all = "camelCase")]
    VersionMismatch {
        daemon_version: String,
        bundled_version: String,
    },
    /// Another Windows user session already owns the daemon.
    OwnedByOtherUser,
    /// Couldn't connect for some other reason (worker spawn failure, pipe
    /// error, RPC error, ...).
    #[serde(rename_all = "camelCase")]
    Unavailable { error_message: String },
}

impl ConnectionPhase {
    fn running(&self) -> bool {
        matches!(
            self,
            ConnectionPhase::Connected {
                status: SingboxStatus {
                    state: SingboxRunState::Started,
                    ..
                }
            }
        )
    }
}

#[derive(Clone)]
pub struct SingboxState {
    client: Arc<Mutex<Option<DaemonClient>>>,
    phase_tx: Arc<watch::Sender<ConnectionPhase>>,
    phase_rx: watch::Receiver<ConnectionPhase>,
    /// Lets `retry_connection` (window focus, right after installing the
    /// service, ...) cut a backoff sleep short instead of waiting it out —
    /// mirrors the official client's `DaemonState.retryConnection()`.
    retry: Arc<Notify>,
    /// Set once, right before a real app exit, so the loop stops instead of
    /// immediately reconnecting when `cleanup_process` tears the connection
    /// down out from under it. NOT set by every `cleanup_process` call (see
    /// its doc comment) — only real shutdown should stop the loop.
    shutting_down: Arc<AtomicBool>,
}

impl SingboxState {
    pub fn new() -> Self {
        let (phase_tx, phase_rx) = watch::channel(ConnectionPhase::Connecting);
        Self {
            client: Arc::new(Mutex::new(None)),
            phase_tx: Arc::new(phase_tx),
            phase_rx,
            retry: Arc::new(Notify::new()),
            shutting_down: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl Default for SingboxState {
    fn default() -> Self {
        Self::new()
    }
}

/// Get a handle to the live gRPC connection, if one exists. Used by the
/// other daemon-backed services (`daemon_control`, `streams`) that need to
/// issue their own calls/subscriptions without going through this module,
/// and by `start_singbox`/`stop_singbox` below. The reconciliation loop is
/// solely responsible for populating this — nothing here connects on
/// demand any more.
pub async fn get_connection(state: &SingboxState) -> Result<DaemonConnection, CommandError> {
    let guard = state.client.lock().await;
    guard
        .as_ref()
        .map(|c| c.connection.clone())
        .ok_or(CommandError::ProcessNotRunning)
}

/// Wake a backed-off reconciliation loop to retry immediately — e.g. right
/// after installing the daemon service, or when the window regains focus
/// (a cheap way to recover promptly from a phase like `Unavailable` that
/// backoff would otherwise sit out for up to 5s).
pub fn retry_connection(state: &SingboxState) {
    state.retry.notify_one();
}

/// Stop the reconciliation loop permanently. Only call this right before a
/// real app exit (see `tray.rs`'s `MENU_QUIT` handler) — the loop is meant
/// to run for the app's entire lifetime otherwise, including across a
/// `cleanup_process` call made for other reasons (e.g. disconnecting
/// before uninstalling the daemon service): in that case we *want* it to
/// keep running and pick the connection back up on its own once there's
/// something to connect to again.
pub fn stop_reconciliation_loop(state: &SingboxState) {
    state.shutting_down.store(true, Ordering::Relaxed);
    state.retry.notify_one();
}

async fn wait_or_retry(state: &SingboxState, duration: Duration) {
    tokio::select! {
        _ = tokio::time::sleep(duration) => {}
        _ = state.retry.notified() => {}
    }
}

fn publish(app: &AppHandle, state: &SingboxState, phase: ConnectionPhase) {
    let _ = state.phase_tx.send(phase.clone());
    let _ = app.emit(DAEMON_STATE_EVENT, phase);
}

enum AttemptOutcome {
    /// Was connected and ran the status subscription until the stream
    /// ended (worker died, service restarted out from under us, pipe
    /// dropped, ...) — retry immediately, no backoff.
    Disconnected,
    /// Couldn't get connected this time; the corresponding phase has
    /// already been published. Back off before retrying.
    Failed,
    /// Not installed at all — checked before ever trying to connect.
    /// Backed off on a fixed, longer interval since this won't change on
    /// its own; `retry_connection` (called right after an install) is what
    /// actually recovers this promptly in the common case.
    NotInstalled,
}

/// One full connect → claim → subscribe attempt. Runs until either it
/// fails outright or the status stream it subscribed to ends.
async fn run_reconciliation_attempt(app: &AppHandle, state: &SingboxState) -> AttemptOutcome {
    if !crate::daemon::install::is_service_installed() {
        publish(app, state, ConnectionPhase::NotInstalled);
        return AttemptOutcome::NotInstalled;
    }

    publish(app, state, ConnectionPhase::Connecting);

    let daemon_path = match crate::daemon::install::daemon_executable_path() {
        Ok(path) if path.exists() => path,
        _ => {
            publish(
                app,
                state,
                ConnectionPhase::Unavailable {
                    error_message: "sing-box-daemon executable not found".to_string(),
                },
            );
            return AttemptOutcome::Failed;
        }
    };

    let client = match DaemonClient::connect(&daemon_path).await {
        Ok(client) => client,
        Err(e) => {
            publish(
                app,
                state,
                ConnectionPhase::Unavailable {
                    error_message: e.to_string(),
                },
            );
            return AttemptOutcome::Failed;
        }
    };

    // Always fetch daemon info: it's how we learn ownership (needed every
    // attempt, not just when we can also check the version below), mirroring
    // the official client's `getDaemonInfo` call at the top of every
    // `loopConnection` iteration.
    let info = match client.connection.daemon_info().await {
        Ok(info) => info,
        Err(e) => {
            client.shutdown().await;
            publish(
                app,
                state,
                ConnectionPhase::Unavailable {
                    error_message: e.to_string(),
                },
            );
            return AttemptOutcome::Failed;
        }
    };

    // Best-effort version-consistency check, mirroring the official
    // client's `state.ts`: if the *running* privileged service reports a
    // different version than the exe currently bundled with this install
    // (e.g. the app was updated but the Windows service wasn't
    // reinstalled), refuse to claim/start against it rather than talking
    // an unknown protocol to a stale daemon. Skipped (not failed) if we
    // can't determine the bundled version at all — this is a UX/integrity
    // guard, not the actual security boundary (that's boxdd's own
    // signature/ACL checks in `security_windows.go`).
    if let Ok(bundled_version) = crate::daemon::install::bundled_daemon_version()
        && info.version != bundled_version
    {
        client.shutdown().await;
        publish(
            app,
            state,
            ConnectionPhase::VersionMismatch {
                daemon_version: info.version,
                bundled_version,
            },
        );
        return AttemptOutcome::Failed;
    }

    if info.ownership() == DaemonOwnership::Other {
        client.shutdown().await;
        publish(app, state, ConnectionPhase::OwnedByOtherUser);
        return AttemptOutcome::Failed;
    }

    if let Err(e) = client.connection.claim_service().await {
        client.shutdown().await;
        publish(
            app,
            state,
            ConnectionPhase::Unavailable {
                error_message: e.to_string(),
            },
        );
        return AttemptOutcome::Failed;
    }

    let connection = client.connection.clone();
    *state.client.lock().await = Some(client);

    let mut stream = match connection.subscribe_service_status().await {
        Ok(stream) => stream,
        Err(e) => {
            if let Some(c) = state.client.lock().await.take() {
                c.shutdown().await;
            }
            publish(
                app,
                state,
                ConnectionPhase::Unavailable {
                    error_message: e.to_string(),
                },
            );
            return AttemptOutcome::Failed;
        }
    };

    while let Ok(Some(status)) = stream.message().await {
        publish(
            app,
            state,
            ConnectionPhase::Connected {
                status: to_singbox_status(&status),
            },
        );
    }

    if let Some(c) = state.client.lock().await.take() {
        c.shutdown().await;
    }
    AttemptOutcome::Disconnected
}

/// Start the reconciliation loop. Call exactly once, at app startup (see
/// `main.rs`'s `setup()`) — it runs for the rest of the process's life
/// (until `stop_reconciliation_loop` is called right before exit),
/// continuously keeping `phase_rx`/`DAEMON_STATE_EVENT` in sync with
/// reality and self-healing from any disconnect without anything else
/// having to ask it to.
pub fn spawn_reconciliation_loop(app: AppHandle, state: SingboxState) {
    tauri::async_runtime::spawn(async move {
        let mut attempt: u32 = 0;
        loop {
            if state.shutting_down.load(Ordering::Relaxed) {
                return;
            }

            match run_reconciliation_attempt(&app, &state).await {
                AttemptOutcome::Disconnected => {
                    // Was actually connected for a while — reset the
                    // backoff and go straight back to reconnecting.
                    attempt = 0;
                    continue;
                }
                AttemptOutcome::NotInstalled => {
                    wait_or_retry(&state, Duration::from_secs(3)).await;
                }
                AttemptOutcome::Failed => {
                    attempt += 1;
                    let backoff = Duration::from_millis((1000u64 * attempt as u64).min(5000));
                    wait_or_retry(&state, backoff).await;
                }
            }
        }
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

    if state.phase_rx.borrow().running() {
        return Err(CommandError::ProcessAlreadyRunning);
    }

    let config_content = build_config_content(&config_path).await?;
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

/// Current connection phase, for a component's first render — the
/// reconciliation loop keeps this fresh from then on via `DAEMON_STATE_EVENT`.
pub fn get_daemon_state(state: &SingboxState) -> ConnectionPhase {
    state.phase_rx.borrow().clone()
}

/// Stop the sing-box instance and disconnect. Called on app quit (see
/// `tray.rs`) — preserves the old subprocess model's behavior where
/// quitting fresh-box stops the proxy rather than leaving it running
/// unattended. The daemon service itself, and any other owner, is
/// unaffected.
///
/// Also used to disconnect before uninstalling the daemon service
/// (`commands::singbox::uninstall_daemon_service`) — in that case the
/// reconciliation loop is deliberately left running: it'll settle into
/// `NotInstalled` on its own once the uninstall completes, and pick the
/// connection back up automatically if the service is ever reinstalled.
/// Only `stop_reconciliation_loop` (called separately, right before a real
/// app exit) actually stops it.
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
