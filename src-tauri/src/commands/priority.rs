use crate::errors::CommandError;
use crate::config::priority::{ConfigFieldsCheck, CoreClientConfig, PriorityConfig};

#[tauri::command]
pub async fn save_priority_config(config: PriorityConfig) -> Result<(), CommandError> {
    crate::config::priority::save_priority_config_inner(config)
}

#[tauri::command]
pub async fn load_priority_config() -> Result<PriorityConfig, CommandError> {
    crate::config::priority::load_priority_config_inner()
}

#[tauri::command]
pub async fn clear_priority_config() -> Result<(), CommandError> {
    crate::config::priority::clear_priority_config_inner()
}

#[tauri::command]
pub async fn check_config_fields(config_path: String) -> Result<ConfigFieldsCheck, CommandError> {
    crate::config::priority::check_config_fields_inner(config_path)
}

#[tauri::command]
pub async fn get_core_client_config() -> Result<CoreClientConfig, CommandError> {
    crate::config::priority::get_core_client_config_inner()
}

#[tauri::command]
pub async fn generate_random_port() -> Result<u16, CommandError> {
    crate::config::priority::generate_random_port_inner()
}

#[tauri::command]
pub async fn generate_random_secret() -> Result<String, CommandError> {
    crate::config::priority::generate_random_secret_inner()
}
