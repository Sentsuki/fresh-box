// Locates the bundled daemon executable and drives its own `service
// install` / `service uninstall` subcommands (implemented upstream in
// `experimental/boxdd/cmd_service_windows.go`) through a UAC prompt.
// fresh-box does not reimplement Windows service registration itself —
// boxdd already knows how to register itself correctly (recovery actions,
// working-directory ACLs, etc.), so this module just shells out to it
// elevated.

use std::path::PathBuf;
use std::process::Command;

use crate::errors::CommandError;

/// Must match `serviceName` in `experimental/boxdd/main.go` upstream.
const SERVICE_NAME: &str = "sing-box-daemon";

/// `<InstallDir>\sing-box.exe` — fresh-box's own executable, playing the
/// role boxdd's peer authentication calls "the installed application". See
/// `worker.rs` for why the name and location are load-bearing, not
/// cosmetic: `experimental/boxdd/security_windows.go`'s
/// `installedApplicationPath` derives this same path from the daemon's own
/// location and requires the two to be signed with the same certificate.
pub fn application_executable_path() -> Result<PathBuf, CommandError> {
    crate::config::get_exe_dir().map(|dir| dir.join("sing-box.exe"))
}

/// `<InstallDir>\resources\daemon\sing-box-daemon.exe` — the fixed relative
/// layout `installedApplicationPath` requires.
pub fn daemon_executable_path() -> Result<PathBuf, CommandError> {
    crate::config::get_exe_dir().map(|dir| dir.join("resources").join("daemon").join("sing-box-daemon.exe"))
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
    stdout: String,
    stderr: String,
}

fn run_elevated(executable: &std::path::Path, args: &[&str]) -> Result<ElevatedOutput, CommandError> {
    let stdout_path = std::env::temp_dir().join(format!("fresh-box-elevated-{}.out.log", std::process::id()));
    let stderr_path = std::env::temp_dir().join(format!("fresh-box-elevated-{}.err.log", std::process::id()));

    let arg_list = args
        .iter()
        .map(|a| format!("'{}'", a.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");
    let script = format!(
        "$p = Start-Process -FilePath '{}' -ArgumentList {} -Verb RunAs -Wait -PassThru \
         -RedirectStandardOutput '{}' -RedirectStandardError '{}'; exit $p.ExitCode",
        executable.display().to_string().replace('\'', "''"),
        arg_list,
        stdout_path.display().to_string().replace('\'', "''"),
        stderr_path.display().to_string().replace('\'', "''"),
    );

    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .status()
        .map_err(|e| CommandError::io("launch elevated daemon service command", e))?;

    let stdout = std::fs::read_to_string(&stdout_path).unwrap_or_default();
    let stderr = std::fs::read_to_string(&stderr_path).unwrap_or_default();
    let _ = std::fs::remove_file(&stdout_path);
    let _ = std::fs::remove_file(&stderr_path);

    Ok(ElevatedOutput {
        code: status.code().unwrap_or(-1),
        stdout,
        stderr,
    })
}

/// One-time (per install/update), UAC-gated: registers `sing-box-daemon.exe`
/// as a Windows service. Safe to call when already installed — boxdd's
/// `service install` updates the existing registration in place.
fn elevated_failure(context: &str, out: &ElevatedOutput) -> CommandError {
    let mut detail = format!("exited with code {}", out.code);
    if !out.stderr.trim().is_empty() {
        detail.push_str(&format!("\nstderr: {}", out.stderr.trim()));
    }
    if !out.stdout.trim().is_empty() {
        detail.push_str(&format!("\nstdout: {}", out.stdout.trim()));
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
            working_directory
                .to_str()
                .ok_or_else(|| CommandError::validation("daemon working directory is not valid UTF-8"))?,
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
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}
