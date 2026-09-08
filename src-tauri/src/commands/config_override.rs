use tauri::State;
use crate::store::Store;
use crate::errors::CommandError;

#[tauri::command]
pub fn enable_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    crate::config::config_override::enable_config_override_inner(store.inner())
}

#[tauri::command]
pub fn disable_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    crate::config::config_override::disable_config_override_inner(store.inner())
}

#[tauri::command]
pub fn save_config_override(store: State<'_, Store>, config: serde_json::Value) -> Result<(), CommandError> {
    crate::config::config_override::save_config_override_inner(store.inner(), config)
}

#[tauri::command]
pub fn clear_config_override(store: State<'_, Store>) -> Result<(), CommandError> {
    crate::config::config_override::clear_config_override_inner(store.inner())
}

#[tauri::command]
pub fn load_config_override(store: State<'_, Store>) -> Result<serde_json::Value, CommandError> {
    crate::config::config_override::load_config_override_inner(store.inner())
}

#[tauri::command]
pub fn is_config_override_enabled(store: State<'_, Store>) -> Result<bool, CommandError> {
    crate::config::config_override::is_config_override_enabled_inner(store.inner())
}
