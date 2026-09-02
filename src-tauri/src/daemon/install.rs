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
/// binary (`powershell`, `sc`, ...) from our GUI-subsystem process makes
/// Windows allocate it a brand new console window, which flashes on
/// screen for as long as the child runs.
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Must match `serviceName` in `experimental/boxdd/main.go` upstream.
const SERVICE_NAME: &str = "sing-box-daemon";

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
    let log_path = std::env::temp_dir().join(format!(
        "fresh-box-elevated-{}-{}.log",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default()
    ));

    let quoted_args = args
        .iter()
        .map(|a| powershell_quote(a))
        .collect::<Vec<_>>()
        .join(" ");
    let inner_script = format!(
        "& {} {} *> {}\nexit $LASTEXITCODE",
        powershell_quote(&executable.display().to_string()),
        quoted_args,
        powershell_quote(&log_path.display().to_string()),
    );
    let encoded_inner = base64::engine::general_purpose::STANDARD.encode(
        inner_script
            .encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect::<Vec<u8>>(),
    );

    let outer_script = format!(
        "$p = Start-Process -FilePath 'powershell' -ArgumentList \
         @('-NoProfile','-NonInteractive','-EncodedCommand','{encoded_inner}') \
         -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
    );

    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &outer_script])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| CommandError::io("launch elevated daemon service command", e))?;

    let log = std::fs::read_to_string(&log_path).unwrap_or_default();
    let _ = std::fs::remove_file(&log_path);

    Ok(ElevatedOutput {
        code: status.code().unwrap_or(-1),
        log,
    })
}

/// One-time (per install/update), UAC-gated: registers `sing-box-daemon.exe`
/// as a Windows service. Safe to call when already installed — boxdd's
/// `service install` updates the existing registration in place.
fn elevated_failure(context: &str, out: &ElevatedOutput) -> CommandError {
    let mut detail = format!("exited with code {}", out.code);
    if !out.log.trim().is_empty() {
        detail.push_str(&format!("\n{}", out.log.trim()));
    }
    CommandError::invalid_state(context, detail)
}

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
    if out.code != 0 {
        return Err(elevated_failure("install_service", &out));
    }
    Ok(())
}

pub fn uninstall_service() -> Result<(), CommandError> {
    let daemon_path = daemon_executable_path()?;
    let out = run_elevated(&daemon_path, &["service", "uninstall"])?;
    if out.code != 0 {
        return Err(elevated_failure("uninstall_service", &out));
    }
    Ok(())
}

/// Matches `defaultServiceWorkingDirectory` in
/// `experimental/boxdd/cmd_service_windows.go` upstream.
fn daemon_service_working_directory() -> PathBuf {
    PathBuf::from(r"C:\ProgramData\sing-box-daemon")
}

/// `true` once `sing-box-daemon` shows up in the Windows service database,
/// regardless of its current run state.
pub fn is_service_installed() -> bool {
    Command::new("sc")
        .args(["query", SERVICE_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}
