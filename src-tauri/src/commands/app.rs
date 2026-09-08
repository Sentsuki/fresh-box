// App-level commands that aren't specific to sing-box/the daemon.
//
// 这几个对 runtime 泛型（`<R: Runtime>`），不是为了跨后端 —— fresh-box 只跑
// Wry。是因为 `AppHandle`/`Window` 的默认参数是 `Wry`，一旦写成裸类型，
// `tauri_specta::collect_commands!` 就被钉死在 Wry 上，导出绑定的测试二进制
// 会被迫链进 wry，启动时去找 WebView2 然后 `STATUS_ENTRYPOINT_NOT_FOUND`。
// 泛型化之后 builder 可以用 `MockRuntime` 实例化，导出只需要签名。

use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::ManagerExt;

use crate::errors::CommandError;

/// `true` if fresh-box is currently registered to launch at Windows
/// startup (a registry Run-key entry, via `tauri-plugin-autostart`).
#[tauri::command]
#[specta::specta]
pub fn is_autostart_enabled<R: Runtime>(app: AppHandle<R>) -> Result<bool, CommandError> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| CommandError::io("check autostart registration", e))
}

/// Registers fresh-box to launch at Windows startup, passing `--autostart`
/// so `main.rs` can tell a login-triggered launch apart from a normal one
/// (and start hidden in the tray instead of showing the main window — see
/// its doc comment).
#[tauri::command]
#[specta::specta]
pub fn enable_autostart<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    app.autolaunch()
        .enable()
        .map_err(|e| CommandError::io("enable autostart", e))
}

#[tauri::command]
#[specta::specta]
pub fn disable_autostart<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    app.autolaunch()
        .disable()
        .map_err(|e| CommandError::io("disable autostart", e))
}

/// Re-applies the Mica backdrop material for the current theme — called by
/// the frontend whenever the user switches theme mode, since Windows only
/// re-tints an already-applied Mica surface on its own for the *system*
/// theme changing, not for fresh-box's own light/dark toggle.
#[tauri::command]
#[specta::specta]
pub fn update_mica_theme<R: Runtime>(window: tauri::Window<R>, is_light: Option<bool>) {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_mica;
        let is_dark = is_light.map(|light| !light);
        let _ = apply_mica(&window, is_dark);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (window, is_light);
}
