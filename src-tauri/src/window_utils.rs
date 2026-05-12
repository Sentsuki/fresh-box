// window_utils.rs - 窗口操作工具与生命周期状态管理

use std::{future::Future, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindowBuilder};

// ─── 全局窗口行为状态 ──────────────────────────────────────────────
//
// destroy 模式下，窗口被销毁后 Tauri 会触发 ExitRequested。
// 通过 keep_alive_without_windows 标志告知运行时阻止退出，
// 直到用户明确点击退出（此时 allow_exit 置为 true）。

struct WindowBehaviorState {
    keep_alive_without_windows: bool,
    allow_exit: bool,
}

static WINDOW_STATE: Mutex<WindowBehaviorState> = Mutex::new(WindowBehaviorState {
    keep_alive_without_windows: false,
    allow_exit: false,
});

/// destroy 模式关闭时调用：告知运行时在无窗口时保持存活
pub fn set_keep_alive(enabled: bool) {
    if let Ok(mut s) = WINDOW_STATE.lock() {
        s.keep_alive_without_windows = enabled;
    }
}

/// 用户主动退出前调用：解除保活，允许 ExitRequested 正常放行
pub fn allow_exit() {
    if let Ok(mut s) = WINDOW_STATE.lock() {
        s.keep_alive_without_windows = false;
        s.allow_exit = true;
    }
}

/// 供 RunEvent::ExitRequested 查询：是否应阻止退出
pub fn should_prevent_exit() -> bool {
    WINDOW_STATE
        .lock()
        .map(|s| s.keep_alive_without_windows && !s.allow_exit)
        .unwrap_or(false)
}

// ─── 延迟执行工具 ──────────────────────────────────────────────────

/// 在当前 tokio 运行时上延迟执行同步回调，避免创建额外 OS 线程
pub fn run_after_delay<F>(delay: Duration, action: F)
where
    F: FnOnce() + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(delay).await;
        action();
    });
}

/// 在当前 tokio 运行时上延迟执行异步回调
pub fn spawn_async_after_delay<F, Fut>(delay: Duration, action: F)
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(delay).await;
        action().await;
    });
}

// ─── 窗口操作 ──────────────────────────────────────────────────────

/// 显示并聚焦窗口。unminimize 确保最小化状态下也能正确显示。
pub fn show_window(app: &AppHandle, window_label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(window_label)
        .ok_or_else(|| "Window not found".to_string())?;
    let _ = window.unminimize();
    window
        .show()
        .map_err(|e| format!("Failed to show window: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus window: {}", e))?;
    Ok(())
}

/// 使用 tauri.conf.json 中的窗口配置重建主窗口。
/// 在新线程中同步完成，避免在 tokio 上下文中执行阻塞调用。
fn create_main_window(app: &AppHandle) -> Result<(), String> {
    let window_config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or_else(|| "No window config found in tauri.conf.json".to_string())?;
    let app_handle = app.clone();
    std::thread::spawn(move || {
        WebviewWindowBuilder::from_config(&app_handle, &window_config)
            .map_err(|e| format!("Failed to create window builder: {}", e))?
            .build()
            .map(|_| ())
            .map_err(|e| format!("Failed to build window: {}", e))
    })
    .join()
    .map_err(|_| "Window creation thread panicked".to_string())?
}

/// 显示主窗口。若窗口已在 destroy 模式下被销毁，则先重建再显示。
pub fn show_or_create_main_window(app: &AppHandle) {
    if app.get_webview_window("main").is_some() {
        if let Err(e) = show_window(app, "main") {
            eprintln!("Failed to show window: {}", e);
        }
        return;
    }

    // 窗口已被 destroy，重建后再显示
    if let Err(e) = create_main_window(app) {
        eprintln!("Failed to recreate window: {}", e);
        return;
    }
    if let Err(e) = show_window(app, "main") {
        eprintln!("Failed to show recreated window: {}", e);
    }
    // 窗口已重建，解除保活标志
    set_keep_alive(false);
}
