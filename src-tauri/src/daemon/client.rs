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
//                       `services/singbox.rs`, `services/daemon_control.rs`
//                       and `services/streams.rs` each hold their own
//                       cloned `DaemonConnection` and can issue calls
//                       (including concurrent streaming subscriptions)
//                       independently.

use tonic::Streaming;
use tonic::transport::Channel;

use crate::errors::CommandError;

use super::daemon_api::managed_service_client::ManagedServiceClient;
use super::daemon_api::started_service_client::StartedServiceClient;
use super::daemon_api::{
    ClashMode, ClashModeStatus, CloseConnectionRequest, ConnectionEvents, Groups, Log,
    SelectOutboundRequest, ServiceStatus, Status, SubscribeConnectionsRequest,
    SubscribeStatusRequest, UrlTestRequest,
};
use super::desktop_api::desktop_service_client::DesktopServiceClient;
use super::desktop_api::{DaemonInfo, StartOptions, StartServiceRequest};
use super::worker;

fn map_status(context: &str, status: tonic::Status) -> CommandError {
    CommandError::network(format!(
        "{context}: {} ({:?})",
        status.message(),
        status.code()
    ))
}

/// `SubscribeStatusRequest.interval` / `SubscribeConnectionsRequest.interval`
/// are fed straight into Go's `time.Duration(request.Interval)` on the
/// daemon side (`StartedService.SubscribeStatus`/`SubscribeConnections` in
/// `daemon/started_service.go` upstream) — `time.Duration` counts
/// *nanoseconds*, not milliseconds. `subscribe_status`/`subscribe_connections`
/// below take milliseconds (matching every caller's `_MS` constants), so
/// convert here rather than at each call site.
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

impl DaemonClient {
    /// Connect through the process-wide shared worker (see
    /// `worker::shared_worker`), spawning one first if none is currently
    /// running. There is no reconnect-in-place: a caller that loses the
    /// connection should discard this instance and connect a new one — but
    /// that no longer means respawning the worker itself, just redialing
    /// its relay pipe.
    pub async fn connect(daemon_executable: &std::path::Path) -> Result<Self, CommandError> {
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

    pub async fn start_service(&self, config_content: String) -> Result<(), CommandError> {
        let request = StartServiceRequest {
            config_content,
            options: Some(StartOptions::default()),
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

    pub async fn subscribe_status(
        &self,
        interval_ms: i64,
    ) -> Result<Streaming<Status>, CommandError> {
        self.started()
            .subscribe_status(SubscribeStatusRequest {
                interval: to_interval_nanos(interval_ms),
            })
            .await
            .map(|r| r.into_inner())
            .map_err(|e| map_status("subscribe to traffic/memory status", e))
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

    pub async fn subscribe_log(&self) -> Result<Streaming<Log>, CommandError> {
        self.started()
            .subscribe_log(())
            .await
            .map(|r| r.into_inner())
            .map_err(|e| map_status("subscribe to logs", e))
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

    pub async fn url_test(&self, outbound_tag: String) -> Result<(), CommandError> {
        self.started()
            .url_test(UrlTestRequest { outbound_tag })
            .await
            .map(|_| ())
            .map_err(|e| map_status("test proxy delay", e))
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

    pub async fn close_all_connections(&self) -> Result<(), CommandError> {
        self.started()
            .close_all_connections(())
            .await
            .map(|_| ())
            .map_err(|e| map_status("close all connections", e))
    }
}
