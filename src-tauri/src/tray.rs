// tray.rs - 托盘功能模块

use crate::singbox::SingboxState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

// 创建系统托盘
pub fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

    let tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("fresh-box");
    
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
                let app = tray.app_handle();
                // 使用安全的窗口切换函数
                if let Err(e) = crate::window_utils::safe_toggle_window(&app, "main") {
                    eprintln!("Failed to toggle window: {}", e);
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                // 安全地清理资源
                if let Ok(state) = app.try_state::<SingboxState>() {
                    crate::singbox::cleanup_process(&state);
                }
                
                // 安全地关闭窗口
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.close();
                }
                
                // 延迟退出以确保清理完成
                std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    std::process::exit(0);
                });
            }
            "show" => {
                if let Err(e) = crate::window_utils::safe_show_window(app, "main") {
                    eprintln!("Failed to show window: {}", e);
                }
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
