// ipc.rs —— IPC 边界的装配。
//
// 两套处理器，按命令名分派：
//
//   host 域   走 `tauri-specta`：命令签名和类型一起生成到 `src/gen/host.ts`，
//             前端不再手抄 —— 这是 `types/app.ts` 那份手写镜像的终点。
//   daemon 域 走原生 `generate_handler!`。它们的签名用了 `ipc::Response` 和
//             `Channel<InvokeResponseBody>`：specta 描述不了这两个类型，而换成
//             能描述的（比如 `Vec<u8>`）会让载荷退回 JSON 数字数组，毁掉阶段
//             2/3 建立的二进制透传路径。宁可让这三个留在类型护栏之外 —— 它们
//             只有三个，而且不携带任何业务类型（service 名、method 名、一坨
//             字节），漂移风险本来就最小。
//
// 绑定由 `tests/bindings.rs` 生成，不是应用启动时 —— 那样 `cargo test` 就能
// 发现「Rust 改了但没重新生成」，也不需要为了拿一份类型去跑 GUI。

use crate::commands;

/// 把 host 域的命令签名与类型导出成 `src/gen/host.ts`。
///
/// 在一条大栈的线程上跑：specta 的类型导出是递归的，`AppSettings` 那种嵌套
/// 结构在 Windows 默认 1 MB 的主线程栈上会直接溢出。
pub fn export_bindings(path: &str) -> Result<(), String> {
    let path = path.to_string();
    std::thread::Builder::new()
        .stack_size(16 * 1024 * 1024)
        .spawn(move || {
            specta_builder::<tauri::test::MockRuntime>()
                .export(specta_typescript::Typescript::default(), &path)
                .map_err(|e| e.to_string())
        })
        .map_err(|e| e.to_string())?
        .join()
        .map_err(|_| "binding export thread panicked".to_string())?
}

/// host 域的 specta builder。`main.rs` 用它装 invoke handler，
/// `tests/bindings.rs` 用它导出 TypeScript —— 两边必须是同一个定义，否则生成的
/// 绑定和真正注册的命令会悄悄对不上。
///
/// 对 runtime 泛型：导出绑定只需要命令的**签名**，不需要真能跑一个窗口。
/// 测试用 `tauri::test::MockRuntime` 实例化，就不会把 wry 链进测试二进制 ——
/// 否则它加载时要找 WebView2，在没有图形环境的地方直接
/// `STATUS_ENTRYPOINT_NOT_FOUND`。这也是 `commands::app` 那几个命令写成
/// `<R: Runtime>` 的原因。
pub fn specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        // 带 `::<tauri::Wry>` 的那几个是对 runtime 泛型的命令。
        // `collect_commands!` 把泛型参数交给 specta（它只读签名，R 不出现在
        // 导出的类型里），同时把它从 `generate_handler!` 那一半**剥掉** ——
        // 所以 tauri 侧仍然是泛型的，跟着 builder 的 R 走。
        //
        // 这里必须写具体类型而不是 `R`：specta 的宏会生成一个嵌套的
        // `fn export<...>`，嵌套项用不到外层函数的泛型参数。
        .commands(tauri_specta::collect_commands![
            commands::singbox::start_singbox,
            commands::singbox::stop_singbox,
            commands::singbox::get_daemon_state,
            commands::singbox::retry_daemon_connection,
            commands::singbox::take_over_daemon,
            commands::singbox::is_daemon_service_installed,
            commands::singbox::install_daemon_service,
            commands::singbox::uninstall_daemon_service,
            commands::singbox::repair_daemon_service,
            commands::app::is_autostart_enabled::<tauri::Wry>,
            commands::app::enable_autostart::<tauri::Wry>,
            commands::app::disable_autostart::<tauri::Wry>,
            commands::config::list_profiles,
            commands::config::import_profile_file,
            commands::config::delete_profile,
            commands::config::rename_profile,
            commands::config::edit_subscription_url,
            commands::config::set_subscription_auto_update,
            commands::config::open_config_file,
            commands::config::open_app_directory,
            commands::config::load_app_settings,
            commands::config::save_app_settings,
            commands::config_override::enable_config_override,
            commands::config_override::disable_config_override,
            commands::config_override::save_config_override,
            commands::config_override::clear_config_override,
            commands::config_override::load_config_override,
            commands::config_override::is_config_override_enabled,
            commands::priority::save_priority_config,
            commands::priority::load_priority_config,
            commands::priority::check_config_fields,
            commands::diagnostics::record_frontend_error,
            commands::app::update_mica_theme::<tauri::Wry>,
            commands::config::add_subscription,
            commands::config::update_subscription,
            commands::reports::list_crash_reports_all,
            commands::reports::read_crash_report,
            commands::reports::delete_crash_report,
            commands::reports::delete_all_crash_reports,
            commands::reports::list_oom_reports,
            commands::reports::read_oom_report,
            commands::reports::delete_oom_report,
            commands::reports::delete_all_oom_reports,
            commands::reports::list_power_reports,
            commands::reports::read_power_report,
            commands::reports::delete_power_report,
            commands::reports::delete_all_power_reports,
        ])
        // 相位类型不出现在任何命令签名里（它通过事件推送给前端），得单独导出。
        .typ::<crate::services::singbox::ConnectionPhase>()
        // 抛异常而不是返回 `{status:"ok"|"error"}` 联合：整个前端已经是
        // try/catch 的写法（`invokeCommand` 一直这么包），换成 Result 风格要
        // 改每一个调用点，而收益只是换个错误表达方式。`CommandError` 的
        // 判别式联合仍然会导出，`getErrorKind` 照样能按 `kind` 分支。
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
}

/// 装好的 invoke handler：host 域走 specta，`daemon_*` 走原生 handler。
pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    // rc.25 的 `invoke_handler(&self)` 返回 `impl ... + 'static`，但在 edition
    // 2024 的 RPIT 捕获规则下它仍然捕获了 `&self` 的生命周期（编译器提示的
    // "overcapturing"，要上游加 `+ use<R>` 才能修）。所以 builder 必须活得和
    // 返回的闭包一样久 —— 它本来就是一份进程级、只读的描述，放进 `OnceLock`
    // 名副其实，不是为了绕编译器硬造的全局。
    static BUILDER: std::sync::OnceLock<tauri_specta::Builder<tauri::Wry>> =
        std::sync::OnceLock::new();
    let specta_handler = BUILDER
        .get_or_init(specta_builder::<tauri::Wry>)
        .invoke_handler();
    #[allow(clippy::type_complexity)]
    let bridge_handler: Box<dyn Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync> =
        Box::new(tauri::generate_handler![
            commands::bridge::daemon_unary,
            commands::bridge::daemon_stream,
            commands::bridge::daemon_cancel,
        ]);

    move |invoke| {
        if invoke.message.command().starts_with("daemon_") {
            bridge_handler(invoke)
        } else {
            specta_handler(invoke)
        }
    }
}
