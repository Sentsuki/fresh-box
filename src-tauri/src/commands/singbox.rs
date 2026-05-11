use crate::errors::CommandError;
use crate::services::singbox::SingboxState;
use tauri::State;

#[tauri::command]
pub async fn start_singbox(
    _app_handle: tauri::AppHandle,
    state: State<'_, SingboxState>,
    config_path: String,
) -> Result<(), CommandError> {
    crate::services::singbox::start_singbox(_app_handle, state, config_path).await
}

#[tauri::command]
pub async fn stop_singbox(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    crate::services::singbox::stop_singbox(state).await
}

#[tauri::command]
pub async fn is_singbox_running(state: State<'_, SingboxState>) -> Result<bool, CommandError> {
    crate::services::singbox::is_singbox_running(state).await
}

#[tauri::command]
pub async fn health_check_singbox(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    crate::services::singbox::health_check_singbox(state).await
}

#[tauri::command]
pub async fn initialize_singbox_state(
    state: State<'_, SingboxState>,
) -> Result<String, CommandError> {
    crate::services::singbox::initialize_singbox_state(state).await
}

#[tauri::command]
pub async fn get_singbox_status(state: State<'_, SingboxState>) -> Result<String, CommandError> {
    crate::services::singbox::get_singbox_status(state).await
}

#[tauri::command]
pub async fn refresh_singbox_detection(
    state: State<'_, SingboxState>,
) -> Result<bool, CommandError> {
    crate::services::singbox::refresh_singbox_detection(state).await
}
