// 配置档案与设置的命令。
//
// 阶段 4 之后这个文件短了一大截（约 771 → 现在这些），因为整整两类代码没有
// 存在理由了：
//
//   * **路径安全**（`resolve_safe_path`、`normalize_path`、
//     `strip_verbatim_prefix`、`sanitize_filename_component`、
//     `is_reserved_device_name`）—— 内容文件按 UUID 命名，文件名不再由用户
//     输入或订阅 URL 派生，也就没有可以被穿越的路径。用户起的名字只是数据库
//     里的一个字符串。
//   * **索引与磁盘对账**（`with_index` 那一整套）—— 只有一份真相了。
//
// 剩下的是真正的应用逻辑：抓订阅（有大小上限、落盘前必须过真正的 sing-box
// 解析器）、增删改、自动更新调度。

use crate::config::AppSettings;
use crate::errors::CommandError;
use crate::store::{Store, profiles, settings};
use futures_util::StreamExt;
use std::sync::OnceLock;
use tauri::{Manager, State};

// ── 订阅抓取用的共享 HTTP 客户端 ────────────────────────────────────────────

static SUBSCRIPTION_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn subscription_client() -> &'static reqwest::Client {
    SUBSCRIPTION_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("fresh-box")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to initialize the subscription HTTP client")
    })
}

/// 对齐官方客户端的 `MAXIMUM_REMOTE_PROFILE_BYTES`（`src/main/profiles.ts`）：
/// 限制一次订阅响应能撑大多少内存 / 占多少磁盘，免得一个恶意或被攻陷的订阅
/// 服务器把内存吃光或把盘写满。
const MAX_SUBSCRIPTION_BYTES: usize = 16 * 1024 * 1024;

/// 以 UTF-8 读取响应体，超过 `max_bytes`（或声明的 `Content-Length` 超过）就
/// 拒绝。用 `bytes_stream()` 增量读而不是 `.text()`：没有 `Content-Length` 的
/// 分块响应不该等到全部缓冲完才发现它太大。
async fn read_limited_response(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<String, CommandError> {
    if let Some(len) = response.content_length()
        && len > max_bytes as u64
    {
        return Err(CommandError::validation(format!(
            "Subscription response is too large ({len} bytes, limit is {max_bytes})"
        )));
    }

    let mut stream = response.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            CommandError::network(format!("Failed to read subscription content: {e}"))
        })?;
        buf.extend_from_slice(&chunk);
        if buf.len() > max_bytes {
            return Err(CommandError::validation(format!(
                "Subscription response is too large (limit is {max_bytes} bytes)"
            )));
        }
    }

    String::from_utf8(buf).map_err(|e| {
        CommandError::validation(format!("Subscription response is not valid UTF-8: {e}"))
    })
}

/// 从订阅 URL 派生一个**显示名**。
///
/// 注意这只是显示名，不再是文件名也不再是主键 —— 所以不需要清洗路径分隔符、
/// 不需要躲 Windows 保留设备名、也不需要担心它和别的档案撞名（撞了由
/// `store::profiles::unique_name` 自动加后缀）。这三件事以前都要做，因为
/// 这个字符串会直接变成磁盘上的文件名（审计项 H-03 的根因）。
fn display_name_from_url(url: &str) -> String {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let last = path.rsplit(['/', '\\']).next().unwrap_or("");
    let stem = last.strip_suffix(".json").unwrap_or(last).trim();
    if stem.is_empty() {
        "subscription".to_string()
    } else {
        stem.chars().take(150).collect()
    }
}

fn validate_profile_name(name: &str) -> Result<(), CommandError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(CommandError::validation("Profile name cannot be empty"));
    }
    if trimmed.len() > 150 {
        return Err(CommandError::validation("Profile name is too long"));
    }
    Ok(())
}

/// 用系统默认程序打开路径 / URL —— 等价于在资源管理器里双击。
///
/// 直接调 `ShellExecuteW` 而不是 `cmd /C start "" <path>`：cmd.exe 会重新解析
/// 它拿到的命令行，`&`、`|`、`^` 这些字符即使是通过 argv 传进去的也仍然对它有
/// 意义（CVE-2024-24576 那一类问题的根源）。`ShellExecuteW` 把整个值原样交给
/// shell，没有命令行语法参与，内容再怎么古怪也不会被重新解读。
fn open_with_system(path: &str) -> Result<(), CommandError> {
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::{HSTRING, w};

    let target = HSTRING::from(path);
    // SAFETY: 每个参数要么是 `None`/`'static` 宽字符串字面量，要么是活到调用
    // 结束的 `HSTRING`；`ShellExecuteW` 调用后不保留其中任何一个。
    let result = unsafe { ShellExecuteW(None, w!("open"), &target, None, None, SW_SHOWNORMAL) };

    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err(CommandError::resource_not_found(
            "path",
            format!(
                "failed to open '{path}' (ShellExecuteW error code {})",
                result.0 as isize
            ),
        ))
    }
}

// ── 设置 ────────────────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub async fn open_app_directory() -> Result<(), CommandError> {
    open_with_system(&crate::config::get_app_data_root()?.to_string_lossy())
}

#[tauri::command]
#[specta::specta]
pub async fn load_app_settings(store: State<'_, Store>) -> Result<AppSettings, CommandError> {
    store
        .run_blocking(crate::config::app_settings::load_app_settings)
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn save_app_settings(
    store: State<'_, Store>,
    backend_prefs: State<'_, crate::config::app_settings::BackendPrefsState>,
    settings: AppSettings,
) -> Result<(), CommandError> {
    // 先更新后端自己那份缓存再落盘：这次调用一返回，`CloseRequested` 或切换
    // 节点的处理器就可能读它，不能让它们看到旧值。这一步只动内存，不碰库
    // （behavior 那一行由下面的 `save_app_settings` 一并写），所以留在这里
    // 不会把主线程按住。
    backend_prefs.cache(settings.settings.clone());
    store
        .run_blocking(move |store| crate::config::app_settings::save_app_settings(store, &settings))
        .await
}

// ── 档案列表 ────────────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub async fn list_profiles(
    store: State<'_, Store>,
) -> Result<Vec<profiles::Profile>, CommandError> {
    store.run_blocking(profiles::list).await
}

/// 增 / 导入 / 刷新单个档案的统一返回：`entry` 是这一个，`profiles` 是刷新后
/// 的完整列表 —— 前端一次 IPC 就能把状态更新完，不用「改完再查一遍」。
#[derive(serde::Serialize, specta::Type)]
pub struct ProfileOperationResult {
    pub entry: profiles::Profile,
    pub profiles: Vec<profiles::Profile>,
}

fn result_for(
    store: &Store,
    entry: profiles::Profile,
) -> Result<ProfileOperationResult, CommandError> {
    Ok(ProfileOperationResult {
        entry,
        profiles: profiles::list(store)?,
    })
}

// ── 导入 / 抓取 ─────────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub async fn import_profile_file(
    store: State<'_, Store>,
    source_path: String,
) -> Result<ProfileOperationResult, CommandError> {
    let source = std::path::Path::new(&source_path);
    // 用户挑的文件可能在网络盘上，读它是同步 I/O —— 和后面写库一样进阻塞
    // 线程池（审计项 L-19）。
    let content = {
        let source = source.to_path_buf();
        tokio::task::spawn_blocking(move || {
            std::fs::read_to_string(&source)
                .map_err(|e| CommandError::resource_not_found("source config file", e))
        })
        .await
        .map_err(|e| CommandError::invalid_state("read config file", e.to_string()))??
    };

    // 本地导入的文件以前是不校验的 —— 无效配置会一直躺在列表里，直到用户点
    // 启动才报错。现在和订阅走同一条校验路径。
    crate::daemon::validate::check_config(&content).await?;

    let name = source
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("imported")
        .to_string();

    store
        .run_blocking(move |store| {
            let entry = profiles::create(store, &name, None, &content)?;
            result_for(store, entry)
        })
        .await
}

/// 把一份配置导出成可分享的 `.bpf` 文件。
///
/// 编解码是 daemon 的事（`daemon::profile`），读库、读内容文件、落盘是这边的
/// 事 —— webview 碰不到文件系统，所以路径由前端在保存对话框里选好传进来。
#[tauri::command]
#[specta::specta]
pub async fn export_profile(
    store: State<'_, Store>,
    id: String,
    destination: String,
) -> Result<String, CommandError> {
    let lookup = id.clone();
    let (profile, content) = store
        .run_blocking(move |store| {
            let profile = profiles::find(store, &lookup)?;
            let content = profiles::read_content(store, &lookup)?;
            Ok((profile, content))
        })
        .await?;

    // 订阅带上 URL 和自动更新设置，本地文件就只有内容 —— 对方导入后能不能
    // 继续自动更新，取决于这份配置本来是不是订阅。
    let remote = profile.url.clone().unwrap_or_default();
    let encoded = crate::daemon::profile::encode(crate::daemon::desktop_api::ProfileContent {
        r#type: if remote.is_empty() {
            crate::daemon::profile::TYPE_LOCAL
        } else {
            crate::daemon::profile::TYPE_REMOTE
        },
        name: profile.name,
        config: content,
        remote_path: remote,
        auto_update: profile.auto_update,
        auto_update_interval: profile
            .update_interval_minutes
            .map(|m| m as i32)
            .unwrap_or_default(),
        last_updated: 0,
    })
    .await?;

    let path = std::path::PathBuf::from(&destination);
    let written = path.clone();
    tokio::task::spawn_blocking(move || {
        std::fs::write(&written, &encoded).map_err(|e| CommandError::io("write profile file", e))
    })
    .await
    .map_err(|e| CommandError::invalid_state("write profile file", e.to_string()))??;
    Ok(path.display().to_string())
}

/// 导入别人分享过来的 `.bpf`。
///
/// 和 `import_profile_file` 的区别只在最外层那一层封装：那个吃的是裸 JSON
/// 配置，这个吃的是 libbox 打包过的形式，解开之后同样过一遍 `check_config`
/// 再入库 —— 分享来的东西更不该被当成可信输入。
#[tauri::command]
#[specta::specta]
pub async fn import_profile_data(
    store: State<'_, Store>,
    source_path: String,
) -> Result<ProfileOperationResult, CommandError> {
    let source = std::path::PathBuf::from(&source_path);
    let data = tokio::task::spawn_blocking(move || {
        std::fs::read(&source).map_err(|e| CommandError::resource_not_found("profile file", e))
    })
    .await
    .map_err(|e| CommandError::invalid_state("read profile file", e.to_string()))??;

    let decoded = crate::daemon::profile::decode(data).await?;
    crate::daemon::validate::check_config(&decoded.config).await?;

    let name = if decoded.name.trim().is_empty() {
        "imported".to_string()
    } else {
        decoded.name
    };
    let url = Some(decoded.remote_path).filter(|path| !path.trim().is_empty());
    store
        .run_blocking(move |store| {
            let entry = profiles::create(store, &name, url, &decoded.config)?;
            result_for(store, entry)
        })
        .await
}

async fn fetch_subscription(url: &str) -> Result<String, CommandError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(CommandError::validation(
            "Subscription URL must start with http:// or https://",
        ));
    }

    let response = subscription_client()
        .get(url)
        .send()
        .await
        .map_err(|e| CommandError::network(format!("Failed to fetch subscription: {e}")))?;

    if !response.status().is_success() {
        return Err(CommandError::network(format!(
            "HTTP error {}",
            response.status()
        )));
    }

    let content = read_limited_response(response, MAX_SUBSCRIPTION_BYTES).await?;
    // 落盘前过一遍真正的 sing-box 解析器，报错直接带上它自己的话术。
    crate::daemon::validate::check_config(&content).await?;
    Ok(content)
}

#[tauri::command]
#[specta::specta]
pub async fn add_subscription(
    store: State<'_, Store>,
    url: String,
) -> Result<ProfileOperationResult, CommandError> {
    // 网络 I/O 在数据库锁之外完成 —— 抓取可能要 30 秒，不能让它把库锁住。
    let content = fetch_subscription(&url).await?;
    let name = display_name_from_url(&url);
    store
        .run_blocking(move |store| {
            let entry = profiles::create(store, &name, Some(url), &content)?;
            result_for(store, entry)
        })
        .await
}

#[tauri::command]
#[specta::specta]
/// 收 `State<SingboxState>` 而不是 `AppHandle`：`tauri::AppHandle` 默认就是
/// `AppHandle<Wry>`，一个命令带上它就会把 `collect_commands!` 整份推断成
/// `Commands<Wry>`，而 `specta_builder` 是对 runtime 泛型的（见 `ipc.rs` 的
/// 说明）。要的东西本来也只是这一个 state。
pub async fn update_subscription(
    store: State<'_, Store>,
    singbox: State<'_, crate::services::singbox::SingboxState>,
    id: String,
) -> Result<ProfileOperationResult, CommandError> {
    refresh_subscription(singbox.inner(), store.inner(), &id).await?;
    store
        .run_blocking(move |store| {
            let entry = profiles::find(store, &id)?;
            result_for(store, entry)
        })
        .await
}

/// 同一个档案上的写操作互斥。
///
/// 抓订阅要走网络（最长 30 秒），期间用户完全可能对同一个档案再点一次「更新」，
/// 而后台调度器也可能正好轮到它 —— 两条路径各自「抓完再写」，谁后写谁赢，
/// `last_updated` 和实际内容还可能来自不同的两次响应。对齐官方客户端的
/// `runProfileOperation`（`main/profiles.ts`），锁按**档案**分，不同档案之间
/// 仍然可以并发刷新。
///
/// 表项不回收：键是档案 id，数量就是档案数量（个位数），而回收要处理「正等在
/// 这把锁上的人」，不值当。
fn profile_lock(id: &str) -> std::sync::Arc<tokio::sync::Mutex<()>> {
    type Locks =
        std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<tokio::sync::Mutex<()>>>>;
    static LOCKS: OnceLock<Locks> = OnceLock::new();

    let locks = LOCKS.get_or_init(Default::default);
    let mut guard = locks.lock().unwrap_or_else(|e| e.into_inner());
    guard.entry(id.to_string()).or_default().clone()
}

/// 抓取 → 校验 → 内容变了才写盘并重载 → 刷新 `last_updated`。用户点的「更新」
/// 和后台调度器共用这一条，两边不再各写一份。
///
/// 返回内容是否真的变了 —— 调度器据此决定要不要通知前端刷新列表。
async fn refresh_subscription(
    singbox: &crate::services::singbox::SingboxState,
    store: &Store,
    id: &str,
) -> Result<bool, CommandError> {
    let lock = profile_lock(id);
    let _guard = lock.lock().await;

    // 三段：查库 → 抓网络 → 写库。两头是同步 I/O，走阻塞线程池；中间那段
    // 本来就得在锁外（抓取可能要 30 秒）。
    let lookup_id = id.to_string();
    let profile = store
        .run_blocking(move |store| profiles::find(store, &lookup_id))
        .await?;
    let url = profile.url.ok_or_else(|| {
        CommandError::resource_not_found("subscription", format!("'{}' has no URL", profile.name))
    })?;
    let content = fetch_subscription(&url).await?;

    let id = id.to_string();
    let write_id = id.clone();
    // 内容和上次一模一样就不写盘、也不重载 —— 对齐官方的
    // `if (oldContent !== remoteContent)`。订阅提供方大多每次返回相同内容，
    // 无条件重载等于每个更新周期都把隧道断一次。
    // 读不出旧内容（内容文件丢了）按「变了」处理，那本来就该重新落盘。
    let changed = store
        .run_blocking(move |store| {
            let previous = profiles::read_content(store, &write_id).ok();
            let changed = previous.as_deref() != Some(content.as_str());
            if changed {
                profiles::replace_content(store, &write_id, &content)?;
            } else {
                profiles::touch_last_updated(store, &write_id)?;
            }
            Ok(changed)
        })
        .await?;

    if changed {
        reload_if_selected_and_running(singbox, store, &id).await;
    }
    Ok(changed)
}

/// 内容变了、而且变的正好是当前选中并且正在跑的那份 —— 就地重载。
///
/// 这条策略必须住在后端：以前它只写在前端的 `useConfigs.updateSubscription`
/// 里，于是后台自动更新命中正在跑的配置时，新内容进了磁盘、隧道里跑的还是旧
/// 的，界面上连提示都没有；而窗口一关 webview 就销毁，连那半个策略也不存在了。
/// 对齐官方客户端的 `reloadIfSelectedAndRunning`（`main/profiles.ts`），它同样
/// 由每一条内容变更路径共用。
///
/// 失败只记日志：订阅本身已经更新成功了，重载不上是另一回事（daemon 正忙、
/// 新配置在合并了 override 之后不合法……），不该让「更新订阅」整个报错。
async fn reload_if_selected_and_running(
    singbox: &crate::services::singbox::SingboxState,
    store: &Store,
    id: &str,
) {
    let selected = settings::selected_profile(store).ok().flatten();
    if selected.as_deref() != Some(id) {
        return;
    }

    if !crate::services::singbox::get_daemon_state(singbox).running() {
        return;
    }

    // `StartService` 本身就是 `StartOrReloadService`，在 daemon 的同一把
    // lifecycle 锁下原子换配置 —— 不需要先 stop。
    match crate::services::singbox::start_with_profile(singbox, store, id).await {
        Ok(()) => tracing::info!(%id, "reloaded the running config after a subscription update"),
        Err(e) => tracing::warn!(error = %e, %id, "failed to reload the running config"),
    }
}

// ── 改 / 删 / 打开 ──────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub async fn edit_subscription_url(
    store: State<'_, Store>,
    id: String,
    url: String,
) -> Result<Vec<profiles::Profile>, CommandError> {
    let trimmed = url.trim().to_string();
    if trimmed.is_empty() {
        return Err(CommandError::validation("Subscription URL cannot be empty"));
    }
    store
        .run_blocking(move |store| {
            profiles::set_url(store, &id, &trimmed)?;
            profiles::list(store)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn set_subscription_auto_update(
    store: State<'_, Store>,
    id: String,
    enabled: bool,
    interval_minutes: Option<u32>,
) -> Result<Vec<profiles::Profile>, CommandError> {
    store
        .run_blocking(move |store| {
            profiles::set_auto_update(store, &id, enabled, interval_minutes)?;
            profiles::list(store)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn rename_profile(
    store: State<'_, Store>,
    id: String,
    new_name: String,
) -> Result<Vec<profiles::Profile>, CommandError> {
    let trimmed = new_name.trim().to_string();
    validate_profile_name(&trimmed)?;
    store
        .run_blocking(move |store| {
            // 重名由数据库的 UNIQUE 约束挡下并转成一句人话 —— 不需要先查一遍
            // 再改，那中间还有竞态窗口。
            profiles::rename(store, &id, &trimmed)?;
            profiles::list(store)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_profile(
    store: State<'_, Store>,
    id: String,
) -> Result<Vec<profiles::Profile>, CommandError> {
    store
        .run_blocking(move |store| {
            profiles::delete(store, &id)?;
            // 删掉的正好是当前选中的，就把选中清空，免得留一个悬空 id。
            if settings::selected_profile(store)?.as_deref() == Some(id.as_str()) {
                settings::set_selected_profile(store, None)?;
            }
            profiles::list(store)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn open_config_file(store: State<'_, Store>, id: String) -> Result<(), CommandError> {
    // 存在性通过 `read_content` 确认（它会区分「没这个档案」和「内容文件丢了」），
    // 它要读一整份配置文件 —— 进阻塞线程池。`open_with_system` 留在外面，和
    // `open_app_directory` 一致。
    let lookup = id.clone();
    store
        .run_blocking(move |store| profiles::read_content(store, &lookup).map(|_| ()))
        .await?;
    open_with_system(&profiles::content_path(&id)?.to_string_lossy())
}

// ── 自动更新调度 ────────────────────────────────────────────────────────────

/// 扫描间隔。远比任何单个订阅自己的更新周期短（后者最小 15 分钟），只要够
/// 密到「到期后不会干等太久」即可。
const AUTO_UPDATE_CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

/// 启动后台自动更新循环。应用启动时调一次，跑满进程生命周期。
///
/// 单个订阅刷新失败（网络错误、拉回来的内容没过 `check_config`……）只记日志
/// 并跳过，不影响这一轮的其他订阅，下一轮到期再试。
pub fn spawn_auto_update_scheduler(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(AUTO_UPDATE_CHECK_INTERVAL).await;

            let (Some(store), Some(singbox)) = (
                app.try_state::<Store>(),
                app.try_state::<crate::services::singbox::SingboxState>(),
            ) else {
                continue;
            };
            // 查库是同步 I/O，和这个文件里其它地方一样进阻塞线程池。
            let store = store.inner().clone();
            let singbox = singbox.inner().clone();
            let Ok(all) = store.run_blocking(profiles::list).await else {
                continue;
            };

            let now = chrono::Utc::now();
            let due: Vec<String> = all
                .iter()
                .filter(|profile| profiles::is_due(profile, now))
                .map(|profile| profile.id.clone())
                .collect();
            if due.is_empty() {
                continue;
            }

            // 内容变没变都要通知前端：即使内容一样，`last_updated` 也动了，
            // 而档案页显示的正是它。真正变了的那些，重载已经在
            // `refresh_subscription` 里就地做完了 —— 前端不再需要参与。
            let mut any_refreshed = false;
            for id in due {
                match refresh_subscription(&singbox, &store, &id).await {
                    Ok(_) => any_refreshed = true,
                    Err(e) => {
                        tracing::warn!(error = ?e, %id, "auto-update: failed to refresh subscription")
                    }
                }
            }

            if any_refreshed {
                use tauri::Emitter;
                let _ = app.emit("profiles-auto-updated", ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_name_comes_from_the_url_tail() {
        assert_eq!(
            display_name_from_url("https://a.example/x/my-sub.json"),
            "my-sub"
        );
        assert_eq!(
            display_name_from_url("https://a.example/sub?token=1"),
            "sub"
        );
        assert_eq!(display_name_from_url("https://a.example/"), "subscription");
    }

    #[test]
    fn two_urls_with_the_same_tail_yield_the_same_display_name() {
        // 以前这意味着后加的订阅会**静默覆盖**先加的（文件名就是这个字符串）。
        // 现在它只是个显示名，`store::profiles::unique_name` 会给第二个加后缀，
        // 两个订阅各有各的 id 和内容文件。
        assert_eq!(
            display_name_from_url("https://a.example/sub"),
            display_name_from_url("https://b.example/sub")
        );
    }

    #[test]
    fn a_hostile_url_tail_is_just_a_string_now() {
        // 不再需要清洗：这个值不会变成文件名。
        let name = display_name_from_url("https://a.example/..%2F..%2Fevil");
        assert!(!name.is_empty());
    }

    #[test]
    fn rejects_an_empty_or_overlong_name() {
        assert!(validate_profile_name("   ").is_err());
        assert!(validate_profile_name(&"x".repeat(200)).is_err());
        assert!(validate_profile_name("ok").is_ok());
    }
}
