use crate::errors::CommandError;

#[tauri::command]
pub async fn enable_config_override() -> Result<(), CommandError> {
    crate::config::config_override::enable_config_override_inner()
}

#[tauri::command]
pub async fn disable_config_override() -> Result<(), CommandError> {
    crate::config::config_override::disable_config_override_inner()
}

#[tauri::command]
pub async fn save_config_override(config: serde_json::Value) -> Result<(), CommandError> {
    crate::config::config_override::save_config_override_inner(config)
}

#[tauri::command]
pub async fn clear_config_override() -> Result<(), CommandError> {
    crate::config::config_override::clear_config_override_inner()
}

#[tauri::command]
pub async fn load_config_override() -> Result<serde_json::Value, CommandError> {
    crate::config::config_override::load_config_override_inner()
}

#[tauri::command]
pub async fn is_config_override_enabled() -> Result<bool, CommandError> {
    crate::config::config_override::is_config_override_enabled_inner()
}
