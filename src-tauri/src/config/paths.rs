use crate::errors::CommandError;
use std::fs;
use std::path::PathBuf;

pub const CORE_CHANNEL_STABLE: &str = "stable";
pub const CORE_CHANNEL_TESTING: &str = "testing";
const CORE_EXECUTABLE_NAME: &str = "sing-box.exe";

pub fn get_exe_dir() -> Result<PathBuf, CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::resource_not_found("executable path", e))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::resource_not_found("executable directory", "parent path missing")
    })?;
    Ok(exe_dir.to_path_buf())
}

pub fn get_bin_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("bin");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("bin directory", e))?;
    }
    Ok(dir)
}

pub fn get_core_channel_dir(channel: &str) -> Result<PathBuf, CommandError> {
    let normalized = normalize_core_channel(channel)?;
    let dir = get_bin_dir()?.join(normalized);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("core channel directory", e))?;
    }
    Ok(dir)
}

pub fn get_core_version_dir(channel: &str, version: &str) -> Result<PathBuf, CommandError> {
    Ok(get_core_channel_dir(channel)?.join(version))
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

pub fn normalize_core_channel(channel: &str) -> Result<&'static str, CommandError> {
    match channel {
        CORE_CHANNEL_STABLE => Ok(CORE_CHANNEL_STABLE),
        CORE_CHANNEL_TESTING => Ok(CORE_CHANNEL_TESTING),
        _ => Err(CommandError::invalid_state(
            "normalize_core_channel",
            format!("unsupported sing-box core channel: {}", channel),
        )),
    }
}

pub fn set_active_singbox_core_selection(
    channel: Option<String>,
    version: Option<String>,
) -> Result<(), CommandError> {
    if channel.is_some() != version.is_some() {
        return Err(CommandError::invalid_state(
            "set_active_singbox_core_selection",
            "channel and version must either both be set or both be empty",
        ));
    }
    if let Some(channel) = channel.as_deref() {
        normalize_core_channel(channel)?;
    }
    let mut settings = super::app_settings::load_app_settings_file()?;
    settings.settings.singbox_core.active_channel = channel;
    settings.settings.singbox_core.active_version = version;
    super::app_settings::save_app_settings_file(&settings)
}

pub fn get_active_singbox_core_selection() -> Result<Option<(String, String)>, CommandError> {
    let settings = super::app_settings::load_app_settings_file()?;
    match (
        settings.settings.singbox_core.active_channel,
        settings.settings.singbox_core.active_version,
    ) {
        (Some(channel), Some(version)) => Ok(Some((
            normalize_core_channel(&channel)?.to_string(),
            version,
        ))),
        (None, None) => Ok(None),
        _ => Err(CommandError::invalid_state(
            "get_active_singbox_core_selection",
            "app_settings.json must store both singbox_core.active_channel and singbox_core.active_version together",
        )),
    }
}

pub fn get_active_singbox_core_executable() -> Result<PathBuf, CommandError> {
    let (channel, version) = get_active_singbox_core_selection()?.ok_or_else(|| {
        CommandError::resource_not_found(
            "active sing-box core selection",
            "app_settings.json does not point to an installed core version",
        )
    })?;
    let executable_path = get_core_version_dir(&channel, &version)?.join(CORE_EXECUTABLE_NAME);
    if !executable_path.exists() {
        return Err(CommandError::resource_not_found(
            "active sing-box core executable",
            executable_path.display(),
        ));
    }
    Ok(executable_path)
}
