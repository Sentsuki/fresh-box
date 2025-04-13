use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use crate::errors::CommandError;

const OVERRIDE_CONFIG_FILE: &str = "config_override.json";

fn get_override_config_path() -> Result<PathBuf, CommandError> {
    let bin_dir = super::config::get_bin_dir()?;
    Ok(bin_dir.join(OVERRIDE_CONFIG_FILE))
}

#[tauri::command]
pub async fn enable_config_override() -> Result<(), CommandError> {
    let config_path = get_override_config_path()?;
    if !config_path.exists() {
        fs::write(&config_path, "{}")?;
    }
    Ok(())
}

#[tauri::command]
pub async fn disable_config_override() -> Result<(), CommandError> {
    let config_path = get_override_config_path()?;
    if config_path.exists() {
        fs::remove_file(&config_path)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn save_config_override(config: Value) -> Result<(), CommandError> {
    let config_path = get_override_config_path()?;
    let config_str = serde_json::to_string_pretty(&config)?;
    fs::write(&config_path, config_str)?;
    Ok(())
}

#[tauri::command]
pub async fn clear_config_override() -> Result<(), CommandError> {
    let config_path = get_override_config_path()?;
    if config_path.exists() {
        fs::write(&config_path, "{}")?;
    }
    Ok(())
}

#[tauri::command]
pub async fn load_config_override() -> Result<Value, CommandError> {
    let config_path = get_override_config_path()?;
    if !config_path.exists() {
        return Ok(serde_json::json!({}));
    }
    
    let config_str = fs::read_to_string(&config_path)?;
    let config: Value = serde_json::from_str(&config_str)?;
    Ok(config)
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