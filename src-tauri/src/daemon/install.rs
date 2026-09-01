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

fn run_elevated(executable: &std::path::Path, args: &[&str]) -> Result<i32, CommandError> {
    // `Start-Process -Verb RunAs -Wait -PassThru` is the standard way to get
    // an exit code back from a UAC-elevated child on Windows — a plain
    // `Command::new(...).spawn()` with a "runas" verb has no equivalent in
    // std, and ShellExecute itself doesn't hand back an exit code.
    let arg_list = args
        .iter()
        .map(|a| format!("'{}'", a.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");
    let script = format!(
        "$p = Start-Process -FilePath '{}' -ArgumentList {} -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
        executable.display().to_string().replace('\'', "''"),
        arg_list
    );

    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .status()
        .map_err(|e| CommandError::io("launch elevated daemon service command", e))?;

    Ok(status.code().unwrap_or(-1))
}

/// One-time (per install/update), UAC-gated: registers `sing-box-daemon.exe`
/// as a Windows service. Safe to call when already installed — boxdd's
/// `service install` updates the existing registration in place.
pub fn install_service() -> Result<(), CommandError> {
    let daemon_path = daemon_executable_path()?;
    let working_directory = daemon_service_working_directory();
    let code = run_elevated(
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
    if code != 0 {
        return Err(CommandError::invalid_state(
            "install_service",
            format!("sing-box-daemon service install exited with code {code}"),
        ));
    }
    Ok(())
}

pub fn uninstall_service() -> Result<(), CommandError> {
    let daemon_path = daemon_executable_path()?;
    let code = run_elevated(&daemon_path, &["service", "uninstall"])?;
    if code != 0 {
        return Err(CommandError::invalid_state(
            "uninstall_service",
            format!("sing-box-daemon service uninstall exited with code {code}"),
        ));
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
