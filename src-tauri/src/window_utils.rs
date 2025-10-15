// window_utils.rs - 安全的窗口操作工具

use tauri::{AppHandle, WebviewWindow, Manager};

/// 安全地显示窗口
pub fn safe_show_window(app: &AppHandle, window_label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(window_label) {
        match window.is_visible() {
            Ok(visible) => {
                if !visible {
                    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
                }
                window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
                Ok(())
            }
            Err(e) => Err(format!("Failed to check window visibility: {}", e))
        }
    } else {
        Err("Window not found".to_string())
    }
}

/// 安全地隐藏窗口
pub fn safe_hide_window(app: &AppHandle, window_label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(window_label) {
        match window.is_visible() {
            Ok(visible) => {
                if visible {
                    window.hide().map_err(|e| format!("Failed to hide window: {}", e))?;
                }
                Ok(())
            }
            Err(e) => Err(format!("Failed to check window visibility: {}", e))
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
                    window.hide().map_err(|e| format!("Failed to hide window: {}", e))?;
                } else {
                    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
                    window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
                }
                Ok(())
            }
            Err(e) => Err(format!("Failed to check window visibility: {}", e))
        }
    } else {
        Err("Window not found".to_string())
    }
}

/// 检查窗口是否有效且可操作
pub fn is_window_valid(window: &WebviewWindow) -> bool {
    window.is_visible().is_ok()
}