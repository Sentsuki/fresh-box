use crate::errors::CommandError;
use crate::services::core_update::{
    CoreUpdateCancelState, SingboxCoreStatus, SingboxCoreUpdateResult,
};
use crate::services::singbox::SingboxState;
use tauri::State;

#[tauri::command]
pub async fn cancel_core_update(
    cancel: State<'_, CoreUpdateCancelState>,
) -> Result<(), CommandError> {
    crate::services::core_update::cancel_core_update(cancel).await
}

#[tauri::command]
pub async fn get_singbox_core_status(
    state: State<'_, SingboxState>,
    force_refresh: Option<bool>,
) -> Result<SingboxCoreStatus, CommandError> {
    crate::services::core_update::get_singbox_core_status(state, force_refresh).await
}

#[tauri::command]
pub async fn activate_singbox_core(channel: String, version: String) -> Result<(), CommandError> {
    crate::services::core_update::activate_singbox_core(channel, version).await
}

#[tauri::command]
pub async fn update_singbox_core(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
    cancel: State<'_, CoreUpdateCancelState>,
    channel: String,
    version: String,
) -> Result<SingboxCoreUpdateResult, CommandError> {
    crate::services::core_update::update_singbox_core(app, state, cancel, channel, version).await
}
