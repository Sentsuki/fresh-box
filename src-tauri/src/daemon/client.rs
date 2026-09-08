// `DaemonClient` — the generated gRPC stubs for `sing-box-daemon.exe`,
// wired up behind a small API shaped for fresh-box's needs.
//
// Split in two on purpose:
//   `DaemonClient`     Dials the relay pipe of the process-wide shared
//                       worker (`worker::shared_worker`) — see that
//                       module's doc comment. Connecting no longer spawns a
//                       dedicated worker per attempt: the same worker
//                       process backs every reconnect and every
//                       `DaemonClient` alike, so there's nothing left to
//                       tear down when a particular connection attempt is
//                       done with it — just drop this.
//   `DaemonConnection`  A cheap, `Clone` handle to the underlying gRPC
//                       `Channel`. tonic channels are designed to be shared
//                       this way — cloning one is just an Arc bump, and
//                       each RPC call below builds a fresh typed client
//                       wrapper around that shared channel rather than
//                       fighting other callers over a `&mut` client.
//                       `services/singbox.rs` 和 `services/resident.rs` 各持
//                       一份克隆，可以独立发起调用（包括并发的流式订阅）。
//
// 这里的类型化封装只剩 **Rust 自己要用的那些**：reconciliation loop 的连接握手、
// 常驻订阅（托盘用的代理组 / Clash 模式）、以及托盘的切换动作。前端要的 RPC
// 一个都不在这里 —— 它通过 `daemon::bridge` 字节透传直接调用，Rust 不认识那些
// 方法。阶段 2/3 每迁走一块，这个文件就短一截：这正是「翻译层被移除」在代码
// 量上的样子。

use tonic::Streaming;
use tonic::transport::Channel;

use crate::errors::CommandError;

use super::daemon_api::managed_service_client::ManagedServiceClient;
use super::daemon_api::started_service_client::StartedServiceClient;
use super::daemon_api::{
    ClashMode, ClashModeStatus, CloseConnectionRequest, ConnectionEvents, Groups,
    SelectOutboundRequest, ServiceStatus, SubscribeConnectionsRequest,
};
use super::desktop_api::{
    CrashReportEntry, CrashReportFile, CrashReportRequest, DaemonInfo, OomReportEntry,
    OomReportFile, OomReportRequest, StartOptions, StartServiceRequest,
};
use super::desktop_api::desktop_service_client::DesktopServiceClient;
use super::worker;

fn map_status(context: &str, status: tonic::Status) -> CommandError {
    CommandError::network(format!(
        "{context}: {} ({:?})",
        status.message(),
        status.code()
    ))
}

/// `SubscribeConnectionsRequest.interval` is fed straight into Go's
/// `time.Duration(request.Interval)` on the daemon side
/// (`StartedService.SubscribeConnections` in `daemon/started_service.go`
/// upstream) — `time.Duration` counts *nanoseconds*, not milliseconds.
/// `subscribe_connections` below takes milliseconds (matching its caller's
/// `_MS` constant), so convert here rather than at the call site.
///
/// The frontend does this conversion itself now for the streams it
/// subscribes to directly through the bridge — see
/// `STATUS_INTERVAL_NANOS` in `src/daemon/statusStream.ts`.
///
/// A non-positive value is passed through unchanged: the daemon's own
/// `if interval <= 0 { interval = time.Second }` already does the right
/// thing for "use the default interval" (see `subscribe_connections(0)` in
/// `daemon_control.rs`), and multiplying wouldn't change its sign anyway.
fn to_interval_nanos(interval_ms: i64) -> i64 {
    if interval_ms <= 0 {
        interval_ms
    } else {
        interval_ms.saturating_mul(1_000_000)
    }
}

pub struct DaemonClient {
    pub connection: DaemonConnection,
}

#[cfg(debug_assertions)]
async fn connect_dev_tcp(address: &str) -> Result<Channel, CommandError> {
    tracing::warn!(
        %address,
        "connecting to sing-box-daemon over TCP — development only, peer authentication is disabled"
    );
    tonic::transport::Endpoint::try_from(format!("http://{address}"))
        .map_err(|e| CommandError::validation(format!("invalid FRESH_BOX_DAEMON_ADDR: {e}")))?
        .connect()
        .await
        .map_err(|e| CommandError::network(format!("connect to daemon at {address}: {e}")))
}

impl DaemonClient {
    /// Connect through the process-wide shared worker (see
    /// `worker::shared_worker`), spawning one first if none is currently
    /// running. There is no reconnect-in-place: a caller that loses the
    /// connection should discard this instance and connect a new one — but
    /// that no longer means respawning the worker itself, just redialing
    /// its relay pipe.
    pub async fn connect(daemon_executable: &std::path::Path) -> Result<Self, CommandError> {
        // See `daemon::dev_daemon_address` — debug builds only.
        #[cfg(debug_assertions)]
        if let Some(address) = super::dev_daemon_address() {
            return Ok(Self {
                connection: DaemonConnection {
                    channel: connect_dev_tcp(&address).await?,
                },
            });
        }

        let worker = worker::shared_worker().get(daemon_executable).await?;
        // Dial the *relay* pipe, not the worker's own `--socket` pipe —
        // see the doc comment on `WorkerProcess::relay_socket_path`.
        let channel = super::pipe::connect(worker.relay_socket_path.clone())
            .await
            .map_err(|e| CommandError::network(format!("connect to daemon relay pipe: {e}")))?;

        Ok(Self {
            connection: DaemonConnection { channel },
        })
    }
}

#[derive(Clone)]
pub struct DaemonConnection {
    channel: Channel,
}

impl DaemonConnection {
    /// The underlying gRPC channel, for `daemon::bridge`'s byte-passthrough
    /// proxy — it dials methods by `PathAndQuery` with its own codec rather
    /// than through any of the typed wrappers below, so it needs the raw
    /// channel. Cloning is just an Arc bump (see this type's doc comment).
    pub(crate) fn raw_channel(&self) -> Channel {
        self.channel.clone()
    }

    fn desktop(&self) -> DesktopServiceClient<Channel> {
        DesktopServiceClient::new(self.channel.clone())
    }

    fn managed(&self) -> ManagedServiceClient<Channel> {
        ManagedServiceClient::new(self.channel.clone())
    }

    fn started(&self) -> StartedServiceClient<Channel> {
        StartedServiceClient::new(self.channel.clone())
    }

    // ── DesktopService ──────────────────────────────────────────────────

    /// Used by `services::singbox::run_reconciliation_attempt` for the same
    /// version-mismatch/ownership checks the official client does at
    /// connect time (`state.ts`: compares this against the bundled daemon
    /// exe's own `sing-box-daemon.exe version` output via
    /// `daemon::install::bundled_daemon_version`, and refuses to fully
    /// connect on a mismatch).
    pub async fn daemon_info(&self) -> Result<DaemonInfo, CommandError> {
        self.desktop()
            .get_daemon_info(())
            .await
            .map(|r| r.into_inner())
            .map_err(|e| map_status("get daemon info", e))
    }

    /// Take (or confirm) ownership of the daemon's working directory for
    /// the current user. Must succeed before `start_service` — a daemon
    /// freshly started or owned by nobody accepts this unconditionally.
    pub async fn claim_service(&self) -> Result<(), CommandError> {
        self.desktop()
            .claim_service(())
            .await
            .map(|_| ())
            .map_err(|e| map_status("claim daemon service", e))
    }

    /// 从另一个 Windows 用户会话手里接管 daemon。
    ///
    /// `OwnedByOtherUser` 以前是个死胡同：相位建模了，但没有任何出口，用户只能
    /// 去把对方的会话注销掉。boxdd 本来就提供了这个 RPC（上游
    /// `desktop_service.go` 的 `TakeOverService`），只是之前没 vendor 进来。
    pub async fn take_over_service(&self) -> Result<(), CommandError> {
        self.desktop()
            .take_over_service(())
            .await
            .map(|_| ())
            .map_err(|e| map_status("take over daemon service", e))
    }

    pub async fn start_service(
        &self,
        config_content: String,
        options: StartOptions,
    ) -> Result<(), CommandError> {
        let request = StartServiceRequest {
            config_content,
            options: Some(options),
        };
        self.desktop()
            .start_service(request)
            .await
            .map(|_| ())
            .map_err(|e| map_status("start sing-box service", e))
    }

    // ── ManagedService ──────────────────────────────────────────────────

    pub async fn stop_service(&self) -> Result<(), CommandError> {
        self.managed()
            .stop_service(())
            .await
            .map(|_| ())
            .map_err(|e| map_status("stop sing-box service", e))
    }

    // ── StartedService ──────────────────────────────────────────────────

    pub async fn subscribe_service_status(&self) -> Result<Streaming<ServiceStatus>, CommandError> {
        self.started()
            .subscribe_service_status(())
            .await
            .map(|r| r.into_inner())
            .map_err(|e| map_status("subscribe to service status", e))
    }

    pub async fn subscribe_groups(&self) -> Result<Streaming<Groups>, CommandError> {
        self.started()
            .subscribe_groups(())
            .await
            .map(|r| r.into_inner())
            .map_err(|e| map_status("subscribe to proxy groups", e))
    }

    pub async fn subscribe_connections(
        &self,
        interval_ms: i64,
    ) -> Result<Streaming<ConnectionEvents>, CommandError> {
        self.started()
            .subscribe_connections(SubscribeConnectionsRequest {
                interval: to_interval_nanos(interval_ms),
            })
            .await
            .map(|r| r.into_inner())
            .map_err(|e| map_status("subscribe to connections", e))
    }

    /// The current Clash mode, pushed on every change — what `services::resident`
    /// keeps the tray's mode submenu checkmark in sync with.
    ///
    /// Carries only the mode string, not the list of available modes; pair it
    /// with one `clash_mode_status()` call for that. Blocks on the daemon's
    /// `waitForStarted` until a sing-box instance is actually running
    /// (`started_service.go`), so a caller can subscribe eagerly at connect
    /// time and let it come alive on its own once the instance starts.
    pub async fn subscribe_clash_mode(&self) -> Result<Streaming<ClashMode>, CommandError> {
        self.started()
            .subscribe_clash_mode(())
            .await
            .map(|r| r.into_inner())
            .map_err(|e| map_status("subscribe to clash mode", e))
    }

    pub async fn clash_mode_status(&self) -> Result<ClashModeStatus, CommandError> {
        self.started()
            .get_clash_mode_status(())
            .await
            .map(|r| r.into_inner())
            .map_err(|e| map_status("get clash mode status", e))
    }

    pub async fn set_clash_mode(&self, mode: String) -> Result<(), CommandError> {
        self.started()
            .set_clash_mode(ClashMode { mode })
            .await
            .map(|_| ())
            .map_err(|e| map_status("set clash mode", e))
    }

    pub async fn select_outbound(
        &self,
        group_tag: String,
        outbound_tag: String,
    ) -> Result<(), CommandError> {
        self.started()
            .select_outbound(SelectOutboundRequest {
                group_tag,
                outbound_tag,
            })
            .await
            .map(|_| ())
            .map_err(|e| map_status("select proxy outbound", e))
    }

    pub async fn close_connection(&self, id: String) -> Result<(), CommandError> {
        self.started()
            .close_connection(CloseConnectionRequest { id })
            .await
            .map(|_| ())
            .map_err(|e| map_status("close connection", e))
    }

    // ── DesktopService: crash/OOM/power reports ─────────────────────────

    pub async fn list_crash_reports(&self) -> Result<Vec<CrashReportEntry>, CommandError> {
        self.desktop()
            .list_crash_reports(())
            .await
            .map(|r| r.into_inner().reports)
            .map_err(|e| map_status("list crash reports", e))
    }

    pub async fn read_crash_report(
        &self,
        name: String,
    ) -> Result<Vec<CrashReportFile>, CommandError> {
        self.desktop()
            .read_crash_report(CrashReportRequest { name })
            .await
            .map(|r| r.into_inner().files)
            .map_err(|e| map_status("read crash report", e))
    }

    pub async fn mark_crash_report_read(&self, name: String) -> Result<(), CommandError> {
        self.desktop()
            .mark_crash_report_read(CrashReportRequest { name })
            .await
            .map(|_| ())
            .map_err(|e| map_status("mark crash report read", e))
    }

    pub async fn delete_crash_report(&self, name: String) -> Result<(), CommandError> {
        self.desktop()
            .delete_crash_report(CrashReportRequest { name })
            .await
            .map(|_| ())
            .map_err(|e| map_status("delete crash report", e))
    }

    pub async fn delete_all_crash_reports(&self) -> Result<(), CommandError> {
        self.desktop()
            .delete_all_crash_reports(())
            .await
            .map(|_| ())
            .map_err(|e| map_status("delete all crash reports", e))
    }

    pub async fn list_oom_reports(&self) -> Result<Vec<OomReportEntry>, CommandError> {
        self.desktop()
            .list_oom_reports(())
            .await
            .map(|r| r.into_inner().reports)
            .map_err(|e| map_status("list OOM reports", e))
    }

    pub async fn read_oom_report(&self, name: String) -> Result<Vec<OomReportFile>, CommandError> {
        self.desktop()
            .read_oom_report(OomReportRequest { name })
            .await
            .map(|r| r.into_inner().files)
            .map_err(|e| map_status("read OOM report", e))
    }

    pub async fn mark_oom_report_read(&self, name: String) -> Result<(), CommandError> {
        self.desktop()
            .mark_oom_report_read(OomReportRequest { name })
            .await
            .map(|_| ())
            .map_err(|e| map_status("mark OOM report read", e))
    }

    pub async fn delete_oom_report(&self, name: String) -> Result<(), CommandError> {
        self.desktop()
            .delete_oom_report(OomReportRequest { name })
            .await
            .map(|_| ())
            .map_err(|e| map_status("delete OOM report", e))
    }

    pub async fn delete_all_oom_reports(&self) -> Result<(), CommandError> {
        self.desktop()
            .delete_all_oom_reports(())
            .await
            .map(|_| ())
            .map_err(|e| map_status("delete all OOM reports", e))
    }

    pub async fn list_power_reports(&self) -> Result<Vec<OomReportEntry>, CommandError> {
        self.desktop()
            .list_power_reports(())
            .await
            .map(|r| r.into_inner().reports)
            .map_err(|e| map_status("list power reports", e))
    }

    pub async fn read_power_report(
        &self,
        name: String,
    ) -> Result<Vec<OomReportFile>, CommandError> {
        self.desktop()
            .read_power_report(OomReportRequest { name })
            .await
            .map(|r| r.into_inner().files)
            .map_err(|e| map_status("read power report", e))
    }

    pub async fn mark_power_report_read(&self, name: String) -> Result<(), CommandError> {
        self.desktop()
            .mark_power_report_read(OomReportRequest { name })
            .await
            .map(|_| ())
            .map_err(|e| map_status("mark power report read", e))
    }

    pub async fn delete_power_report(&self, name: String) -> Result<(), CommandError> {
        self.desktop()
            .delete_power_report(OomReportRequest { name })
            .await
            .map(|_| ())
            .map_err(|e| map_status("delete power report", e))
    }

    pub async fn delete_all_power_reports(&self) -> Result<(), CommandError> {
        self.desktop()
            .delete_all_power_reports(())
            .await
            .map(|_| ())
            .map_err(|e| map_status("delete all power reports", e))
    }
}
