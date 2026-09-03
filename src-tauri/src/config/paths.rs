use crate::errors::CommandError;
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Marks that `harden_directory_acl` has already run for this directory —
/// see `get_app_data_root`.
const ACL_MARKER_FILE: &str = ".access-control";

/// `CREATE_NO_WINDOW` — same reasoning as `daemon::install`: spawning a
/// console-subsystem binary from our GUI-subsystem process would otherwise
/// flash a console window on screen for as long as it runs.
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// `FILE_ATTRIBUTE_REPARSE_POINT` — set on both symlinks and directory
/// junctions.
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

/// Whether `path` is itself a symlink or junction, without following it.
fn is_reparse_point(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|m| m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
        .unwrap_or(false)
}

/// Lock `dir`'s ACL down to the current user, `SYSTEM`, and
/// `Administrators` only, replacing whatever it inherited from its parent
/// (typically already user-only under `%LOCALAPPDATA%`, just not as
/// explicitly locked down as this). Mirrors the official desktop client's
/// `userDataSecurity.ts`, which does the same for the same reason: this is
/// where subscription content (which can carry proxy credentials), logs,
/// and crash reports live, so it shouldn't be left any more exposed than
/// necessary to whatever else might be running under the same OS install.
///
/// Shells out to `icacls` rather than calling the Win32 security APIs
/// directly — same tradeoff `daemon::install` makes for elevation:
/// less code, and boxdd/Windows itself already knows how to do this
/// correctly.
fn harden_directory_acl(dir: &Path) -> Result<(), CommandError> {
    let username = std::env::var("USERNAME").unwrap_or_default();
    if username.is_empty() {
        // Can't determine the current account to grant access to — skip
        // hardening rather than lock the current user out of their own
        // data directory.
        return Ok(());
    }
    let account = match std::env::var("USERDOMAIN") {
        Ok(domain) if !domain.is_empty() => format!("{domain}\\{username}"),
        _ => username,
    };

    let output = Command::new("icacls")
        .arg(dir)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(format!("{account}:(OI)(CI)F"))
        // SYSTEM — needed for the sing-box-daemon Windows service (which
        // runs as SYSTEM) and any OS-level maintenance.
        .arg("SYSTEM:(OI)(CI)F")
        // Well-known SID for BUILTIN\Administrators, rather than the
        // localized name (which isn't literally "Administrators" on every
        // Windows language edition).
        .arg("*S-1-5-32-544:(OI)(CI)F")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| CommandError::io("run icacls on app data directory", e))?;

    if !output.status.success() {
        return Err(CommandError::invalid_state(
            "harden_directory_acl",
            format!(
                "icacls exited with {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        ));
    }
    Ok(())
}

pub fn get_exe_dir() -> Result<PathBuf, CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::resource_not_found("executable path", e))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::resource_not_found("executable directory", "parent path missing")
    })?;
    Ok(exe_dir.to_path_buf())
}

/// Root of fresh-box's own mutable state (subscriptions, settings, logs).
///
/// Deliberately NOT under the exe's own directory: since the app installs
/// per-machine into `C:\Program Files\fresh-box` (required so boxdd's
/// install-directory ACL check in `security_windows.go` accepts it — see
/// `daemon::install`), that directory is admin-protected and the app runs
/// unelevated, so it can't write there. `%LOCALAPPDATA%` is always
/// writable by the current user and is the standard place for a Windows
/// app's own per-user data.
pub fn get_app_data_root() -> Result<PathBuf, CommandError> {
    let local_app_data = std::env::var_os("LOCALAPPDATA").ok_or_else(|| {
        CommandError::resource_not_found("LOCALAPPDATA", "environment variable is not set")
    })?;
    let dir = PathBuf::from(local_app_data).join("fresh-box");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("app data directory", e))?;
    }

    // Refuse to treat a symlink/junction as our data directory — silently
    // following one could mean reading/writing files fresh-box doesn't
    // actually control and never put there itself (a directory-hijack
    // attack), the same class of thing `userDataSecurity.ts` guards
    // against in the official client. Checked on every call, not just at
    // creation, since the directory could be swapped out for one after the
    // fact.
    if is_reparse_point(&dir) {
        return Err(CommandError::invalid_state(
            "app data directory",
            format!(
                "{} is a symlink or junction, not a real directory — refusing to use it as \
                 fresh-box's data directory",
                dir.display()
            ),
        ));
    }

    let marker = dir.join(ACL_MARKER_FILE);
    if !marker.exists() {
        // First time we've seen this directory — either just created above,
        // or left over from before this hardening existed. Best-effort: a
        // failure here shouldn't block the app from working, just leave
        // the directory at whatever ACL it already had.
        if let Err(e) = harden_directory_acl(&dir) {
            eprintln!(
                "Warning: failed to harden app data directory permissions: {:?}",
                e
            );
        }
        let _ = fs::write(&marker, b"");
    }

    Ok(dir)
}

pub fn get_sub_dir() -> Result<PathBuf, CommandError> {
    let dir = get_app_data_root()?.join("sub");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("sub directory", e))?;
    }
    Ok(dir)
}

pub fn get_config_dir() -> Result<PathBuf, CommandError> {
    let dir = get_app_data_root()?.join("config");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("config directory", e))?;
    }
    Ok(dir)
}

pub fn get_log_dir() -> Result<PathBuf, CommandError> {
    let dir = get_app_data_root()?.join("log");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("log directory", e))?;
    }
    Ok(dir)
}
