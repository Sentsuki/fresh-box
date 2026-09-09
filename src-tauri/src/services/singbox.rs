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

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{Mutex, Notify, watch};

use crate::daemon::daemon_api::ServiceStatus;
use crate::daemon::daemon_api::service_status::Type as ServiceStatusType;
use crate::daemon::desktop_api::{DaemonOwnership, StartOptions};
use crate::daemon::{DaemonClient, DaemonConnection};
use crate::errors::CommandError;
use crate::store::Store;

/// The Tauri event name every `ConnectionPhase` change is published under.
pub const DAEMON_STATE_EVENT: &str = "daemon-state-changed";

/// sing-box's own run state, once we're actually connected — mirrors
/// `daemon_api::service_status::Type` in a form that serializes cleanly for
/// the frontend (the generated prost enum doesn't derive `Serialize`).
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SingboxRunState {
    Idle,
    Starting,
    Started,
    Stopping,
    Fatal,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, specta::Type)]
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
#[derive(Clone, Debug, PartialEq, serde::Serialize, specta::Type)]
#[serde(tag = "phase", rename_all = "kebab-case")]
pub enum ConnectionPhase {
    /// Establishing (or re-establishing) the connection — also the phase
    /// while backed off waiting to retry after a failure.
    Connecting,
    /// Connected and owning (or nobody yet owns) the daemon's working
    /// directory. `status` is the actual sing-box instance state.
    Connected { status: SingboxStatus },
    /// `sing-box-daemon` 根本没注册成 Windows 服务 —— 见 `daemon::install`。
    NotInstalled,
    /// 服务装了但没在跑（被管理员或优化软件停掉、崩了没起来……）。
    ///
    /// 这是最常见的一类故障，以前会落进 `Unavailable` 里变成一句看不懂的
    /// 原始 IO 错误（审计项 H-04）。它有对症的修法：`repair_daemon_service`
    /// 就是一次提权的 `service start`。
    NotRunning,
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
    pub(crate) fn running(&self) -> bool {
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
/// bridge commands (`commands::bridge`), the crash/OOM report commands, the
/// resident tray subscriptions, and `start_singbox`/`stop_singbox` below —
/// everything that needs to issue its own calls without going through this
/// module. The reconciliation loop is solely responsible for populating
/// this — nothing here connects on demand any more.
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

/// Subscribe to every future `ConnectionPhase` change — the single source
/// of truth `services::streams` reacts to instead of running its own
/// independent connect/backoff/status-event loop per stream. See
/// `services::streams::run_with_reconnect`'s doc comment for why the two
/// used to duplicate this and what unifying them on this one signal fixes.
pub fn subscribe(state: &SingboxState) -> watch::Receiver<ConnectionPhase> {
    state.phase_rx.clone()
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

/// Minimum pause before reconnecting after a status stream ends — mirrors
/// the official Electron client's `SESSION_RESTART_DELAY` (`state.ts`).
/// Without this, a stream that fails or ends immediately after connecting
/// (daemon mid-restart, worker hiccup, ...) sends the reconciliation loop
/// into a tight connect/disconnect cycle with no rate limit at all.
const SESSION_RESTART_DELAY: Duration = Duration::from_millis(1000);

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
    /// 服务不可用（没装 / 没跑）—— 连都没尝试就返回了。用固定的较长间隔重试，
    /// 因为它不会自己好；真正让它及时恢复的是 `retry_connection`
    /// （安装或修复之后会调）。
    ServiceUnavailable,
}

/// One full connect → claim → subscribe attempt. Runs until either it
/// fails outright or the status stream it subscribed to ends.
async fn run_reconciliation_attempt(app: &AppHandle, state: &SingboxState) -> AttemptOutcome {
    // Both checks below describe the *packaged* layout — a registered
    // Windows service, and a bundled daemon exe at a fixed relative path. A
    // debug build pointed at a development daemon over TCP (see
    // `daemon::dev_daemon_address`) satisfies neither by construction, and
    // needs neither: nothing spawns a worker on that path.
    let dev_address = crate::daemon::dev_daemon_address();

    if dev_address.is_none() {
        // 探测是同步的进程调用，放到阻塞线程池上，别占着 async 工作线程
        // （审计项 M-05）。
        let status = tokio::task::spawn_blocking(crate::daemon::install::probe_service)
            .await
            .unwrap_or(crate::daemon::install::ServiceStatus::Unknown);
        match status {
            crate::daemon::install::ServiceStatus::NotInstalled => {
                publish(app, state, ConnectionPhase::NotInstalled);
                return AttemptOutcome::ServiceUnavailable;
            }
            crate::daemon::install::ServiceStatus::NotRunning => {
                publish(app, state, ConnectionPhase::NotRunning);
                return AttemptOutcome::ServiceUnavailable;
            }
            // `Unknown` 不当成「不可用」：探测本身可能只是一时失败，让它照常
            // 往下走去连一次，连不上自然会落到 `Unavailable` 并带上真实错误。
            crate::daemon::install::ServiceStatus::Running
            | crate::daemon::install::ServiceStatus::Unknown => {}
        }
    }

    publish(app, state, ConnectionPhase::Connecting);

    let daemon_path = match crate::daemon::install::daemon_executable_path() {
        Ok(path) if path.exists() || dev_address.is_some() => path,
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

    // `daemon_info` / `claim_service` 都在 `DesktopService` 上，而
    // `DesktopService` 的每个方法都要求一个 peer identity（upstream
    // `desktop_service.go` 里 10 处 `peerIdentityFromContext`）。开发直连模式
    // 走 TCP，boxdd 只是关掉了传输层凭据、并没有伪造出 peer identity，所以
    // 这几步在开发模式下必然失败 —— 跳过它们，直接去订阅
    // `StartedService.SubscribeServiceStatus`（`started_service.go` 里 0 处
    // 需要 peer identity，整个 StartedService 在开发模式下都可用）。
    //
    // 跳过的是所有权与版本一致性检查，它们保护的是产品部署下的真实风险
    // （另一个用户会话占着 daemon、app 升级后服务没重装）。开发模式本来就
    // 只连一个自己起的、无访问控制的实例，这些检查没有意义。
    if dev_address.is_none() {
        // Always fetch daemon info: it's how we learn ownership (needed every
        // attempt, not just when we can also check the version below), mirroring
        // the official client's `getDaemonInfo` call at the top of every
        // `loopConnection` iteration.
        let info = match client.connection.daemon_info().await {
            Ok(info) => info,
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
            publish(app, state, ConnectionPhase::OwnedByOtherUser);
            return AttemptOutcome::Failed;
        }

        if let Err(e) = client.connection.claim_service().await {
            publish(
                app,
                state,
                ConnectionPhase::Unavailable {
                    error_message: e.to_string(),
                },
            );
            return AttemptOutcome::Failed;
        }
    }

    let connection = client.connection.clone();
    *state.client.lock().await = Some(client);

    // 这次会话期间的常驻订阅（代理组、Clash 模式），供托盘使用 —— 它们和
    // 前端各订各的，中间不经过任何翻译，见 `services::resident` 的模块注释。
    // `_session` 一旦离开作用域就会取消订阅并清空常驻状态，所以下面每一条
    // 提前 return 的路径都不需要自己收尾。
    let _session = app
        .try_state::<std::sync::Arc<crate::services::resident::ResidentState>>()
        .map(|resident| {
            let app_for_mode = app.clone();
            crate::services::resident::spawn_session(
                resident.inner().clone(),
                connection.clone(),
                std::sync::Arc::new(move |mode: &str| {
                    if let Some(store) = app_for_mode.try_state::<Store>()
                        && let Err(e) =
                            crate::store::settings::set_last_clash_mode(store.inner(), mode)
                    {
                        tracing::warn!(error = ?e, "failed to remember the clash mode");
                    }
                }),
            )
        });

    let mut stream = match connection.subscribe_service_status().await {
        Ok(stream) => stream,
        Err(e) => {
            state.client.lock().await.take();
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

    state.client.lock().await.take();
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
                    // backoff, but still wait a beat before reconnecting
                    // (see `SESSION_RESTART_DELAY`) rather than going
                    // straight back into `run_reconciliation_attempt`.
                    attempt = 0;
                    wait_or_retry(&state, SESSION_RESTART_DELAY).await;
                }
                AttemptOutcome::ServiceUnavailable => {
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

/// 合成真正交给 `StartService` 的配置内容：档案自身的 JSON，先叠用户的
/// override（若启用），再把 fresh-box 自己的 priority config 盖在最上层。
///
/// The order — override before priority config, never the reverse — is
/// deliberate and load-bearing, not an accident of write order: priority
/// config exists to enforce fresh-box's own operational requirements (see
/// `config::priority::apply_priority_config`'s doc comment), which must
/// hold regardless of what a user-authored override says, so it always gets
/// the last word. A failure applying the priority config is logged and
/// otherwise ignored rather than failing the start outright — see
/// `apply_priority_config`'s own doc comment for why each of its fields is
/// independent best-effort in the same way.
fn build_config_content(store: &Store, profile_id: &str) -> Result<String, CommandError> {
    let content = crate::store::profiles::read_content(store, profile_id)?;
    let mut base_config: serde_json::Value = serde_json::from_str(&content)?;

    if let Some(override_config) = crate::config::get_override_config_if_enabled(store)? {
        crate::config::apply_config_override(&mut base_config, &override_config);
    }

    let priority_config = crate::config::priority::load_priority_config_inner(store)?;
    let last_mode = crate::store::settings::last_clash_mode(store);
    if let Err(e) = crate::config::apply_priority_config(
        &mut base_config,
        &priority_config,
        last_mode.as_deref(),
    ) {
        tracing::warn!(error = ?e, "failed to apply priority configuration");
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

/// Builds the `StartOptions` sent alongside every `StartService` call from
/// the user's saved diagnostics settings (see
/// `config::app_settings::DiagnosticsSettings`) — OOM killer/power report
/// are both off unless explicitly enabled there, matching what
/// `StartOptions::default()` used to always send.
fn build_start_options(store: &Store) -> StartOptions {
    let diagnostics = crate::config::app_settings::load_diagnostics(store);
    StartOptions {
        oom_killer_enabled: diagnostics.oom_killer_enabled,
        oom_killer_disabled: false,
        oom_memory_limit: i64::from(diagnostics.oom_memory_limit_mb).saturating_mul(1024 * 1024),
        power_report_enabled: diagnostics.power_report_enabled,
    }
}

/// 合成配置并交给 daemon 启动 —— 命令（前端）与托盘（无窗口时）共用这一条
/// 路径，所以它不依赖 `State<'_>`。
/// 合成配置并交给 daemon —— **实例已经在跑时这就是一次原子重载**。
///
/// 上游的 `StartService` 实际调的是 `StartOrReloadService`（`server.go`
/// → `started_service.go:250`）：在同一把 `lifecycleAccess` 锁下先关旧实例再起
/// 新实例。以前这里有一道 `if running { return ProcessAlreadyRunning }` 的自设
/// 拦截，把这条路堵死了（审计项 H-02），于是切换配置只能由前端编排
/// stop→start：两次 RPC、中间隧道完全断开，而且刷新订阅后压根不重载 —— 新配置
/// 写进了磁盘，跑着的还是旧的，界面上毫无提示。
///
/// 现在切配置、刷订阅、改设置、托盘启动全走这一个入口。
pub async fn start_with_profile(
    state: &SingboxState,
    store: &Store,
    profile_id: &str,
) -> Result<(), CommandError> {
    // 合成配置要读 SQLite 和配置内容文件，都是同步 I/O —— 挪到阻塞线程池上，
    // 别按住 tokio 的工作线程（审计项 L-19）。
    let profile_id = profile_id.to_string();
    let (config_content, options) = store
        .run_blocking(move |store| {
            let content = build_config_content(store, &profile_id)?;
            Ok((content, build_start_options(store)))
        })
        .await?;

    // 校验的是**合并之后**的内容，不是订阅原文（审计项 L-16）。原文在下载时
    // 已经过一遍 `check_config`，但真正交给 `StartService` 的是「原文 + 用户
    // override + priority config」三层合并的产物 —— 覆盖层写坏了配置，以前要
    // 等到点启动、daemon 那边解析失败才知道，而那条错误还得穿过 lifecycle 锁
    // 和 20 秒超时才回得来。这里用的是同一个 sing-box 解析器
    // （`ApplicationService.CheckConfig`），所以它放行的 daemon 一定也放行，
    // 不会平白多拦下能跑的配置。
    crate::daemon::validate::check_config(&config_content).await?;

    let connection = get_connection(state).await?;
    with_lifecycle_timeout(
        "start sing-box service",
        connection.start_service(config_content, options),
    )
    .await
}

pub async fn stop(state: &SingboxState) -> Result<(), CommandError> {
    let connection = get_connection(state).await?;
    with_lifecycle_timeout("stop sing-box service", connection.stop_service()).await
}

pub async fn start_singbox(
    state: State<'_, SingboxState>,
    store: State<'_, Store>,
    profile_id: String,
) -> Result<(), CommandError> {
    start_with_profile(state.inner(), store.inner(), &profile_id).await
}

pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    stop(state.inner()).await
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

    // Same reasoning as `start_singbox`/`stop_singbox`: a hung daemon
    // shouldn't be able to wedge this indefinitely — that previously left
    // force-killing fresh-box.exe as the only way to actually quit when
    // this call (invoked from the tray's "Quit") never returned.
    if let Err(e) = with_lifecycle_timeout(
        "stop sing-box service during cleanup",
        client.connection.stop_service(),
    )
    .await
    {
        tracing::warn!(error = ?e, "failed to stop sing-box service during cleanup");
    }
}
