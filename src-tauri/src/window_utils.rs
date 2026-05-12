// window_utils.rs - 窗口操作工具与生命周期状态管理

use std::{future::Future, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindowBuilder};

// ─── 全局窗口行为状态 ──────────────────────────────────────────────
//
// destroy 模式下，窗口被销毁后 Tauri 会触发 ExitRequested。
// 通过 keep_alive_without_windows 标志告知运行时阻止退出，
// 直到用户明确点击退出（此时 allow_exit 置为 true）。
//
// is_creating 用于防止快速双击托盘时同时启动多个窗口重建线程。

struct WindowBehaviorState {
    keep_alive_without_windows: bool,
    allow_exit: bool,
    is_creating: bool,
}

static WINDOW_STATE: Mutex<WindowBehaviorState> = Mutex::new(WindowBehaviorState {
    keep_alive_without_windows: false,
    allow_exit: false,
    is_creating: false,
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

/// 显示主窗口。若窗口已在 destroy 模式下被销毁，则在后台线程中重建并显示。
///
/// 重建时故意不阻塞调用线程（不使用 join），避免在 Windows 主消息循环线程上
/// 产生死锁：WebviewWindowBuilder::build() 内部需要主消息循环处理消息，若调用
/// 线程本身就是主循环线程且被 join 阻塞，webview 将无法完成初始化，表现为窗口
/// 仅出现在任务栏而无法显示。
///
/// is_creating 标志防止快速双击托盘时同时启动多个重建线程（Label already exists）。
pub fn show_or_create_main_window(app: &AppHandle) {
    if app.get_webview_window("main").is_some() {
        if let Err(e) = show_window(app, "main") {
            eprintln!("Failed to show window: {}", e);
        }
        return;
    }

    // 防止并发重建：若已有线程正在创建窗口，直接跳过
    {
        let Ok(mut s) = WINDOW_STATE.lock() else {
            return;
        };
        if s.is_creating {
            return;
        }
        s.is_creating = true;
    }

    // 窗口已被销毁，在独立后台线程中重建，避免阻塞调用线程（主消息循环）
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let result = (|| {
            let window_config = app_clone
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or_else(|| "No window config found in tauri.conf.json".to_string())?;
            WebviewWindowBuilder::from_config(&app_clone, &window_config)
                .and_then(|b| b.build())
                .map_err(|e| format!("Failed to build window: {}", e))
        })();

        if let Ok(mut s) = WINDOW_STATE.lock() {
            s.is_creating = false;
        }

        match result {
            Ok(window) => {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
                set_keep_alive(false);
            }
            Err(e) => eprintln!("Failed to recreate window: {}", e),
        }
    });
}
