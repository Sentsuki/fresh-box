// Spawns and owns the `sing-box-daemon.exe worker` relay process, and
// exposes it as a process-wide shared resource (see `SharedWorker` below).
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
// dials (see `pipe.rs`). The same worker also runs its own unprivileged
// `ApplicationService` (config check, profile encode/decode) on a second
// pipe, independent of whether the privileged daemon is even reachable —
// see `daemon::validate::check_config`.
//
// The worker shuts down cleanly when its stdin is closed (see
// `experimental/boxdd/cmd_worker.go` upstream: it copies stdin to
// `io.Discard` and stops serving on EOF) — `WorkerProcess::shutdown` relies
// on that instead of killing the process outright.

use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use rand::RngExt as _;
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{Mutex, Notify};

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
// thread affinity — safe to hand to (and read concurrently from) any thread
// within this process, unlike pseudo-handles such as `GetCurrentProcess()`.
// `Sync` matters now that `WorkerProcess` (which embeds this) is shared via
// `Arc` across concurrent callers/tasks in `SharedWorker`.
unsafe impl Send for KillOnDropJob {}
unsafe impl Sync for KillOnDropJob {}

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
    /// Stdin handle — dropping this closes the pipe, which is the worker's
    /// signal to exit cleanly (see module doc comment). Behind a `Mutex`
    /// (rather than requiring `&mut self`) because `WorkerProcess` is shared
    /// via `Arc` across every caller that dialed it through `SharedWorker`.
    stdin: Mutex<Option<ChildStdin>>,
    /// Set by the reaper task spawned in `spawn()` once the process has
    /// actually exited — crashed, killed externally, or exited cleanly
    /// after `shutdown()` closed its stdin.
    exited: Arc<AtomicBool>,
    /// Notified (by the reaper task) right after `exited` is set, so
    /// `shutdown()` can wait on the real exit instead of polling.
    exited_notify: Arc<Notify>,
    /// Notified to ask the reaper task to force-kill the process — used by
    /// `shutdown()` as a fallback when closing stdin doesn't make it exit
    /// promptly.
    kill_signal: Arc<Notify>,
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
///
/// Prefer `shared_worker().get(...)` over calling this directly — nearly
/// every caller wants the one shared worker, not a private one of its own.
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

    // Take stdin now, before handing `child` itself over to the reaper task
    // below — closing it later (from `shutdown()`, possibly called through
    // a shared `Arc`) is how we ask the worker to exit cleanly.
    let stdin = child.stdin.take();
    let exited = Arc::new(AtomicBool::new(false));
    let exited_notify = Arc::new(Notify::new());
    let kill_signal = Arc::new(Notify::new());

    // The reaper task owns `child` from here on: it's the only thing that
    // ever calls `.wait()`/`.kill()` on it, so nothing else needs a `&mut
    // Child` (which wouldn't be possible anyway once this worker is shared
    // via `Arc`). It waits for either a natural exit or a `shutdown()`
    // fallback kill request, then flips `exited` so every `Arc<WorkerProcess>`
    // holder can observe it without needing to touch the process itself.
    {
        let exited = exited.clone();
        let exited_notify = exited_notify.clone();
        let kill_signal = kill_signal.clone();
        tokio::spawn(async move {
            tokio::select! {
                _ = child.wait() => {}
                _ = kill_signal.notified() => {
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                }
            }
            exited.store(true, Ordering::Relaxed);
            exited_notify.notify_waiters();
        });
    }

    Ok(WorkerProcess {
        stdin: Mutex::new(stdin),
        exited,
        exited_notify,
        kill_signal,
        _job: job,
        socket_path,
        relay_socket_path,
    })
}

impl WorkerProcess {
    /// Whether the process has exited (observed by the reaper task) —
    /// `SharedWorker::get` checks this to decide whether a cached worker is
    /// still usable or needs replacing.
    pub fn has_exited(&self) -> bool {
        self.exited.load(Ordering::Relaxed)
    }

    async fn wait_until_exited(&self, timeout: Duration) -> bool {
        if self.has_exited() {
            return true;
        }
        tokio::select! {
            _ = self.exited_notify.notified() => true,
            _ = tokio::time::sleep(timeout) => self.has_exited(),
        }
    }

    /// Ask the worker to exit by closing its stdin (see the module doc
    /// comment), and wait for it to actually do so. Falls back to a hard
    /// kill if it doesn't exit promptly. Safe to call more than once, and
    /// safe to call while other `Arc<WorkerProcess>` clones are still in
    /// use elsewhere — only the first close/kill has any effect, the rest
    /// just observe the same outcome.
    pub async fn shutdown(&self) {
        if let Some(stdin) = self.stdin.lock().await.take() {
            drop(stdin);
        }

        if self.wait_until_exited(Duration::from_secs(3)).await {
            return;
        }

        self.kill_signal.notify_one();
        let _ = self.wait_until_exited(Duration::from_secs(2)).await;
    }
}

/// A worker process shared across every caller that needs one — the
/// reconciliation loop's connect/reconnect attempts (`services/singbox.rs`)
/// and `daemon::validate::check_config` — instead of each spawning (and
/// tearing down) its own. Mirrors the official desktop client's
/// `workerConnection()` (`main/worker.ts`), which caches one worker
/// `Promise` and clears it once the process exits so the next caller
/// transparently spawns a replacement.
///
/// Before this existed, every reconnect attempt and every config-validation
/// call (every subscription add/update/save) paid the full process-spawn +
/// named-pipe-handshake cost — up to the 10s `READY_TIMEOUT` — on its own,
/// and a burst of concurrent subscription imports could spawn a burst of
/// independent worker processes.
#[derive(Clone)]
pub struct SharedWorker {
    slot: Arc<Mutex<Option<Arc<WorkerProcess>>>>,
}

impl SharedWorker {
    fn new() -> Self {
        Self {
            slot: Arc::new(Mutex::new(None)),
        }
    }

    /// Get the currently running worker, spawning one if none is cached (or
    /// the cached one has exited on its own). The lock is held across the
    /// (rare) spawn so concurrent first-callers share one spawn instead of
    /// racing to create several — mirroring how `workerConnection()` caches
    /// the in-flight spawn `Promise` itself, not just its result.
    pub async fn get(
        &self,
        daemon_executable: &std::path::Path,
    ) -> Result<Arc<WorkerProcess>, CommandError> {
        let mut guard = self.slot.lock().await;
        if let Some(worker) = guard.as_ref()
            && !worker.has_exited()
        {
            return Ok(worker.clone());
        }
        let worker = Arc::new(spawn(daemon_executable).await?);
        *guard = Some(worker.clone());
        Ok(worker)
    }

    /// Tear the cached worker down (if any) and forget it, so the next
    /// `get()` spawns a fresh one. Used when we deliberately want to
    /// recycle it rather than just let it keep running — right now, only
    /// real app exit (see `tray.rs`'s quit handler).
    pub async fn recycle(&self) {
        let worker = self.slot.lock().await.take();
        if let Some(worker) = worker {
            worker.shutdown().await;
        }
    }
}

static SHARED_WORKER: std::sync::OnceLock<SharedWorker> = std::sync::OnceLock::new();

/// The process-wide shared worker — see `SharedWorker`'s doc comment for
/// why callers should get their worker through here instead of calling
/// `spawn()` directly.
pub fn shared_worker() -> &'static SharedWorker {
    SHARED_WORKER.get_or_init(SharedWorker::new)
}
