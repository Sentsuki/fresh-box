// window_utils.rs - 安全的窗口操作工具

use std::{future::Future, time::Duration};
use tauri::{AppHandle, Emitter, Manager};

pub fn run_after_delay<F>(delay: Duration, action: F)
where
    F: FnOnce() + Send + 'static,
{
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        action();
    });
}

pub fn spawn_async_after_delay<F, Fut>(delay: Duration, action: F)
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    run_after_delay(delay, move || {
        tauri::async_runtime::spawn(action());
    });
}

/// 安全地显示窗口
pub fn safe_show_window(app: &AppHandle, window_label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(window_label) {
        match window.is_visible() {
            Ok(visible) => {
                if !visible {
                    window
                        .show()
                        .map_err(|e| format!("Failed to show window: {}", e))?;
                    let _ = window.emit("window-visibility-changed", true);
                }
                window
                    .set_focus()
                    .map_err(|e| format!("Failed to focus window: {}", e))?;
                Ok(())
            }
            Err(e) => Err(format!("Failed to check window visibility: {}", e)),
        }
    } else {
        Err("Window not found".to_string())
    }
}

/// 安全地切换窗口显示状态
pub fn safe_toggle_window(app: &AppHandle, window_label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(window_label) {
        match window.is_visible() {
            Ok(visible) => {
                if visible {
                    window
                        .hide()
                        .map_err(|e| format!("Failed to hide window: {}", e))?;
                    let _ = window.emit("window-visibility-changed", false);
                } else {
                    window
                        .show()
                        .map_err(|e| format!("Failed to show window: {}", e))?;
                    window
                        .set_focus()
                        .map_err(|e| format!("Failed to focus window: {}", e))?;
                    let _ = window.emit("window-visibility-changed", true);
                }
                Ok(())
            }
            Err(e) => Err(format!("Failed to check window visibility: {}", e)),
        }
    } else {
        Err("Window not found".to_string())
    }
}
