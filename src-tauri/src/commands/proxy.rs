use crate::errors::CommandError;
use crate::services::daemon_control::ProxyOverview;
use crate::services::singbox::SingboxState;
use indexmap::IndexMap;
use tauri::State;

#[tauri::command]
pub async fn get_proxy_overview(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
) -> Result<ProxyOverview, CommandError> {
    crate::services::daemon_control::get_proxy_overview(app, state.inner()).await
}

#[tauri::command]
pub async fn update_proxy_mode(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
    mode: String,
) -> Result<ProxyOverview, CommandError> {
    crate::services::daemon_control::update_proxy_mode(app, state.inner(), mode).await
}

#[tauri::command]
pub async fn select_proxy(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
    proxy_group: String,
    name: String,
) -> Result<ProxyOverview, CommandError> {
    crate::services::daemon_control::select_proxy(app, state.inner(), proxy_group, name).await
}

#[tauri::command]
pub async fn test_proxy_delay(
    state: State<'_, SingboxState>,
    proxy_name: String,
    timeout_ms: Option<u64>,
) -> Result<i64, CommandError> {
    crate::services::daemon_control::test_proxy_delay(state.inner(), proxy_name, timeout_ms)
        .await
}

#[tauri::command]
pub async fn test_proxy_group_delay(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
    proxy_group: String,
    timeout_ms: Option<u64>,
) -> Result<IndexMap<String, i64>, CommandError> {
    crate::services::daemon_control::test_proxy_group_delay(
        app,
        state.inner(),
        proxy_group,
        timeout_ms,
    )
    .await
}

#[tauri::command]
pub async fn close_all_connections(state: State<'_, SingboxState>) -> Result<(), CommandError> {
    crate::services::daemon_control::close_all_connections(state.inner()).await
}

#[tauri::command]
pub async fn close_connection(
    state: State<'_, SingboxState>,
    id: String,
) -> Result<(), CommandError> {
    crate::services::daemon_control::close_connection(state.inner(), id).await
}
