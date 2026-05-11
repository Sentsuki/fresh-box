// tray.rs - 托盘功能模块

use crate::clash_api::select_proxy_inner;
use crate::errors::CommandError;
use crate::singbox::SingboxState;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

#[derive(Debug, Deserialize, Clone)]
pub struct TrayProxyGroup {
    pub name: String,
    pub current: String,
    pub nodes: Vec<String>,
}

pub struct TrayProxyState {
    pub proxy_item_map: Arc<Mutex<HashMap<String, (String, String)>>>,
}

fn build_tray_menu(
    app: &AppHandle,
    proxy_groups: &[TrayProxyGroup],
    proxy_item_map: &mut HashMap<String, (String, String)>,
) -> tauri::Result<Menu<tauri::Wry>> {
    proxy_item_map.clear();
    let menu = Menu::new(app)?;

    for (gi, group) in proxy_groups.iter().enumerate() {
        let submenu = Submenu::new(app, &group.name, true)?;
        for (ni, node) in group.nodes.iter().enumerate() {
            let item_id = format!("proxy_{}_{}", gi, ni);
            let checked = *node == group.current;
            let item = CheckMenuItem::with_id(app, &item_id, node, true, checked, None::<&str>)?;
            submenu.append(&item)?;
            proxy_item_map.insert(item_id, (group.name.clone(), node.clone()));
        }
        menu.append(&submenu)?;
    }

    if !proxy_groups.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    menu.append(&show_i)?;
    menu.append(&quit_i)?;

    Ok(menu)
}

pub async fn refresh_tray_proxy_menu(
    app_handle: AppHandle,
    state: State<'_, TrayProxyState>,
    proxy_groups: Vec<TrayProxyGroup>,
) -> Result<(), CommandError> {
    let new_menu = {
        let mut map = state
            .proxy_item_map
            .lock()
            .map_err(|_| CommandError::invalid_state("tray", "Failed to lock proxy item map"))?;
        build_tray_menu(&app_handle, &proxy_groups, &mut map).map_err(|e| {
            CommandError::invalid_state("tray", format!("Failed to build menu: {}", e))
        })?
    };

    if let Some(tray) = app_handle.tray_by_id("main-tray") {
        tray.set_menu(Some(new_menu)).map_err(|e| {
            CommandError::invalid_state("tray", format!("Failed to set menu: {}", e))
        })?;
    }

    Ok(())
}

pub(crate) fn sync_tray_from_overview(app: &AppHandle, overview: &crate::clash_api::ClashOverview) {
    let selector_groups: Vec<TrayProxyGroup> = overview
        .proxy_groups
        .iter()
        .filter(|g| g.kind.to_lowercase() == "selector")
        .map(|g| TrayProxyGroup {
            name: g.name.clone(),
            current: g.current.clone(),
            nodes: g.options.iter().map(|n| n.name.clone()).collect(),
        })
        .collect();

    if let Some(state) = app.try_state::<TrayProxyState>() {
        let new_menu = {
            let mut map = match state.proxy_item_map.lock() {
                Ok(m) => m,
                Err(_) => return,
            };
            match build_tray_menu(app, &selector_groups, &mut map) {
                Ok(menu) => menu,
                Err(_) => return,
            }
        };
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_menu(Some(new_menu));
        }
    }
}

pub fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let proxy_item_map: Arc<Mutex<HashMap<String, (String, String)>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let proxy_map_for_event = proxy_item_map.clone();

    let initial_menu = {
        let menu = Menu::new(app)?;
        let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
        let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        menu.append(&show_i)?;
        menu.append(&quit_i)?;
        menu
    };

    let tray_builder = TrayIconBuilder::with_id("main-tray")
        .menu(&initial_menu)
        .tooltip("fresh-box");

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
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();

            if id.starts_with("proxy_") {
                let proxy_id = id.to_string();
                let pair = proxy_map_for_event
                    .lock()
                    .ok()
                    .and_then(|map| map.get(&proxy_id).cloned());

                if let Some((group, node)) = pair {
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = select_proxy_inner(&group, &node).await {
                            eprintln!("Failed to switch proxy from tray: {}", e);
                            return;
                        }
                        // Notify the frontend to refresh its state and sync the tray menu.
                        // The frontend (clashStore.syncTrayMenu) is the single source of truth
                        // for tray menu state, so we don't rebuild it here.
                        let _ = app_clone.emit("tray-proxy-switched", ());
                    });
                }
                return;
            }

            match id {
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
            }
        })
        .build(app)?;

    app.manage(TrayProxyState { proxy_item_map });

    Ok(())
}

