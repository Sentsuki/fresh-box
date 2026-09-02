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

/// RAII handle to a Windows Job Object created with
/// `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, with the worker process assigned to
/// it. Windows has no "die with parent" for ordinary child processes — if
/// fresh-box.exe is killed (Task Manager, a crash, ...) rather than exiting
/// cleanly, a plain `tokio::process::Child` like the worker below just keeps
/// running as an orphan, holding the relay pipe (and the daemon `claim`)
/// open indefinitely. A job object fixes that: fresh-box.exe is the only
/// process holding a handle to it, so when Windows tears down all of this
/// process's handles on exit — clean or not — the job's last handle closes,
/// and `KILL_ON_JOB_CLOSE` makes Windows terminate the worker right along
/// with it.
struct KillOnDropJob(windows::Win32::Foundation::HANDLE);

// SAFETY: a Win32 HANDLE is just an opaque kernel-object reference with no
// thread affinity — safe to hand to any thread within this process, unlike
// pseudo-handles such as `GetCurrentProcess()`.
unsafe impl Send for KillOnDropJob {}

impl Drop for KillOnDropJob {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

/// Create an anonymous kill-on-close job object and assign `child` to it.
/// Best-effort by design: called right after spawning the worker, before
/// anything else can `.await` and give the process a window to run
/// unsupervised. A failure here (e.g. some future permissions lockdown)
/// shouldn't block fresh-box from working — it just means an ungraceful
/// fresh-box exit could leak this one worker, same as before this existed.
fn spawn_kill_on_drop_job(child: &Child) -> Result<KillOnDropJob, CommandError> {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
        SetInformationJobObject,
    };

    let raw_handle = child.raw_handle().ok_or_else(|| {
        CommandError::FailedToStartProcess(
            "daemon worker exited before it could be sandboxed".into(),
        )
    })?;
    let process_handle = HANDLE(raw_handle);

    unsafe {
        let job = CreateJobObjectW(None, None)
            .map_err(|e| CommandError::io("create job object for daemon worker", e))?;

        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        if let Err(e) = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) {
            let _ = CloseHandle(job);
            return Err(CommandError::io("configure daemon worker job object", e));
        }

        if let Err(e) = AssignProcessToJobObject(job, process_handle) {
            let _ = CloseHandle(job);
            return Err(CommandError::io("assign daemon worker to job object", e));
        }

        Ok(KillOnDropJob(job))
    }
}

pub struct WorkerProcess {
    child: Child,
    /// Kept alive only for its `Drop` side effect — see `KillOnDropJob`.
    _job: KillOnDropJob,
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

    // Assign to a kill-on-close job immediately, before anything below can
    // fail/`.await` and leave the process running unsupervised in the
    // meantime — see `KillOnDropJob`.
    let job = spawn_kill_on_drop_job(&child)?;

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
        _job: job,
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
