// window_utils.rs - 窗口操作工具与生命周期状态管理

use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};

// ─── 关闭行为状态机 ────────────────────────────────────────────────
//
// destroy 模式下，窗口被销毁后 Tauri 会触发 ExitRequested。这三个状态
// 取代了之前 keep_alive_without_windows/allow_exit 两个独立 bool 手搓的
// 隐式状态机（`allow_exit && !keep_alive` 之类的组合本身并不成立，两者
// 实际只会先后各自置位，用枚举把"当前处于哪个阶段"这件事显式化，而不是
// 靠两个 bool 的相对取值去推断）：
//
//   Normal        — 窗口正常持有，无需特殊处理
//   KeptAlive      — 窗口刚被 destroy 模式关闭销毁，运行时需要在无窗口时
//                     继续存活（阻止 ExitRequested），直到用户明确退出
//   ExitAllowed    — 用户点击了托盘"退出"，放行 ExitRequested 正常关闭
//
// is_creating 是另一个正交的关注点（防止快速双击托盘时并发启动多个窗口
// 重建线程），不属于这个关闭行为状态机，单独用一个 bool 表达即可。

#[derive(Clone, Copy, PartialEq, Eq)]
enum ExitGuard {
    Normal,
    KeptAlive,
    ExitAllowed,
}

struct WindowBehaviorState {
    exit_guard: ExitGuard,
    is_creating: bool,
}

static WINDOW_STATE: Mutex<WindowBehaviorState> = Mutex::new(WindowBehaviorState {
    exit_guard: ExitGuard::Normal,
    is_creating: false,
});

/// destroy 模式关闭时调用：告知运行时在无窗口时保持存活
pub fn set_keep_alive(enabled: bool) {
    if let Ok(mut s) = WINDOW_STATE.lock() {
        s.exit_guard = if enabled {
            ExitGuard::KeptAlive
        } else {
            ExitGuard::Normal
        };
    }
}

/// 用户主动退出前调用：解除保活，允许 ExitRequested 正常放行
pub fn allow_exit() {
    if let Ok(mut s) = WINDOW_STATE.lock() {
        s.exit_guard = ExitGuard::ExitAllowed;
    }
}

/// 供 RunEvent::ExitRequested 查询：是否应阻止退出
pub fn should_prevent_exit() -> bool {
    WINDOW_STATE
        .lock()
        .map(|s| s.exit_guard == ExitGuard::KeptAlive)
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
    // 通知前端窗口已重新可见，恢复流
    let _ = window.emit("window-visibility-changed", true);
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
            tracing::warn!(error = %e, "failed to show window");
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
                // A window rebuilt here (after a "destroy"-mode close)
                // otherwise comes back at tauri.conf.json's static
                // default bounds — see `window_state::restore`'s doc
                // comment for why this has to happen before `.show()`.
                crate::window_state::restore(&window);
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
                // 通知前端窗口已重新可见，恢复流
                let _ = window.emit("window-visibility-changed", true);
                set_keep_alive(false);
            }
            Err(e) => tracing::error!(error = %e, "failed to recreate window"),
        }
    });
}
