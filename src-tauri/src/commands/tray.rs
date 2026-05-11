use crate::errors::CommandError;
use crate::tray::{TrayProxyGroup, TrayProxyState};
use tauri::State;

#[tauri::command]
pub async fn refresh_tray_proxy_menu(
    app_handle: tauri::AppHandle,
    state: State<'_, TrayProxyState>,
    proxy_groups: Vec<TrayProxyGroup>,
) -> Result<(), CommandError> {
    crate::tray::refresh_tray_proxy_menu(app_handle, state, proxy_groups).await
}
