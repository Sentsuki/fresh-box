use crate::errors::CommandError;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

const OVERRIDE_CONFIG_FILE: &str = "config_override.json";

#[derive(serde::Serialize, serde::Deserialize)]
struct OverrideConfig {
    enabled: bool,
    config: Value,
}

fn get_override_config_path() -> Result<PathBuf, CommandError> {
    let config_dir = super::config::get_config_dir()?;
    Ok(config_dir.join(OVERRIDE_CONFIG_FILE))
}

fn load_override_file() -> Result<OverrideConfig, CommandError> {
    let config_path = get_override_config_path()?;
    if !config_path.exists() {
        return Ok(OverrideConfig {
            enabled: false,
            config: json!({}),
        });
    }

    super::config::read_json_file(&config_path)
}

fn save_override_file(override_config: &OverrideConfig) -> Result<(), CommandError> {
    let config_path = get_override_config_path()?;
    super::config::write_json_file(&config_path, override_config)
}

#[tauri::command]
pub async fn enable_config_override() -> Result<(), CommandError> {
    let mut override_config = load_override_file()?;
    override_config.enabled = true;
    save_override_file(&override_config)?;
    Ok(())
}

#[tauri::command]
pub async fn disable_config_override() -> Result<(), CommandError> {
    let mut override_config = load_override_file()?;
    override_config.enabled = false;
    save_override_file(&override_config)?;
    Ok(())
}

#[tauri::command]
pub async fn save_config_override(config: Value) -> Result<(), CommandError> {
    let mut override_config = load_override_file()?;
    override_config.config = config;
    save_override_file(&override_config)?;
    Ok(())
}

#[tauri::command]
pub async fn clear_config_override() -> Result<(), CommandError> {
    let mut override_config = load_override_file()?;
    override_config.config = json!({});
    save_override_file(&override_config)?;
    Ok(())
}

#[tauri::command]
pub async fn load_config_override() -> Result<Value, CommandError> {
    let override_config = load_override_file()?;
    Ok(override_config.config)
}

#[tauri::command]
pub async fn is_config_override_enabled() -> Result<bool, CommandError> {
    let override_config = load_override_file()?;
    Ok(override_config.enabled)
}

pub fn apply_config_override(base_config: &mut Value, override_config: &Value) {
    if let Some(obj) = base_config.as_object_mut() {
        if let Some(override_obj) = override_config.as_object() {
            for (key, value) in override_obj {
                if let Some(existing_value) = obj.get_mut(key) {
                    if existing_value.is_object() && value.is_object() {
                        apply_config_override(existing_value, value);
                    } else {
                        obj[key] = value.clone();
                    }
                } else {
                    obj.insert(key.clone(), value.clone());
                }
            }
        }
    }
}

pub async fn get_override_config_if_enabled() -> Result<Option<Value>, CommandError> {
    let override_config = load_override_file()?;
    if override_config.enabled {
        Ok(Some(override_config.config))
    } else {
        Ok(None)
    }
}
