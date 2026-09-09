// Locates the bundled daemon executable and drives its own `service
// install` / `service uninstall` subcommands (implemented upstream in
// `experimental/boxdd/cmd_service_windows.go`) through a UAC prompt.
// fresh-box does not reimplement Windows service registration itself —
// boxdd already knows how to register itself correctly (recovery actions,
// working-directory ACLs, etc.), so this module just shells out to it
// elevated.

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use base64::Engine as _;

use crate::errors::CommandError;

/// `CREATE_NO_WINDOW` — without this, spawning any console-subsystem
/// binary (`powershell`, daemon 自己的 `service status`……) from our GUI-subsystem process makes
/// Windows allocate it a brand new console window, which flashes on
/// screen for as long as the child runs.
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 系统程序一律用绝对路径启动，不走 PATH 查找 —— 见 `run_elevated` 里的说明。
pub(crate) fn system32(relative: &str) -> std::path::PathBuf {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    std::path::Path::new(&root).join("System32").join(relative)
}

fn powershell_path() -> std::path::PathBuf {
    system32(r"WindowsPowerShell\v1.0\powershell.exe")
}

/// `<InstallDir>\resources\daemon\sing-box-daemon.exe` — the fixed relative
/// layout `installedApplicationPath` requires.
pub fn daemon_executable_path() -> Result<PathBuf, CommandError> {
    crate::config::get_exe_dir().map(|dir| {
        dir.join("resources")
            .join("daemon")
            .join("sing-box-daemon.exe")
    })
}

/// Run the *bundled* `sing-box-daemon.exe version` (unprivileged — no UAC)
/// and parse its own reported version, for comparison against whatever
/// version the already-installed/running Windows service reports via
/// `DesktopService.GetDaemonInfo`. Mirrors the official desktop client's
/// `bundledDaemonVersion()` (`src/main/repair.ts`), including its parsing:
/// `fmt.Println("sing-box-daemon version", C.Version)` in
/// `experimental/boxdd/main.go` upstream always prints exactly
/// `sing-box-daemon version <version>`.
pub fn bundled_daemon_version() -> Result<String, CommandError> {
    // 缓存：这个值由磁盘上的 exe 决定，进程生命周期内不会变，而 reconciliation
    // loop 每次重连都要用它 —— 以前每次都 spawn 一个进程去读（审计项 M-05）。
    // 对齐官方客户端的 `cachedBundledVersion`（`repair.ts`）。
    static CACHED: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    if let Some(cached) = CACHED.get_or_init(|| read_bundled_daemon_version().ok()) {
        return Ok(cached.clone());
    }
    read_bundled_daemon_version()
}

fn read_bundled_daemon_version() -> Result<String, CommandError> {
    let daemon_path = daemon_executable_path()?;
    let output = Command::new(&daemon_path)
        .arg("version")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| CommandError::io("run sing-box-daemon version", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find_map(|line| line.strip_prefix("sing-box-daemon version "))
        .map(|version| version.trim().to_string())
        .ok_or_else(|| {
            CommandError::invalid_state(
                "bundled_daemon_version",
                "could not parse 'sing-box-daemon.exe version' output",
            )
        })
}

/// Output captured from an elevated command — `Start-Process -Verb RunAs`
/// runs the child through ShellExecute, which has no pipe back to us, so
/// the only way to see what it printed is to have it write to files we
/// read back afterwards. Without this, a failed `service install` was
/// reported as a bare exit code with no way for us or the user to tell
/// *why* it failed (e.g. the strict install-directory ACL check in
/// `security_windows.go`'s `validateInstallationAncestors`).
struct ElevatedOutput {
    code: i32,
    /// Combined stdout+stderr+error-stream output from the elevated
    /// command (captured via PowerShell's `*>` redirect — see
    /// `run_elevated`).
    log: String,
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Win32 `ERROR_CANCELLED` — what `Start-Process -Verb RunAs` fails with
/// when the user declines the UAC prompt. Matches the official client's
/// `EXIT_CODE_CANCELLED` (`repair.ts`).
const EXIT_CODE_CANCELLED: i32 = 1223;

fn run_elevated(
    executable: &std::path::Path,
    args: &[&str],
) -> Result<ElevatedOutput, CommandError> {
    // `Start-Process -Verb RunAs` (ShellExecute, needed for the UAC prompt)
    // and `-RedirectStandard{Output,Error}` (needs UseShellExecute=$false)
    // are mutually exclusive in .NET — combining them makes `Start-Process`
    // itself throw before ever showing UAC. So instead of elevating the
    // daemon exe directly with redirection parameters, we elevate a
    // `powershell.exe` wrapper that does its own file redirection
    // internally with `*>`, which has no such restriction.
    //
    // 日志目录当前用户不可写（`get_elevated_log_dir` 的文档解释了为什么必须
    // 这样，审计项 L-15）。收紧不成功就干脆不落日志 —— 少一份诊断信息，好过
    // 给一个管理员进程递一条用户可控的写入路径。
    let log_path = match crate::config::get_elevated_log_dir() {
        Ok(dir) => Some(dir.join(format!(
            "elevated-{}-{}.log",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default()
        ))),
        Err(e) => {
            tracing::warn!(
                error = ?e,
                "no admins-only log directory — running the elevated command without capturing its output"
            );
            None
        }
    };

    let quoted_args = args
        .iter()
        .map(|a| powershell_quote(a))
        .collect::<Vec<_>>()
        .join(" ");
    let quoted_executable = powershell_quote(&executable.display().to_string());
    let inner_script = match &log_path {
        // 顺手清掉上一次留下的日志：我们这边没有写权限，删不掉自己读完的那
        // 份，所以清理由下一次提权动作（它是管理员）来做。
        Some(path) => format!(
            "Remove-Item {} -Force -ErrorAction SilentlyContinue\n& {} {} *> {}\nexit $LASTEXITCODE",
            powershell_quote(&path.with_file_name("*.log").display().to_string()),
            quoted_executable,
            quoted_args,
            powershell_quote(&path.display().to_string()),
        ),
        None => format!("& {quoted_executable} {quoted_args}\nexit $LASTEXITCODE"),
    };
    let encoded_inner = base64::engine::general_purpose::STANDARD.encode(
        inner_script
            .encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect::<Vec<u8>>(),
    );

    // Wrapped in try/catch so a declined UAC prompt can be told apart from
    // a genuine failure: `Start-Process -Verb RunAs` goes through
    // ShellExecute, which throws a `Win32Exception` with native error code
    // 1223 (`ERROR_CANCELLED`) when the user clicks "No" — left uncaught,
    // that would just surface as PowerShell's generic exit code 1, no
    // different from any other failure. Mirrors the official client's
    // `runElevatedWindows` (`repair.ts`), which checks for the same code.
    // 内外两层都用绝对路径 —— 外层这次调用紧接着就是 `-Verb RunAs` 提权，
    // 不该让 PATH 决定它到底跑起了什么（审计项 L-14）。
    let powershell = powershell_quote(&powershell_path().display().to_string());
    let outer_script = format!(
        "try {{ \
           $p = Start-Process -FilePath {powershell} -ArgumentList \
           @('-NoProfile','-NonInteractive','-EncodedCommand','{encoded_inner}') \
           -Verb RunAs -Wait -PassThru; exit $p.ExitCode \
         }} catch {{ \
           $inner = $_.Exception.InnerException; \
           if ($inner -is [System.ComponentModel.Win32Exception] -and $inner.NativeErrorCode -eq {EXIT_CODE_CANCELLED}) {{ \
             exit {EXIT_CODE_CANCELLED} \
           }} \
           exit 1 \
         }}"
    );

    let status = Command::new(powershell_path())
        .args(["-NoProfile", "-NonInteractive", "-Command", &outer_script])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| CommandError::io("launch elevated daemon service command", e))?;

    // 读得到就读，删不掉不管 —— 删除权限我们没有，下一次提权动作会清掉它。
    let log = log_path
        .as_deref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_default();

    Ok(ElevatedOutput {
        code: status.code().unwrap_or(-1),
        log,
    })
}

fn elevated_failure(context: &str, out: &ElevatedOutput) -> CommandError {
    let mut detail = format!("exited with code {}", out.code);
    if !out.log.trim().is_empty() {
        detail.push_str(&format!("\n{}", out.log.trim()));
    }
    CommandError::invalid_state(context, detail)
}

/// Turn an elevated command's exit code into a result, distinguishing a
/// declined UAC prompt (`CommandError::PermissionDenied`) from every other
/// non-zero exit (`CommandError::InvalidState`, via `elevated_failure`).
fn elevated_result(context: &str, out: ElevatedOutput) -> Result<(), CommandError> {
    match out.code {
        0 => Ok(()),
        EXIT_CODE_CANCELLED => Err(CommandError::permission_denied(format!(
            "{context}: cancelled — the UAC prompt was declined"
        ))),
        _ => Err(elevated_failure(context, &out)),
    }
}

/// One-time (per install/update), UAC-gated: registers `sing-box-daemon.exe`
/// as a Windows service. Safe to call when already installed — boxdd's
/// `service install` updates the existing registration in place.
pub fn install_service() -> Result<(), CommandError> {
    let daemon_path = daemon_executable_path()?;
    let working_directory = daemon_service_working_directory();
    let out = run_elevated(
        &daemon_path,
        &[
            "service",
            "install",
            "--working-directory",
            working_directory.to_str().ok_or_else(|| {
                CommandError::validation("daemon working directory is not valid UTF-8")
            })?,
        ],
    )?;
    elevated_result("install_service", out)
}

pub fn uninstall_service() -> Result<(), CommandError> {
    let daemon_path = daemon_executable_path()?;
    let out = run_elevated(&daemon_path, &["service", "uninstall"])?;
    elevated_result("uninstall_service", out)
}

/// Restart-in-place repair action, distinct from `install_service`/
/// `uninstall_service`: for when the service is already registered but the
/// daemon just isn't reachable (stopped by an admin, crashed and didn't
/// come back, ...) — a lighter fix than a full reinstall. Mirrors the
/// official client's `repair("start", ...)` (`repair.ts`), which calls the
/// same underlying `service start` subcommand
/// (`experimental/boxdd/cmd_service.go` upstream — cross-platform, backed
/// on Windows by `startServiceAndWait` in `cmd_service_windows.go`, which
/// is a no-op if it's already running).
pub fn start_service() -> Result<(), CommandError> {
    let daemon_path = daemon_executable_path()?;
    let out = run_elevated(&daemon_path, &["service", "start"])?;
    elevated_result("start_service", out)
}

/// Matches `defaultServiceWorkingDirectory` in
/// `experimental/boxdd/cmd_service_windows.go` upstream.
fn daemon_service_working_directory() -> PathBuf {
    PathBuf::from(r"C:\ProgramData\sing-box-daemon")
}

/// Windows 服务的三态。
///
/// 以前只有「装没装」一个布尔（`sc query` 成功与否），于是「装了但没在跑」——
/// 最常见的一类故障，服务被管理员或优化软件停掉 —— 会一路落到
/// `Unavailable { 原始 IO 错误 }`：用户看到一句看不懂的话，也没有对症的按钮
/// （审计项 H-04）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceStatus {
    Running,
    /// 已注册但当前没运行 —— `start_service()` 就能修好。
    NotRunning,
    NotInstalled,
    /// 探测本身失败了（exe 找不到、退出码不认识……），说不准是哪种。
    Unknown,
}

/// 探测服务状态。
///
/// 用 daemon 自己的 `service status` 而不是 `sc query`：它按退出码精确区分三态
/// （`cmd_service_windows.go` 的 `serviceStatus`：0=running、2=stopped、
/// 3=not installed），`sc query` 只能告诉你服务在不在服务数据库里。对齐官方
/// 客户端的 `probeService()`（`repair.ts`），连退出码都一样。
///
/// 这是同步的进程调用 —— 调用方必须放进 `spawn_blocking`，别直接在 async 路径
/// 上跑（审计项 M-05）。
pub fn probe_service() -> ServiceStatus {
    let Ok(daemon_path) = daemon_executable_path() else {
        return ServiceStatus::Unknown;
    };
    if !daemon_path.exists() {
        return ServiceStatus::Unknown;
    }
    match Command::new(&daemon_path)
        .args(["service", "status"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|output| output.status.code())
    {
        Ok(Some(0)) => ServiceStatus::Running,
        Ok(Some(2)) => ServiceStatus::NotRunning,
        Ok(Some(3)) => ServiceStatus::NotInstalled,
        _ => ServiceStatus::Unknown,
    }
}

/// 服务是否已注册（不论在不在跑）—— 设置页据此显示「安装」还是「卸载」。
pub fn is_service_installed() -> bool {
    !matches!(
        probe_service(),
        ServiceStatus::NotInstalled | ServiceStatus::Unknown
    )
}
