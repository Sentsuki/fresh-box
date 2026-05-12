use super::model::TrayNavigatePayload;
use super::model::TrayRuntimeStateInput;
use super::model::TrayToggleProxyFeaturePayload;
use super::service;
use tauri::AppHandle;

#[tauri::command]
pub fn tray_sync_state(
    app_handle: AppHandle,
    payload: TrayRuntimeStateInput,
) -> Result<(), String> {
    service::sync_tray_state(&app_handle, payload)
}

#[tauri::command]
pub fn tray_set_last_visible_route(path: String) -> Result<(), String> {
    service::set_last_visible_route(&path);
    Ok(())
}

#[tauri::command]
pub fn tray_show_main_window(app_handle: AppHandle) -> Result<(), String> {
    service::show_main_window(&app_handle, true)
}

#[tauri::command]
pub fn tray_hide_main_window(app_handle: AppHandle) -> Result<(), String> {
    service::hide_main_window(&app_handle, true)
}

#[tauri::command]
pub fn tray_close_main_window(app_handle: AppHandle) -> Result<(), String> {
    service::close_main_window(&app_handle)
}

#[tauri::command]
pub fn tray_consume_pending_restore_route() -> Option<TrayNavigatePayload> {
    service::consume_pending_restore_route()
}

#[tauri::command]
pub fn tray_consume_pending_proxy_toggle() -> Option<TrayToggleProxyFeaturePayload> {
    service::consume_pending_proxy_toggle()
}

#[tauri::command]
pub fn tray_request_app_exit(app_handle: AppHandle) -> Result<(), String> {
    service::request_app_exit(&app_handle)
}
