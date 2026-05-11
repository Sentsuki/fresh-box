use crate::errors::CommandError;
use crate::services::clash_client::ClashOverview;
use std::collections::HashMap;

#[tauri::command]
pub async fn get_clash_overview(app: tauri::AppHandle) -> Result<ClashOverview, CommandError> {
    crate::services::clash_client::get_clash_overview(app).await
}

#[tauri::command]
pub async fn update_clash_mode(
    app: tauri::AppHandle,
    mode: String,
) -> Result<ClashOverview, CommandError> {
    crate::services::clash_client::update_clash_mode(app, mode).await
}

#[tauri::command]
pub async fn select_clash_proxy(
    app: tauri::AppHandle,
    proxy_group: String,
    name: String,
) -> Result<ClashOverview, CommandError> {
    crate::services::clash_client::select_clash_proxy(app, proxy_group, name).await
}

#[tauri::command]
pub async fn test_clash_proxy_delay(
    proxy_name: String,
    url: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<i64, CommandError> {
    crate::services::clash_client::test_clash_proxy_delay(proxy_name, url, timeout_ms).await
}

#[tauri::command]
pub async fn test_clash_proxy_group_delay(
    app: tauri::AppHandle,
    proxy_group: String,
    url: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HashMap<String, i64>, CommandError> {
    crate::services::clash_client::test_clash_proxy_group_delay(app, proxy_group, url, timeout_ms)
        .await
}

#[tauri::command]
pub async fn get_clash_rules()
-> Result<crate::services::clash_client::ClashRulesSnapshot, CommandError> {
    crate::services::clash_client::get_clash_rules().await
}

#[tauri::command]
pub async fn query_dns(
    name: String,
    r#type: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    crate::services::clash_client::query_dns(name, r#type).await
}

#[tauri::command]
pub async fn flush_fakeip_cache() -> Result<(), CommandError> {
    crate::services::clash_client::flush_fakeip_cache().await
}

#[tauri::command]
pub async fn flush_dns_cache() -> Result<(), CommandError> {
    crate::services::clash_client::flush_dns_cache().await
}

#[tauri::command]
pub async fn close_all_connections() -> Result<(), CommandError> {
    crate::services::clash_client::close_all_connections().await
}

#[tauri::command]
pub async fn close_connection(id: String) -> Result<(), CommandError> {
    crate::services::clash_client::close_connection(id).await
}
