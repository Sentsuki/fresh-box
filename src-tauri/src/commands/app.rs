// App-level commands that aren't specific to sing-box/the daemon.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::errors::CommandError;

/// `true` if fresh-box is currently registered to launch at Windows
/// startup (a registry Run-key entry, via `tauri-plugin-autostart`).
#[tauri::command]
pub fn is_autostart_enabled(app: AppHandle) -> Result<bool, CommandError> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| CommandError::io("check autostart registration", e))
}

/// Registers fresh-box to launch at Windows startup, passing `--autostart`
/// so `main.rs` can tell a login-triggered launch apart from a normal one
/// (and start hidden in the tray instead of showing the main window — see
/// its doc comment).
#[tauri::command]
pub fn enable_autostart(app: AppHandle) -> Result<(), CommandError> {
    app.autolaunch()
        .enable()
        .map_err(|e| CommandError::io("enable autostart", e))
}

#[tauri::command]
pub fn disable_autostart(app: AppHandle) -> Result<(), CommandError> {
    app.autolaunch()
        .disable()
        .map_err(|e| CommandError::io("disable autostart", e))
}

/// Re-applies the Mica backdrop material for the current theme — called by
/// the frontend whenever the user switches theme mode, since Windows only
/// re-tints an already-applied Mica surface on its own for the *system*
/// theme changing, not for fresh-box's own light/dark toggle.
#[tauri::command]
pub fn update_mica_theme(window: tauri::Window, is_light: Option<bool>) {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_mica;
        let is_dark = is_light.map(|light| !light);
        let _ = apply_mica(&window, is_dark);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (window, is_light);
}

/// Checks GitHub for a newer fresh-box release than the one currently
/// running — detection only, see `services::updater`'s doc comment. Called
/// both from `main.rs`'s startup check and on-demand from Settings' "Check
/// for Updates" button.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
) -> Result<crate::services::updater::UpdateInfo, CommandError> {
    let current_version = app.package_info().version.to_string();
    crate::services::updater::check_for_update(&current_version).await
}

/// Opens `url` in the system's default browser — used for external links
/// the user explicitly chooses to follow (currently just an available
/// update's release page). Restricted to `https://` so this can never be
/// asked to open a local file or a `file://`/custom-scheme URI — nothing in
/// the frontend has a legitimate reason to open anything else this way.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), CommandError> {
    if !url.starts_with("https://") {
        return Err(CommandError::validation(
            "Only https:// URLs can be opened this way",
        ));
    }
    crate::commands::config::open_with_system(&url)
}
