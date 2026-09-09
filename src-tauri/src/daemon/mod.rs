// daemon/ — everything needed to talk to `sing-box-daemon.exe` (boxdd) over
// gRPC instead of spawning `sing-box.exe run` and polling the Clash HTTP API.
//
// Module map:
//   pipe.rs    Windows named-pipe transport for tonic (no server feature,
//              client-dial only).
//   worker.rs  Spawns and owns the process-wide shared `sing-box-daemon.exe
//              worker` relay process fresh-box authenticates through — see
//              the module doc comment there for *why* a worker hop exists
//              and how `SharedWorker` reuses one across callers.
//   install.rs Locates the bundled daemon executable and drives its own
//              `service install` / `service uninstall` subcommands through
//              an elevation prompt.
//   client.rs  `DaemonClient`: the generated gRPC stubs wired up behind a
//              small, fresh-box-shaped API.
//   bridge/    The byte-passthrough gRPC proxy the frontend's own
//              protobuf clients call through — see its module doc comment
//              for why Rust deliberately understands none of these RPCs.
//   validate.rs One-shot config validation against a worker's own
//              `ApplicationService.CheckConfig`, independent of the main
//              `DaemonClient` connection — see its module doc comment.

pub mod bridge;
pub mod client;
pub mod install;
pub mod pipe;
pub mod profile;
pub mod validate;
pub mod worker;

pub use client::{DaemonClient, DaemonConnection};

/// Generated from `proto/daemon/{managed_service,started_service}.proto`
/// (both declare `package daemon;`, so tonic-build merges them into one
/// module).
#[allow(clippy::all)]
pub mod daemon_api {
    tonic::include_proto!("daemon");
}

/// `desktop` 包引用 `daemon` 包类型时的落点。
///
/// `ApplicationService.StartStandalone*` 流回的是 `StartedService` 那两个
/// progress 消息，于是 prost 生成了跨包引用 `super::super::daemon::X`。那条
/// 路径是从生成的 client 子模块（`desktop_api::application_service_client`）
/// 里看的，算下来正好是 `crate::daemon::daemon::X` —— 而 daemon 包的类型实际
/// 住在 `daemon_api`。这个别名模块就是把两者接上，**改名字生成的代码就找不到
/// 了**。
#[allow(clippy::module_inception)]
pub mod daemon {
    pub use super::daemon_api::*;
}

/// Generated from `proto/boxdd/desktop_service.proto`.
#[allow(clippy::all)]
pub mod desktop_api {
    tonic::include_proto!("desktop");
}

/// Development-only escape hatch from boxdd's peer authentication.
///
/// The daemon's relay pipe only accepts a worker whose *parent* is the
/// installed `<InstallDir>\sing-box.exe`, byte-identical to the installed
/// file and carrying the same Authenticode certificate as the daemon (see
/// `worker`'s module doc comment). A `cargo`/`tauri dev` build lives in
/// `target/debug/` and isn't signed at all, so it can never satisfy that
/// chain — which would leave every daemon-backed feature untestable without
/// a full signed build-and-install cycle.
///
/// boxdd ships its own way out: `sing-box-daemon run --listen <addr>` serves
/// over plain TCP with peer authentication disabled entirely
/// (`peer_windows.go`: `if listenAddress != "" { return nil, nil }`;
/// `server.go` logs "development only, no access control"). Set
/// `FRESH_BOX_DAEMON_ADDR` to such an instance and `DaemonClient::connect`
/// dials it directly, skipping the worker hop — and the reconciliation loop
/// skips the service-installed / bundled-exe checks that only make sense for
/// the packaged layout.
///
/// Mirrors the official client's `developmentSwitchValue("daemon-socket")`
/// (`main/daemon.ts`), gated there on `!app.isPackaged`. Here the gate is
/// `#[cfg(debug_assertions)]`: a release build doesn't merely ignore the
/// variable, it contains no code that reads it.
pub fn dev_daemon_address() -> Option<String> {
    #[cfg(debug_assertions)]
    {
        std::env::var("FRESH_BOX_DAEMON_ADDR")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }
    #[cfg(not(debug_assertions))]
    {
        None
    }
}

/// The named pipe prefix `sing-box-daemon.exe` insists a worker's own
/// listening socket and its relay-to-daemon socket start with — enforced by
/// the daemon's peer-authentication code (`validateWorkerProcessRole` in
/// `experimental/boxdd/peer_windows.go`). Both pipe paths we hand to
/// `worker --socket` / `--daemon-relay-socket` must use it.
pub const WORKER_PIPE_PREFIX: &str = r"\\.\pipe\sing-box-worker.";
