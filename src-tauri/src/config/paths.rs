use crate::errors::CommandError;
use std::fs;
use std::path::PathBuf;

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

pub fn get_data_dir() -> Result<PathBuf, CommandError> {
    let dir = get_app_data_root()?.join("data");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("data directory", e))?;
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
