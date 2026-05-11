use crate::errors::CommandError;
use serde::{de::DeserializeOwned, Serialize};
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

pub fn write_json_file<T>(path: &Path, value: &T) -> Result<(), CommandError>
where
    T: Serialize,
{
    let content = serde_json::to_string_pretty(value).map_err(|error| {
        CommandError::json(format!("failed to serialize {}", path.display()), error)
    })?;

    fs::write(path, content)
        .map_err(|error| CommandError::io(format!("failed to write {}", path.display()), error))
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

pub fn remove_named_config(file_name: &str) -> Result<(), CommandError> {
    let path = get_named_config_path(file_name)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| {
            CommandError::io(format!("failed to remove {}", path.display()), error)
        })?;
    }
    Ok(())
}
