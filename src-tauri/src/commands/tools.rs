use crate::errors::CommandError;
use crate::services::singbox::SingboxState;
use crate::services::tools::{NetworkQualityTestOptions, StunTestOptions, ToolsState};
use tauri::State;

#[tauri::command]
pub async fn start_network_quality_test(
    app: tauri::AppHandle,
    tools: State<'_, ToolsState>,
    singbox: State<'_, SingboxState>,
    options: NetworkQualityTestOptions,
) -> Result<(), CommandError> {
    crate::services::tools::start_network_quality_test(app, tools, singbox, options).await
}

#[tauri::command]
pub async fn cancel_network_quality_test(tools: State<'_, ToolsState>) -> Result<(), CommandError> {
    crate::services::tools::cancel_network_quality_test(tools).await
}

#[tauri::command]
pub async fn start_stun_test(
    app: tauri::AppHandle,
    tools: State<'_, ToolsState>,
    singbox: State<'_, SingboxState>,
    options: StunTestOptions,
) -> Result<(), CommandError> {
    crate::services::tools::start_stun_test(app, tools, singbox, options).await
}

#[tauri::command]
pub async fn cancel_stun_test(tools: State<'_, ToolsState>) -> Result<(), CommandError> {
    crate::services::tools::cancel_stun_test(tools).await
}
