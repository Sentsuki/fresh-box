// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod crash_reports;
mod daemon;
mod errors;
mod ipc;
mod logger;
mod services;
mod store;
mod tray;
mod window_state;
mod window_utils;

use services::singbox::{SingboxState, retry_connection, spawn_reconciliation_loop};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;

/// Passed to a launch registered via `enable_autostart` (see
/// `commands::app`) so a login-triggered launch can be told apart from a
/// normal one — checked in `setup()` to start hidden in the tray instead of
/// showing the main window, mirroring the official client's
/// `wasOpenedAtLogin()` (`loginItem.ts`) handling in `index.ts`.
const AUTOSTART_ARG: &str = "--autostart";

fn main() {
    // `--export-bindings <path>`：只生成前端的 host 域绑定然后退出，不起窗口。
    //
    // 为什么不做成 `cargo test`：导出要走 `collect_commands!`，它把整个 wry
    // 运行时链进调用它的二进制；集成测试的测试二进制这么一链，启动时就
    // `STATUS_ENTRYPOINT_NOT_FOUND`（缺的不是 WebView2Loader，试过了）。而应用
    // 自己本来就带着能正常加载的那套依赖，所以让它顺带干这件事最省事。
    //
    //     pnpm gen:host      # package.json 里包好了
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() == Some("--export-bindings") {
        let path = args
            .next()
            .unwrap_or_else(|| "../src/gen/host.ts".to_string());
        match ipc::export_bindings(&path) {
            Ok(()) => {
                println!("exported host bindings to {path}");
                return;
            }
            Err(e) => {
                eprintln!("failed to export host bindings: {e}");
                std::process::exit(1);
            }
        }
    }

    logger::init_tracing();
    logger::install_panic_hook();

    let singbox_state = SingboxState::new();

    // 数据库要在其他一切之前打开：BackendPrefsState 从它加载，命令也都要用它。
    // 打不开就没法继续 —— 这是持久化层，带着一个不可用的 store 跑起来只会在
    // 每个操作上报错，不如在这里说清楚。
    let store = match store::Store::open() {
        Ok(store) => store,
        Err(e) => {
            tracing::error!(error = %e, "failed to open the fresh-box database");
            std::process::exit(1);
        }
    };
    let backend_prefs = config::app_settings::BackendPrefsState::load(&store);

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        // App self-update — see `tauri.conf.json`'s `plugins.updater` for
        // the signing key/endpoint, and `docs/updater-releasing.md` for how
        // a release actually gets signed. Nothing else (no
        // `tauri-plugin-process`) needed alongside it — see this plugin's
        // Cargo.toml entry for why.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(singbox_state)
        .manage(daemon::bridge::registry::StreamRegistry::new())
        .manage(std::sync::Arc::new(services::resident::ResidentState::new()))
        .manage(store)
        .manage(backend_prefs)
        .invoke_handler(ipc::invoke_handler())
        .setup(|app| {
            tray::setup_system_tray(app)?;

            let window = app.get_webview_window("main").unwrap();

            // Restore the last saved position/size/maximized state before
            // the window is ever shown — it's created with `"visible":
            // false` in tauri.conf.json specifically so this can't be seen
            // jumping from the default bounds to the restored ones.
            //
            // 建窗过程中产生的 Resized/Moved 事件带的是默认尺寸，挡住它们，
            // 否则可能抢在 `restore` 前面把存储里的尺寸冲成默认值。
            {
                let _persist_guard = window_state::suspend_persist();
                window_state::restore(&window);
            }

            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_mica;
                let _ = apply_mica(&window, None);
            }

            // A launch registered via `enable_autostart` (see
            // `commands::app`) passes `AUTOSTART_ARG` — start hidden in the
            // tray in that case rather than popping the main window up
            // unasked-for on every login, mirroring the official client's
            // `wasOpenedAtLogin()` handling.
            if !std::env::args().any(|arg| arg == AUTOSTART_ARG) {
                let _ = window.show();
            }

            let state = app.state::<SingboxState>();
            spawn_reconciliation_loop(app.handle().clone(), state.inner().clone());
            commands::config::spawn_auto_update_scheduler(app.handle().clone());
            // 窗口几何的周期性落盘 —— 事件路径只往内存里记，见
            // `window_state` 里「捕获与落盘的分离」。
            window_state::spawn_persist_flusher(app.handle().clone());

            // 关闭窗口会销毁 webview，所以这两件事必须由 Rust 拥有：状态变化
            // 的系统通知（原来在前端，销毁模式下等于不存在），以及托盘菜单的
            // 持续同步。见 `services::resident` 的模块注释。
            let resident = app
                .state::<std::sync::Arc<services::resident::ResidentState>>()
                .inner()
                .clone();
            services::resident::spawn_notifier(app.handle().clone(), state.inner().clone());
            tray::spawn_tray_sync(app.handle().clone(), state.inner().clone(), resident);

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                // 只记进内存，不落盘 —— 这两条事件在拖动时每秒来几十条，
                // 而这个处理器跑在主消息循环线程上。见 `window_state` 里
                // 「捕获与落盘的分离」那段。
                window_state::capture(window);
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // 始终阻止默认关闭行为，由我们决定后续动作
                api.prevent_close();

                // Bounds/position may have changed since the last
                // `Resized`/`Moved` event fired (or this could be the very
                // first user interaction with the window at all) — capture
                // once more right before it goes away instead of relying
                // solely on those two events to have already caught it,
                // and flush immediately rather than waiting out the
                // periodic tick: the window is about to be destroyed.
                window_state::capture(window);
                window_state::flush(window.app_handle());

                // 通知前端窗口即将不可见，触发流暂停与缓存清理
                let _ = window.emit("window-visibility-changed", false);

                // 关窗一律**销毁** webview，没有「隐藏到托盘」那个选项了。
                //
                // 以前两种行为并存，是因为托盘和通知都依赖前端还活着：窗口一
                // 销毁，托盘菜单就再也不更新、sing-box 崩了也不会有通知，于是
                // 只能让用户在「省内存」和「托盘可用」之间自己选一个。
                //
                // 现在这两件事都在 Rust 常驻（`services::resident` 订阅代理组
                // 与 Clash 模式，`spawn_notifier` 发通知），窗口在不在都一样，
                // 那个取舍就不存在了 —— 隐藏模式只剩「白留着一个 WebView2
                // 进程」这一个效果，所以直接去掉。
                window_utils::set_keep_alive(true);
                if let Err(e) = window.destroy() {
                    tracing::error!(error = %e, "failed to destroy window");
                    window_utils::set_keep_alive(false);
                }
            }
            tauri::WindowEvent::Focused(true) => {
                // Cut short any backoff the reconciliation loop is
                // currently sitting out, rather than waiting up to 5s to
                // notice e.g. a daemon that only just finished starting up
                // — see `retry_connection`'s doc comment.
                let app = window.app_handle();
                if let Some(state) = app.try_state::<SingboxState>() {
                    retry_connection(&state);
                }
            }
            tauri::WindowEvent::Destroyed => {
                // 销毁模式下每次关闭窗口都会走到这里，所以这是流回收的主路径
                // 而不是边角情况：漏收一次，daemon 那边就多留一条永远没人读的
                // 订阅。见 `daemon::bridge::registry` 的模块注释。
                if let Some(registry) = window
                    .app_handle()
                    .try_state::<daemon::bridge::registry::StreamRegistry>()
                {
                    let cancelled = registry.cancel_window(window.label());
                    if cancelled > 0 {
                        // info 而不是 debug：每关一次窗口一行，而 `remaining`
                        // 正是流泄漏的观测指标 —— 这是出问题时第一个想看的东西，
                        // 不该藏在需要 RUST_LOG=debug 才出现的地方。
                        tracing::info!(
                            label = window.label(),
                            cancelled,
                            remaining = registry.active_count(),
                            "cancelled daemon streams owned by a destroyed window"
                        );
                    }
                }
            }
            _ => {}
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            tracing::info!(?argv, ?cwd, "second instance launched");
            let app_clone = app.clone();
            window_utils::show_or_create_main_window(&app_clone);
        }))
        .build(tauri::generate_context!())
        .unwrap_or_else(|err| {
            tracing::error!(error = %err, "failed to build fresh-box");
            std::process::exit(1);
        })
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // destroy 模式下窗口被销毁后阻止应用退出，保持托盘存活
                if window_utils::should_prevent_exit() {
                    tracing::debug!("window destroyed, keeping tray and background tasks alive");
                    api.prevent_exit();
                }
            }
        });
}
