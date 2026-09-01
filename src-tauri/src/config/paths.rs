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

pub fn get_sub_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("sub");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("sub directory", e))?;
    }
    Ok(dir)
}

pub fn get_config_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("config");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("config directory", e))?;
    }
    Ok(dir)
}

pub fn get_data_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("data");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("data directory", e))?;
    }
    Ok(dir)
}
