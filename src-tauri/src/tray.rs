// tray.rs - 托盘功能模块

use crate::singbox::SingboxState;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

    let tray_builder = TrayIconBuilder::new().menu(&menu).tooltip("fresh-box");
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
                crate::window_utils::run_after_delay(Duration::from_millis(10), move || {
                    if let Err(e) = crate::window_utils::safe_toggle_window(&app, "main") {
                        eprintln!("Failed to toggle window: {}", e);
                    }
                });
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                let app_clone = app.clone();
                crate::window_utils::run_after_delay(Duration::from_millis(0), move || {
                    if let Some(state) = app_clone.try_state::<SingboxState>() {
                        crate::singbox::cleanup_process(&state);
                    }

                    if let Some(window) = app_clone.get_webview_window("main") {
                        let _ = window.close();
                    }

                    crate::window_utils::run_after_delay(Duration::from_millis(200), || {
                        std::process::exit(0);
                    });
                });
            }
            "show" => {
                let app_clone = app.clone();
                crate::window_utils::run_after_delay(Duration::from_millis(10), move || {
                    if let Err(e) = crate::window_utils::safe_show_window(&app_clone, "main") {
                        eprintln!("Failed to show window: {}", e);
                    }
                });
            }

            _ => {}
        })
        .build(app)?;

    Ok(())
}
