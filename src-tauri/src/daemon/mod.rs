// daemon/ — everything needed to talk to `sing-box-daemon.exe` (boxdd) over
// gRPC instead of spawning `sing-box.exe run` and polling the Clash HTTP API.
//
// Module map:
//   pipe.rs    Windows named-pipe transport for tonic (no server feature,
//              client-dial only).
//   worker.rs  Spawns and owns the per-session `sing-box-daemon.exe worker`
//              relay process fresh-box authenticates through — see the
//              module doc comment there for *why* a worker hop exists.
//   install.rs Locates the bundled daemon executable and drives its own
//              `service install` / `service uninstall` subcommands through
//              an elevation prompt.
//   client.rs  `DaemonClient`: the generated gRPC stubs wired up behind a
//              small, fresh-box-shaped API.
//   validate.rs One-shot config validation against a worker's own
//              `ApplicationService.CheckConfig`, independent of the main
//              `DaemonClient` connection — see its module doc comment.

pub mod client;
pub mod install;
pub mod pipe;
pub mod validate;
pub mod worker;

pub use client::{DaemonClient, DaemonConnection};

/// Generated from `proto/daemon/{managed_service,started_service}.proto`
/// (both declare `package daemon;`, so tonic-build merges them into one
/// module).
pub mod daemon_api {
    tonic::include_proto!("daemon");
}

/// Generated from `proto/boxdd/desktop_service.proto`.
pub mod desktop_api {
    tonic::include_proto!("desktop");
}

/// The named pipe prefix `sing-box-daemon.exe` insists a worker's own
/// listening socket and its relay-to-daemon socket start with — enforced by
/// the daemon's peer-authentication code (`validateWorkerProcessRole` in
/// `experimental/boxdd/peer_windows.go`). Both pipe paths we hand to
/// `worker --socket` / `--daemon-relay-socket` must use it.
pub const WORKER_PIPE_PREFIX: &str = r"\\.\pipe\sing-box-worker.";
