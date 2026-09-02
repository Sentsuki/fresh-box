// Spawns and owns the `sing-box-daemon.exe worker` relay process.
//
// Why a worker hop exists at all: the privileged daemon's named pipe
// (`\\.\pipe\ProtectedPrefix\Administrators\sing-box`) authenticates peers
// by walking the OS process tree — see `experimental/boxdd/peer_windows.go`
// upstream. It only accepts a connection from a process that is literally
// the daemon binary itself, invoked as `worker --socket ... --parent-pid
// ... --daemon-relay-socket ...`, whose *parent* process is the app
// installed at `<InstallDir>\sing-box.exe` and signed with the same
// Authenticode certificate as the daemon. fresh-box (renamed/shipped as
// that `sing-box.exe`) satisfies the parent side of that chain by spawning
// this worker itself; the worker relays the now-authenticated connection
// back out over its own local pipe, which is what `DaemonClient` actually
// dials (see `pipe.rs`).
//
// The worker shuts down cleanly when its stdin is closed (see
// `experimental/boxdd/cmd_worker.go` upstream: it copies stdin to
// `io.Discard` and stops serving on EOF) — `WorkerProcess::shutdown` relies
// on that instead of killing the process.

use std::process::Stdio;
use std::time::Duration;

use rand::RngExt as _;
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};

use crate::errors::CommandError;

use super::WORKER_PIPE_PREFIX;

const READY_TIMEOUT: Duration = Duration::from_secs(10);

pub struct WorkerProcess {
    child: Child,
    /// The worker's own listen pipe. The worker's *own* gRPC server only
    /// registers `ApplicationService` on this (see `cmd_worker.go`
    /// upstream: `RegisterApplicationServiceServer`) — config
    /// check/format, profile encode/decode, standalone network tests.
    /// `daemon::validate::check_config` dials this to validate untrusted
    /// config content (subscriptions) before it's ever persisted.
    pub socket_path: String,
    /// The relay pipe — this is what actually forwards an authenticated
    /// connection through to the real privileged daemon, so it's the one
    /// that serves `DesktopService`/`StartedService`/`ManagedService`
    /// (everything `DaemonClient` actually calls). Connecting to
    /// `socket_path` instead gets `Unimplemented` for all of those, since
    /// that server never registers them.
    pub relay_socket_path: String,
}

fn random_pipe_path() -> String {
    let suffix: u64 = rand::rng().random();
    format!("{WORKER_PIPE_PREFIX}{suffix:016x}")
}

/// Spawn `sing-box-daemon.exe worker ...` as a child of the current
/// process and wait for it to print `READY` on stdout (see `cmd_worker.go`
/// upstream — that line is the worker's signal that its listener and the
/// relay to the real daemon are both up).
pub async fn spawn(daemon_executable: &std::path::Path) -> Result<WorkerProcess, CommandError> {
    let socket_path = random_pipe_path();
    let relay_socket_path = random_pipe_path();
    let parent_pid = std::process::id();

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut child: Child = Command::new(daemon_executable)
        .args([
            "worker",
            "--socket",
            &socket_path,
            "--parent-pid",
            &parent_pid.to_string(),
            "--daemon-relay-socket",
            &relay_socket_path,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| CommandError::FailedToStartProcess(format!("spawn daemon worker: {e}")))?;

    let stdout = child.stdout.take().ok_or_else(|| {
        CommandError::FailedToStartProcess("daemon worker has no stdout pipe".into())
    })?;
    let mut lines = tokio::io::BufReader::new(stdout).lines();

    let ready = tokio::time::timeout(READY_TIMEOUT, async {
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim() == "READY" {
                return true;
            }
        }
        false
    })
    .await;

    match ready {
        Ok(true) => {}
        Ok(false) => {
            let _ = child.kill().await;
            return Err(CommandError::FailedToStartProcess(
                "daemon worker exited before signalling READY".into(),
            ));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err(CommandError::FailedToStartProcess(
                "daemon worker did not signal READY in time".into(),
            ));
        }
    }

    Ok(WorkerProcess {
        child,
        socket_path,
        relay_socket_path,
    })
}

impl WorkerProcess {
    /// Ask the worker to exit by closing its stdin (see the module doc
    /// comment). Falls back to a hard kill if it doesn't exit promptly.
    pub async fn shutdown(mut self) {
        drop(self.child.stdin.take());
        let exited = tokio::time::timeout(Duration::from_secs(3), self.child.wait()).await;
        if exited.is_err() {
            let _ = self.child.kill().await;
        }
    }
}
