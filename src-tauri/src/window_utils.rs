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

/// 安全地显示窗口，若窗口已销毁则重新创建
pub fn safe_show_or_create_window(app: &AppHandle, window_label: &str) {
    if app.get_webview_window(window_label).is_some() {
        if let Err(e) = safe_show_window(app, window_label) {
            eprintln!("Failed to show window: {}", e);
        }
        return;
    }

    // Window was destroyed (destroy mode) — recreate it
    let app_clone = app.clone();
    let label = window_label.to_string();
    tauri::async_runtime::spawn(async move {
        match tauri::WebviewWindowBuilder::new(
            &app_clone,
            label,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("fresh-box")
        .inner_size(1200.0, 750.0)
        .decorations(false)
        .transparent(true)
        .center()
        .build()
        {
            Ok(window) => {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Err(e) => {
                eprintln!("Failed to recreate window: {}", e);
            }
        }
    });
}


/// 切换窗口显示状态，若窗口已销毁（destroy 模式）则重新创建
pub fn safe_toggle_or_create_window(app: &AppHandle, window_label: &str) {
    if let Some(window) = app.get_webview_window(window_label) {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
                let _ = window.emit("window-visibility-changed", false);
            }
            Ok(false) => {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("window-visibility-changed", true);
            }
            Err(e) => eprintln!("Failed to check window visibility: {}", e),
        }
    } else {
        // Window was destroyed in destroy mode — recreate it
        safe_show_or_create_window(app, window_label);
    }
}
