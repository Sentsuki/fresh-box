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
        let chunk = chunk
            .map_err(|e| CommandError::network(format!("Failed to read subscription content: {e}")))?;
        buf.extend_from_slice(&chunk);
        if buf.len() > max_bytes {
            return Err(CommandError::validation(format!(
                "Subscription response is too large (limit is {max_bytes} bytes)"
            )));
        }
    }

    String::from_utf8(buf)
        .map_err(|e| CommandError::validation(format!("Subscription response is not valid UTF-8: {e}")))
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
            format!("failed to open '{path}' (ShellExecuteW error code {})", result.0 as isize),
        ))
    }
}

// ── 设置 ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_app_directory() -> Result<(), CommandError> {
    open_with_system(&crate::config::get_app_data_root()?.to_string_lossy())
}

#[tauri::command]
pub fn load_app_settings(store: State<'_, Store>) -> Result<AppSettings, CommandError> {
    crate::config::app_settings::load_app_settings(store.inner())
}

#[tauri::command]
pub fn save_app_settings(
    store: State<'_, Store>,
    backend_prefs: State<'_, crate::config::app_settings::BackendPrefsState>,
    settings: AppSettings,
) -> Result<(), CommandError> {
    // 先更新后端自己那份缓存再落盘：这次调用一返回，`CloseRequested` 或切换
    // 节点的处理器就可能读它，不能让它们看到旧值。
    backend_prefs.set(store.inner(), settings.settings.clone())?;
    crate::config::app_settings::save_app_settings(store.inner(), &settings)
}

// ── 档案列表 ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_profiles(store: State<'_, Store>) -> Result<Vec<profiles::Profile>, CommandError> {
    profiles::list(store.inner())
}

/// 增 / 导入 / 刷新单个档案的统一返回：`entry` 是这一个，`profiles` 是刷新后
/// 的完整列表 —— 前端一次 IPC 就能把状态更新完，不用「改完再查一遍」。
#[derive(serde::Serialize)]
pub struct ProfileOperationResult {
    pub entry: profiles::Profile,
    pub profiles: Vec<profiles::Profile>,
}

fn result_for(store: &Store, entry: profiles::Profile) -> Result<ProfileOperationResult, CommandError> {
    Ok(ProfileOperationResult {
        entry,
        profiles: profiles::list(store)?,
    })
}

// ── 导入 / 抓取 ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn import_profile_file(
    store: State<'_, Store>,
    source_path: String,
) -> Result<ProfileOperationResult, CommandError> {
    let source = std::path::Path::new(&source_path);
    let content = std::fs::read_to_string(source)
        .map_err(|e| CommandError::resource_not_found("source config file", e))?;

    // 本地导入的文件以前是不校验的 —— 无效配置会一直躺在列表里，直到用户点
    // 启动才报错。现在和订阅走同一条校验路径。
    crate::daemon::validate::check_config(&content).await?;

    let name = source
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("imported");

    let entry = profiles::create(store.inner(), name, None, &content)?;
    result_for(store.inner(), entry)
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
        return Err(CommandError::network(format!("HTTP error {}", response.status())));
    }

    let content = read_limited_response(response, MAX_SUBSCRIPTION_BYTES).await?;
    // 落盘前过一遍真正的 sing-box 解析器，报错直接带上它自己的话术。
    crate::daemon::validate::check_config(&content).await?;
    Ok(content)
}

#[tauri::command]
pub async fn add_subscription(
    store: State<'_, Store>,
    url: String,
) -> Result<ProfileOperationResult, CommandError> {
    // 网络 I/O 在数据库锁之外完成 —— 抓取可能要 30 秒，不能让它把库锁住。
    let content = fetch_subscription(&url).await?;
    let entry = profiles::create(
        store.inner(),
        &display_name_from_url(&url),
        Some(url),
        &content,
    )?;
    result_for(store.inner(), entry)
}

#[tauri::command]
pub async fn update_subscription(
    store: State<'_, Store>,
    id: String,
) -> Result<ProfileOperationResult, CommandError> {
    refresh_subscription(store.inner(), &id).await?;
    result_for(store.inner(), profiles::find(store.inner(), &id)?)
}

/// 抓取 → 校验 → 写入 → 刷新 `last_updated`。用户点的「更新」和后台调度器
/// 共用这一条，两边不再各写一份。
async fn refresh_subscription(store: &Store, id: &str) -> Result<(), CommandError> {
    let profile = profiles::find(store, id)?;
    let url = profile.url.ok_or_else(|| {
        CommandError::resource_not_found("subscription", format!("'{}' has no URL", profile.name))
    })?;
    let content = fetch_subscription(&url).await?;
    profiles::replace_content(store, id, &content)
}

// ── 改 / 删 / 打开 ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn edit_subscription_url(
    store: State<'_, Store>,
    id: String,
    url: String,
) -> Result<Vec<profiles::Profile>, CommandError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(CommandError::validation("Subscription URL cannot be empty"));
    }
    profiles::set_url(store.inner(), &id, trimmed)?;
    profiles::list(store.inner())
}

#[tauri::command]
pub fn set_subscription_auto_update(
    store: State<'_, Store>,
    id: String,
    enabled: bool,
    interval_minutes: Option<u32>,
) -> Result<Vec<profiles::Profile>, CommandError> {
    profiles::set_auto_update(store.inner(), &id, enabled, interval_minutes)?;
    profiles::list(store.inner())
}

#[tauri::command]
pub fn rename_profile(
    store: State<'_, Store>,
    id: String,
    new_name: String,
) -> Result<Vec<profiles::Profile>, CommandError> {
    let trimmed = new_name.trim();
    validate_profile_name(trimmed)?;
    // 重名由数据库的 UNIQUE 约束挡下并转成一句人话 —— 不需要先查一遍再改，
    // 那中间还有竞态窗口。
    profiles::rename(store.inner(), &id, trimmed)?;
    profiles::list(store.inner())
}

#[tauri::command]
pub fn delete_profile(
    store: State<'_, Store>,
    id: String,
) -> Result<Vec<profiles::Profile>, CommandError> {
    profiles::delete(store.inner(), &id)?;
    // 删掉的正好是当前选中的，就把选中清空，免得留一个悬空 id。
    if settings::selected_profile(store.inner())?.as_deref() == Some(id.as_str()) {
        settings::set_selected_profile(store.inner(), None)?;
    }
    profiles::list(store.inner())
}

#[tauri::command]
pub fn open_config_file(store: State<'_, Store>, id: String) -> Result<(), CommandError> {
    // 存在性通过 `read_content` 确认（它会区分「没这个档案」和「内容文件丢了」）。
    profiles::read_content(store.inner(), &id)?;
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

            let Some(store) = app.try_state::<Store>() else {
                continue;
            };
            let Ok(all) = profiles::list(store.inner()) else {
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

            let mut any_succeeded = false;
            for id in due {
                match refresh_subscription(store.inner(), &id).await {
                    Ok(()) => any_succeeded = true,
                    Err(e) => {
                        tracing::warn!(error = ?e, %id, "auto-update: failed to refresh subscription")
                    }
                }
            }

            if any_succeeded {
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
        assert_eq!(display_name_from_url("https://a.example/x/my-sub.json"), "my-sub");
        assert_eq!(display_name_from_url("https://a.example/sub?token=1"), "sub");
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
