use crate::errors::CommandError;
use crate::services::daemon_control::ClashOverview;
use crate::services::singbox::SingboxState;
use indexmap::IndexMap;
use tauri::State;

#[tauri::command]
pub async fn get_clash_overview(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
) -> Result<ClashOverview, CommandError> {
    crate::services::daemon_control::get_clash_overview(app, state.inner()).await
}

#[tauri::command]
pub async fn update_clash_mode(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
    mode: String,
) -> Result<ClashOverview, CommandError> {
    crate::services::daemon_control::update_clash_mode(app, state.inner(), mode).await
}

#[tauri::command]
pub async fn select_clash_proxy(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
    proxy_group: String,
    name: String,
) -> Result<ClashOverview, CommandError> {
    crate::services::daemon_control::select_clash_proxy(app, state.inner(), proxy_group, name)
        .await
}

#[tauri::command]
pub async fn test_clash_proxy_delay(
    state: State<'_, SingboxState>,
    proxy_name: String,
    url: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<i64, CommandError> {
    crate::services::daemon_control::test_clash_proxy_delay(
        state.inner(),
        proxy_name,
        url,
        timeout_ms,
    )
    .await
}

#[tauri::command]
pub async fn test_clash_proxy_group_delay(
    app: tauri::AppHandle,
    state: State<'_, SingboxState>,
    proxy_group: String,
    url: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<IndexMap<String, i64>, CommandError> {
    crate::services::daemon_control::test_clash_proxy_group_delay(
        app,
        state.inner(),
        proxy_group,
        url,
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
