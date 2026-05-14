// tray.rs - 托盘功能模块

use crate::errors::CommandError;
use crate::services::clash_client::select_proxy_inner;
use crate::services::singbox::SingboxState;
use indexmap::IndexMap;
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Manager, State,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const TRAY_ID: &str = "main-tray";
const MENU_SHOW: &str = "show";
const MENU_QUIT: &str = "quit";
const PROXY_ITEM_PREFIX: &str = "proxy_";

#[derive(Debug, Deserialize, Clone)]
pub struct TrayProxyGroup {
    pub name: String,
    pub current: String,
    pub nodes: Vec<String>,
}

pub struct TrayProxyState {
    pub proxy_item_map: Arc<Mutex<IndexMap<String, (String, String)>>>,
}

fn build_tray_menu(
    app: &AppHandle,
    proxy_groups: &[TrayProxyGroup],
    proxy_item_map: &mut IndexMap<String, (String, String)>,
) -> tauri::Result<Menu<tauri::Wry>> {
    proxy_item_map.clear();
    let menu = Menu::new(app)?;

    for (gi, group) in proxy_groups.iter().enumerate() {
        let submenu = Submenu::new(app, &group.name, true)?;
        for (ni, node) in group.nodes.iter().enumerate() {
            let item_id = format!("{}{gi}_{ni}", PROXY_ITEM_PREFIX);
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

    menu.append(&MenuItem::with_id(
        app,
        MENU_SHOW,
        "Show",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        MENU_QUIT,
        "Quit",
        true,
        None::<&str>,
    )?)?;

    Ok(menu)
}

/// 重建托盘菜单并立即应用到托盘图标
fn apply_tray_menu(
    app: &AppHandle,
    proxy_groups: &[TrayProxyGroup],
    map: &mut IndexMap<String, (String, String)>,
) -> Result<(), String> {
    let menu = build_tray_menu(app, proxy_groups, map)
        .map_err(|e| format!("Failed to build tray menu: {}", e))?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))
            .map_err(|e| format!("Failed to set tray menu: {}", e))?;
    }
    Ok(())
}

pub async fn refresh_tray_proxy_menu(
    app_handle: AppHandle,
    state: State<'_, TrayProxyState>,
    proxy_groups: Vec<TrayProxyGroup>,
) -> Result<(), CommandError> {
    let mut map = state
        .proxy_item_map
        .lock()
        .map_err(|_| CommandError::invalid_state("tray", "Failed to lock proxy item map"))?;
    apply_tray_menu(&app_handle, &proxy_groups, &mut map)
        .map_err(|e| CommandError::invalid_state("tray", e))
}

pub(crate) fn sync_tray_from_overview(
    app: &AppHandle,
    overview: &crate::services::clash_client::ClashOverview,
) {
    let selector_groups: Vec<TrayProxyGroup> = overview
        .proxy_groups
        .iter()
        .filter(|g| {
            let kind = g.kind.to_lowercase();
            kind == "selector" || kind == "urltest"
        })
        .map(|g| TrayProxyGroup {
            name: g.name.clone(),
            current: g.current.clone(),
            nodes: g.options.iter().map(|n| n.name.clone()).collect(),
        })
        .collect();

    if let Some(state) = app.try_state::<TrayProxyState>()
        && let Ok(mut map) = state.proxy_item_map.lock()
        && let Err(e) = apply_tray_menu(app, &selector_groups, &mut map)
    {
        eprintln!("Failed to sync tray menu: {}", e);
    }
}

pub fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let proxy_item_map: Arc<Mutex<IndexMap<String, (String, String)>>> =
        Arc::new(Mutex::new(IndexMap::new()));
    let proxy_map_for_event = proxy_item_map.clone();

    // 初始菜单复用 build_tray_menu（无代理节点时仅含 Show / Quit）
    let initial_menu = build_tray_menu(app.handle(), &[], &mut IndexMap::new())?;

    let tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&initial_menu)
        .show_menu_on_left_click(false)
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
                crate::window_utils::show_or_create_main_window(tray.app_handle());
            }
        })
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();

            if id.starts_with(PROXY_ITEM_PREFIX) {
                let pair = proxy_map_for_event
                    .lock()
                    .ok()
                    .and_then(|map| map.get(id).cloned());

                if let Some((group, node)) = pair {
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = select_proxy_inner(&group, &node).await {
                            eprintln!("Failed to switch proxy from tray: {}", e);
                            return;
                        }
                        // 无论前端是否存活，后端都主动获取最新状态并更新托盘菜单
                        // 防止窗口销毁后菜单项多选的问题
                        if let Ok(overview) =
                            crate::services::clash_client::fetch_clash_overview_inner().await
                        {
                            sync_tray_from_overview(&app_clone, &overview);
                        }

                        // 依然通知前端（如果前端活着的话，它会刷新页面上的显示）
                        let _ = app_clone.emit("tray-proxy-switched", ());
                    });
                }
                return;
            }

            match id {
                MENU_QUIT => {
                    crate::window_utils::allow_exit();
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(state) = app_clone.try_state::<SingboxState>() {
                            crate::services::singbox::cleanup_process(&state);
                        }
                        tokio::time::sleep(Duration::from_millis(200)).await;
                        app_clone.exit(0);
                    });
                }
                MENU_SHOW => {
                    crate::window_utils::show_or_create_main_window(app);
                }
                _ => {}
            }
        })
        .build(app)?;

    app.manage(TrayProxyState { proxy_item_map });

    Ok(())
}
