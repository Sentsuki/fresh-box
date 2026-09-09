// tray.rs — 托盘迷你控制面板。
//
// 关闭主窗口会销毁 webview，所以托盘是「没有窗口时」用户唯一的操作面。
// 它得能独立完成日常动作：启停 sing-box、切换 rule/global/direct、切换节点。
//
// 数据来源全部是 Rust 自己的常驻订阅（`services::resident`）和
// reconciliation loop 的相位（`services::singbox`），不依赖前端 —— 前端可能
// 根本不存在。菜单在这三个信号任何一个变化时整体重建（见 `spawn_tray_sync`），
// 而不是靠某个命令记得调一次刷新，所以别的客户端切了节点、urltest 组自动
// 改选、实例被 daemon 自己恢复，托盘都会跟上。

use crate::services::resident::{ModeState, ResidentState, TrayGroup};
use crate::services::singbox::SingboxState;
use indexmap::IndexMap;
use std::sync::{Arc, Mutex};
use tauri::{
    AppHandle, Emitter, Manager,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const TRAY_ID: &str = "main-tray";
const MENU_START: &str = "start";
const MENU_STOP: &str = "stop";
const MENU_SHOW: &str = "show";
const MENU_QUIT: &str = "quit";
const PROXY_ITEM_PREFIX: &str = "proxy_";
const MODE_ITEM_PREFIX: &str = "mode_";

/// 菜单项 id → 它代表的动作。菜单每次重建都会重填，所以 id 只在两次重建之间
/// 有效 —— 这没问题：菜单事件必然来自当前那份菜单。
#[derive(Default)]
struct TrayItems {
    /// `proxy_<gi>_<ni>` → (组名, 节点名)
    proxies: IndexMap<String, (String, String)>,
    /// `mode_<i>` → 模式名
    modes: IndexMap<String, String>,
}

pub struct TrayState {
    items: Arc<Mutex<TrayItems>>,
}

/// 画一次托盘菜单所需的全部输入。
struct TrayModel {
    running: bool,
    /// 连接可用时才允许启停 —— 没连上时这两项灰着，比点了没反应清楚。
    connected: bool,
    /// 没有选中的配置就没法启动。
    has_config: bool,
    mode: ModeState,
    groups: Vec<TrayGroup>,
}

fn build_menu(
    app: &AppHandle,
    model: &TrayModel,
    items: &mut TrayItems,
) -> tauri::Result<Menu<tauri::Wry>> {
    items.proxies.clear();
    items.modes.clear();

    let menu = Menu::new(app)?;

    // ── 启停 ──────────────────────────────────────────────────────────
    if model.running {
        menu.append(&MenuItem::with_id(
            app,
            MENU_STOP,
            "Stop sing-box",
            model.connected,
            None::<&str>,
        )?)?;
    } else {
        menu.append(&MenuItem::with_id(
            app,
            MENU_START,
            "Start sing-box",
            model.connected && model.has_config,
            None::<&str>,
        )?)?;
    }

    // ── 模式 ──────────────────────────────────────────────────────────
    // 模式与节点都要求实例在跑（daemon 的 `SetClashMode`/`SelectOutbound` 在
    // 未启动时直接返回 invalid），所以停止状态下整段不画，而不是画出来点了
    // 报错。
    if model.running && !model.mode.available.is_empty() {
        let submenu = Submenu::new(app, "Mode", true)?;
        for (index, mode) in model.mode.available.iter().enumerate() {
            let id = format!("{MODE_ITEM_PREFIX}{index}");
            let checked = mode.eq_ignore_ascii_case(&model.mode.current);
            submenu.append(&CheckMenuItem::with_id(
                app,
                &id,
                mode,
                true,
                checked,
                None::<&str>,
            )?)?;
            items.modes.insert(id, mode.clone());
        }
        menu.append(&submenu)?;
    }

    // ── 节点 ──────────────────────────────────────────────────────────
    for (group_index, group) in model.groups.iter().enumerate() {
        let submenu = Submenu::new(app, &group.tag, true)?;
        for (node_index, node) in group.items.iter().enumerate() {
            let id = format!("{PROXY_ITEM_PREFIX}{group_index}_{node_index}");
            let checked = *node == group.selected;
            submenu.append(&CheckMenuItem::with_id(
                app,
                &id,
                node,
                true,
                checked,
                None::<&str>,
            )?)?;
            items.proxies.insert(id, (group.tag.clone(), node.clone()));
        }
        menu.append(&submenu)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
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

/// 托盘的 tooltip 也承载状态 —— 窗口关着时这是唯一能一眼看到运行状态的地方。
fn tooltip(model: &TrayModel) -> String {
    if !model.connected {
        return "fresh-box — disconnected".to_string();
    }
    if !model.running {
        return "fresh-box — stopped".to_string();
    }
    if model.mode.current.is_empty() {
        "fresh-box — running".to_string()
    } else {
        format!("fresh-box — running ({})", model.mode.current)
    }
}

fn current_model(app: &AppHandle) -> TrayModel {
    let phase = app
        .try_state::<SingboxState>()
        .map(|state| crate::services::singbox::get_daemon_state(state.inner()));
    let connected = matches!(
        phase,
        Some(crate::services::singbox::ConnectionPhase::Connected { .. })
    );
    let running = phase.as_ref().map(|p| p.running()).unwrap_or(false);

    let resident = app.try_state::<Arc<ResidentState>>();
    let (groups, mode) = resident.map(|r| (r.groups(), r.mode())).unwrap_or_default();

    TrayModel {
        running,
        connected,
        has_config: selected_profile(app).is_some(),
        mode,
        groups,
    }
}

fn apply(app: &AppHandle) {
    let model = current_model(app);
    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    let Ok(mut items) = state.items.lock() else {
        return;
    };
    let menu = match build_menu(app, &model, &mut items) {
        Ok(menu) => menu,
        Err(e) => {
            tracing::warn!(error = %e, "failed to build tray menu");
            return;
        }
    };
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Err(e) = tray.set_menu(Some(menu)) {
        tracing::warn!(error = %e, "failed to set tray menu");
    }
    if let Err(e) = tray.set_tooltip(Some(tooltip(&model))) {
        tracing::warn!(error = %e, "failed to set tray tooltip");
    }
}

/// 当前选中的配置档案 id。
///
/// 存的是 id 而不是路径：内容文件按 UUID 命名，路径对调用方没有意义
/// （阶段 4 起）。
fn selected_profile(app: &AppHandle) -> Option<String> {
    let store = app.try_state::<crate::store::Store>()?;
    crate::store::settings::selected_profile(store.inner())
        .ok()
        .flatten()
}

/// 相位、代理组、模式任何一个变了就重建菜单。
///
/// 这取代了原来「每个代理命令记得调一次 `sync_tray_from_overview`」的做法：
/// 那种方式只覆盖 fresh-box 自己发起的改动，别的客户端切了节点、urltest 组
/// 自动改选、daemon 重启后自行恢复实例，托盘都会停在旧状态。
pub fn spawn_tray_sync(app: AppHandle, singbox: SingboxState, resident: Arc<ResidentState>) {
    tauri::async_runtime::spawn(async move {
        let mut phase_rx = crate::services::singbox::subscribe(&singbox);
        let mut groups_rx = resident.subscribe_groups();
        let mut mode_rx = resident.subscribe_mode();

        apply(&app);
        loop {
            tokio::select! {
                result = phase_rx.changed() => if result.is_err() { return },
                result = groups_rx.changed() => if result.is_err() { return },
                result = mode_rx.changed() => if result.is_err() { return },
            }
            apply(&app);
        }
    });
}

// ── 菜单动作 ────────────────────────────────────────────────────────────────

fn handle_start(app: &AppHandle) {
    let Some(profile_id) = selected_profile(app) else {
        tracing::warn!("tray: start requested with no selected profile");
        return;
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let (Some(state), Some(store)) = (
            app.try_state::<SingboxState>(),
            app.try_state::<crate::store::Store>(),
        ) else {
            return;
        };
        if let Err(e) =
            crate::services::singbox::start_with_profile(state.inner(), store.inner(), &profile_id)
                .await
        {
            tracing::warn!(error = %e, "tray: failed to start sing-box");
        }
    });
}

fn handle_stop(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<SingboxState>() else {
            return;
        };
        if let Err(e) = crate::services::singbox::stop(state.inner()).await {
            tracing::warn!(error = %e, "tray: failed to stop sing-box");
        }
    });
}

fn handle_set_mode(app: &AppHandle, mode: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<SingboxState>() else {
            return;
        };
        let connection = match crate::services::singbox::get_connection(state.inner()).await {
            Ok(connection) => connection,
            Err(e) => {
                tracing::warn!(error = %e, "tray: failed to switch mode");
                return;
            }
        };
        if let Err(e) = connection.set_clash_mode(mode).await {
            tracing::warn!(error = %e, "tray: failed to switch mode");
            return;
        }
        // 勾选状态不在这里改 —— `SubscribeClashMode` 会把新模式推回来，
        // `spawn_tray_sync` 据此重建菜单。让 daemon 当唯一真相源，托盘就不会
        // 出现「点了但实际没生效却已经打上勾」的情况。
        let _ = app.emit("tray-proxy-switched", ());
    });
}

fn handle_select_proxy(app: &AppHandle, group: String, node: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<SingboxState>() else {
            return;
        };
        let connection = match crate::services::singbox::get_connection(state.inner()).await {
            Ok(connection) => connection,
            Err(e) => {
                tracing::warn!(error = %e, "tray: failed to switch proxy");
                return;
            }
        };

        if let Err(e) = connection
            .select_outbound(group.clone(), node.clone())
            .await
        {
            tracing::warn!(error = %e, "tray: failed to switch proxy");
            return;
        }

        let auto_close = app
            .state::<crate::config::app_settings::BackendPrefsState>()
            .get()
            .auto_close_connections;
        if auto_close {
            crate::services::resident::close_connections_by_group(&connection, &group).await;
        }

        // 同上：勾选状态由 `SubscribeGroups` 推回来驱动，不在这里手动改。
        // 前端若还活着，让它刷新自己那份代理页数据。
        let _ = app.emit("tray-proxy-switched", ());
    });
}

fn handle_quit(app: &AppHandle) {
    crate::window_utils::allow_exit();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(state) = app.try_state::<SingboxState>() {
            // 先停 reconciliation loop 再断连接，否则它会立刻转身重连
            // （见它的文档注释）。
            crate::services::singbox::stop_reconciliation_loop(&state);
            crate::services::singbox::cleanup_process(&state).await;
        }
        // 顺手把共享 worker 也收掉，而不是留给 kill-on-close job object：
        // 上面两步本来就都有超时上限，没有什么需要再 sleep 等待的。
        crate::daemon::worker::shared_worker().recycle().await;
        app.exit(0);
    });
}

pub fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let items = Arc::new(Mutex::new(TrayItems::default()));
    let items_for_event = items.clone();

    // 初始菜单：还没连上，只有 Start（灰）/ Show / Quit。连上之后
    // `spawn_tray_sync` 立刻会重建一次。
    let initial = build_menu(
        app.handle(),
        &TrayModel {
            running: false,
            connected: false,
            has_config: false,
            mode: ModeState::default(),
            groups: Vec::new(),
        },
        &mut items.lock().expect("fresh mutex is never poisoned"),
    )?;

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&initial)
        .show_menu_on_left_click(false)
        .tooltip("fresh-box");

    let builder = if let Some(icon) = app.default_window_icon() {
        builder.icon(icon.clone())
    } else {
        tracing::warn!("no default window icon found for tray");
        builder
    };

    builder
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

            if let Some(pair) = id
                .starts_with(PROXY_ITEM_PREFIX)
                .then(|| {
                    items_for_event
                        .lock()
                        .ok()
                        .and_then(|items| items.proxies.get(id).cloned())
                })
                .flatten()
            {
                handle_select_proxy(app, pair.0, pair.1);
                return;
            }

            if let Some(mode) = id
                .starts_with(MODE_ITEM_PREFIX)
                .then(|| {
                    items_for_event
                        .lock()
                        .ok()
                        .and_then(|items| items.modes.get(id).cloned())
                })
                .flatten()
            {
                handle_set_mode(app, mode);
                return;
            }

            match id {
                MENU_START => handle_start(app),
                MENU_STOP => handle_stop(app),
                MENU_SHOW => crate::window_utils::show_or_create_main_window(app),
                MENU_QUIT => handle_quit(app),
                _ => {}
            }
        })
        .build(app)?;

    app.manage(TrayState { items });

    Ok(())
}
