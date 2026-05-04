// tray.rs - 托盘功能模块

use crate::singbox::SingboxState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

async fn open_panel_from_tray() -> Result<(), String> {
    crate::config::open_panel_url()
        .await
        .map_err(|error| error.to_string())
}

// 创建系统托盘
pub fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let panel_i = MenuItem::with_id(app, "panel", "Open Panel", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&panel_i, &show_i, &quit_i])?;

    let tray_builder = TrayIconBuilder::new().menu(&menu).tooltip("fresh-box");

    // 安全地设置图标
    let tray_builder = if let Some(icon) = app.default_window_icon() {
        tray_builder.icon(icon.clone())
    } else {
        eprintln!("Warning: No default window icon found for tray");
        tray_builder
    };

    tray_builder
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle().clone();
                // 延迟执行窗口操作，避免在托盘事件中直接操作
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                    if let Err(e) = crate::window_utils::safe_toggle_window(&app, "main") {
                        eprintln!("Failed to toggle window: {}", e);
                    }
                });
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                let app_clone = app.clone();
                std::thread::spawn(move || {
                    // 安全地清理资源
                    if let Some(state) = app_clone.try_state::<SingboxState>() {
                        crate::singbox::cleanup_process(&state);
                    }

                    // 安全地关闭窗口
                    if let Some(window) = app_clone.get_webview_window("main") {
                        let _ = window.close();
                    }

                    // 延迟退出以确保清理完成
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    std::process::exit(0);
                });
            }
            "show" => {
                let app_clone = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                    if let Err(e) = crate::window_utils::safe_show_window(&app_clone, "main") {
                        eprintln!("Failed to show window: {}", e);
                    }
                });
            }
            "panel" => {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = open_panel_from_tray().await {
                            eprintln!("Failed to open panel: {}", e);
                        }
                    });
                });
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
