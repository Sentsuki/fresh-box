use crate::errors::CommandError;
use serde::{Serialize, de::DeserializeOwned};
use std::fs;
use std::path::{Path, PathBuf};

pub fn read_json_file<T>(path: &Path) -> Result<T, CommandError>
where
    T: DeserializeOwned,
{
    let content = fs::read_to_string(path).map_err(|error| {
        CommandError::io(
            format!("failed to read JSON file {}", path.display()),
            error,
        )
    })?;

    serde_json::from_str(&content)
        .map_err(|error| CommandError::json(format!("failed to parse {}", path.display()), error))
}

/// Write `content` to `path` atomically: write to a temporary file in the
/// same directory first, then rename it over the target. A rename within
/// the same filesystem is a single atomic operation — a reader (or a crash
/// / power loss) only ever sees either the fully old or the fully new
/// content, never a partially-written file. Mirrors the official desktop
/// client's `atomicWriteFile` (`src/main/profiles.ts`), which every one of
/// its own profile/subscription writes goes through for the same reason.
///
/// Before this existed, every write in this module (and every direct
/// `fs::write` of a subscription/config file elsewhere) wrote straight to
/// the target path — a crash or power loss mid-write left a truncated or
/// corrupt file behind, and `load_subscriptions_json`'s
/// `unwrap_or(Value::Object(...))` would then silently treat that as "no
/// data" rather than surfacing the corruption.
pub fn atomic_write(path: &Path, content: &[u8]) -> Result<(), CommandError> {
    let dir = path.parent().ok_or_else(|| {
        CommandError::invalid_state(
            "atomic_write",
            format!("{} has no parent directory", path.display()),
        )
    })?;
    let file_name = path.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
        CommandError::invalid_state(
            "atomic_write",
            format!("{} has no valid file name", path.display()),
        )
    })?;

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let tmp_path = dir.join(format!(".{file_name}.{}-{nanos}.tmp", std::process::id()));

    if let Err(error) = fs::write(&tmp_path, content) {
        let _ = fs::remove_file(&tmp_path);
        return Err(CommandError::io(
            format!("failed to write temp file for {}", path.display()),
            error,
        ));
    }

    if let Err(error) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(CommandError::io(
            format!("failed to finalize write to {}", path.display()),
            error,
        ));
    }

    Ok(())
}

pub fn write_json_file<T>(path: &Path, value: &T) -> Result<(), CommandError>
where
    T: Serialize,
{
    let content = serde_json::to_string_pretty(value).map_err(|error| {
        CommandError::json(format!("failed to serialize {}", path.display()), error)
    })?;

    atomic_write(path, content.as_bytes())
}

pub(crate) fn load_json_or_default<T>(path: &Path) -> Result<T, CommandError>
where
    T: DeserializeOwned + Default,
{
    if !path.exists() {
        return Ok(T::default());
    }
    read_json_file(path)
}

pub fn get_named_config_path(file_name: &str) -> Result<PathBuf, CommandError> {
    Ok(super::paths::get_config_dir()?.join(file_name))
}

pub fn load_named_config_or_default<T>(file_name: &str) -> Result<T, CommandError>
where
    T: DeserializeOwned + Default,
{
    load_json_or_default(&get_named_config_path(file_name)?)
}

pub fn save_named_config<T>(file_name: &str, value: &T) -> Result<(), CommandError>
where
    T: Serialize,
{
    write_json_file(&get_named_config_path(file_name)?, value)
}

