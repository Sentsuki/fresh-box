// tray.rs - 托盘功能模块

use crate::singbox::SingboxState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

// 从托盘打开 Panel
async fn open_panel_from_tray() -> Result<(), String> {
    // 获取 override 配置
    let override_config = crate::config_override::get_override_config_if_enabled()
        .await
        .map_err(|e| format!("Failed to get override config: {:?}", e))?;

    let config = match override_config {
        Some(cfg) => cfg,
        None => {
            return Err("Config override is not enabled".to_string());
        }
    };

    // 从 override 配置中提取 clash_api 信息
    let external_controller = config
        .get("experimental")
        .and_then(|exp| exp.get("clash_api"))
        .and_then(|clash| clash.get("external_controller"))
        .and_then(|ctrl| ctrl.as_str());

    let external_ui = config
        .get("experimental")
        .and_then(|exp| exp.get("clash_api"))
        .and_then(|clash| clash.get("external_ui"))
        .and_then(|ui| ui.as_str());

    // 如果两者都存在，构建 URL
    if let (Some(controller), Some(ui)) = (external_controller, external_ui) {
        // 确保 UI 路径以 / 开头
        let ui_path = if ui.starts_with('/') {
            ui.to_string()
        } else {
            format!("/{}", ui)
        };

        // 构建完整的 URL
        let url = format!("http://{}{}/", controller, ui_path);

        crate::config::open_url(url)
            .await
            .map_err(|e| format!("Failed to open URL: {:?}", e))?;
        Ok(())
    } else {
        Err("Clash API not configured in override config".to_string())
    }
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
