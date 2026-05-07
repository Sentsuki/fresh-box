// config.rs - 管理配置文件

use crate::errors::CommandError;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const SUBSCRIPTIONS_FILE: &str = "subscriptions.json";
const FILE_ORDER_KEY: &str = "_file_order";
const APP_SETTINGS_FILE: &str = "app_settings.json";
const APP_SETTINGS_SCHEMA_VERSION: u32 = 2;
pub const CORE_CHANNEL_STABLE: &str = "stable";
pub const CORE_CHANNEL_TESTING: &str = "testing";
const CORE_EXECUTABLE_NAME: &str = "sing-box.exe";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_app_settings_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub app: AppSelectionSettings,
    #[serde(default)]
    pub singbox_core: SingboxCoreSettings,
    #[serde(default)]
    pub pages: PageSettings,
    #[serde(default)]
    pub test_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSelectionSettings {
    pub current_page: String,
    pub selected_config_path: Option<String>,
    pub selected_config_display: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SingboxCoreSettings {
    pub active_channel: Option<String>,
    pub active_version: Option<String>,
    pub selected_option_key: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PageSettings {
    #[serde(default)]
    pub proxies: ProxyPageSettings,
    #[serde(default)]
    pub connections: ConnectionPageSettings,
    #[serde(default)]
    pub logs: LogsPageSettings,
    #[serde(default)]
    pub rules: RulesPageSettings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ProxyPageSettings {
    #[serde(default)]
    pub collapsed_groups: std::collections::BTreeMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ConnectionPageSettings {
    pub current_tab: String,
    pub column_order: Vec<String>,
    pub visible_columns: Vec<String>,
    pub sort_key: String,
    pub sort_direction: String,
    pub grouped_column: Option<String>,
    #[serde(default)]
    pub collapsed_groups: std::collections::BTreeMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LogsPageSettings {
    pub log_level: String,
    pub type_filter: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RulesPageSettings {
    pub current_tab: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: APP_SETTINGS_SCHEMA_VERSION,
            app: AppSelectionSettings::default(),
            singbox_core: SingboxCoreSettings::default(),
            pages: PageSettings::default(),
            test_url: None,
        }
    }
}

impl Default for AppSelectionSettings {
    fn default() -> Self {
        Self {
            current_page: "overview".to_string(),
            selected_config_path: None,
            selected_config_display: None,
        }
    }
}

impl Default for ConnectionPageSettings {
    fn default() -> Self {
        Self {
            current_tab: "active".to_string(),
            column_order: vec![
                "host".to_string(),
                "destination".to_string(),
                "downloadSpeed".to_string(),
                "uploadSpeed".to_string(),
                "download".to_string(),
                "upload".to_string(),
                "chain".to_string(),
                "rule".to_string(),
                "source".to_string(),
                "process".to_string(),
                "network".to_string(),
                "start".to_string(),
            ],
            visible_columns: vec![
                "host".to_string(),
                "downloadSpeed".to_string(),
                "uploadSpeed".to_string(),
                "chain".to_string(),
                "rule".to_string(),
                "source".to_string(),
                "process".to_string(),
                "start".to_string(),
            ],
            sort_key: "downloadSpeed".to_string(),
            sort_direction: "desc".to_string(),
            grouped_column: None,
            collapsed_groups: std::collections::BTreeMap::new(),
        }
    }
}

impl Default for LogsPageSettings {
    fn default() -> Self {
        Self {
            log_level: "info".to_string(),
            type_filter: String::new(),
        }
    }
}

impl Default for RulesPageSettings {
    fn default() -> Self {
        Self {
            current_tab: "rules".to_string(),
        }
    }
}

fn normalize_app_settings(value: Value) -> Result<AppSettings, CommandError> {
    let mut settings = serde_json::from_value::<AppSettings>(value).unwrap_or_default();
    settings.schema_version = APP_SETTINGS_SCHEMA_VERSION;
    Ok(settings)
}

fn default_app_settings_schema_version() -> u32 {
    APP_SETTINGS_SCHEMA_VERSION
}

pub fn read_json_file<T>(path: &Path) -> Result<T, CommandError>
where
    T: DeserializeOwned,
{
    let content = fs::read_to_string(path).map_err(|error| {
        CommandError::io(
            format!("failed to read JSON file {}", path.display()),
            error,
        )
    })?;

    serde_json::from_str(&content)
        .map_err(|error| CommandError::json(format!("failed to parse {}", path.display()), error))
}

pub fn write_json_file<T>(path: &Path, value: &T) -> Result<(), CommandError>
where
    T: Serialize,
{
    let content = serde_json::to_string_pretty(value).map_err(|error| {
        CommandError::json(format!("failed to serialize {}", path.display()), error)
    })?;

    fs::write(path, content)
        .map_err(|error| CommandError::io(format!("failed to write {}", path.display()), error))
}

fn load_json_or_default<T>(path: &Path) -> Result<T, CommandError>
where
    T: DeserializeOwned + Default,
{
    if !path.exists() {
        return Ok(T::default());
    }

    read_json_file(path)
}

pub fn get_named_config_path(file_name: &str) -> Result<PathBuf, CommandError> {
    Ok(get_config_dir()?.join(file_name))
}

pub fn load_named_config_or_default<T>(file_name: &str) -> Result<T, CommandError>
where
    T: DeserializeOwned + Default,
{
    load_json_or_default(&get_named_config_path(file_name)?)
}

pub fn save_named_config<T>(file_name: &str, value: &T) -> Result<(), CommandError>
where
    T: Serialize,
{
    write_json_file(&get_named_config_path(file_name)?, value)
}

pub fn remove_named_config(file_name: &str) -> Result<(), CommandError> {
    let path = get_named_config_path(file_name)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| {
            CommandError::io(format!("failed to remove {}", path.display()), error)
        })?;
    }
    Ok(())
}

fn get_app_settings_path() -> Result<PathBuf, CommandError> {
    Ok(get_config_dir()?.join(APP_SETTINGS_FILE))
}

pub fn load_app_settings_file() -> Result<AppSettings, CommandError> {
    let path = get_app_settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let value: Value = read_json_file(&path)?;
    normalize_app_settings(value)
}

pub fn save_app_settings_file(settings: &AppSettings) -> Result<(), CommandError> {
    write_json_file(&get_app_settings_path()?, settings)
}

fn extract_clash_api_url(config: &Value) -> Option<String> {
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

    match (external_controller, external_ui) {
        (Some(controller), Some(ui)) => {
            let ui_path = if ui.starts_with('/') {
                ui.to_string()
            } else {
                format!("/{}", ui)
            };

            Some(format!("http://{}{}/", controller, ui_path))
        }
        _ => None,
    }
}

// 获取可执行文件所在目录
pub fn get_exe_dir() -> Result<PathBuf, CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::resource_not_found("executable path", e))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::resource_not_found("executable directory", "parent path missing")
    })?;
    Ok(exe_dir.to_path_buf())
}

// 获取 bin 目录路径（放 sing-box 核心）
pub fn get_bin_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("bin");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("bin directory", e))?;
    }
    Ok(dir)
}

pub fn get_core_channel_dir(channel: &str) -> Result<PathBuf, CommandError> {
    let normalized = normalize_core_channel(channel)?;
    let dir = get_bin_dir()?.join(normalized);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("core channel directory", e))?;
    }
    Ok(dir)
}

pub fn get_core_version_dir(channel: &str, version: &str) -> Result<PathBuf, CommandError> {
    Ok(get_core_channel_dir(channel)?.join(version))
}

pub fn set_active_singbox_core_selection(
    channel: Option<String>,
    version: Option<String>,
) -> Result<(), CommandError> {
    if channel.is_some() != version.is_some() {
        return Err(CommandError::invalid_state(
            "set_active_singbox_core_selection",
            "channel and version must either both be set or both be empty",
        ));
    }

    if let Some(channel) = channel.as_deref() {
        normalize_core_channel(channel)?;
    }

    let mut settings = load_app_settings_file()?;
    settings.singbox_core.active_channel = channel;
    settings.singbox_core.active_version = version;
    save_app_settings_file(&settings)
}

pub fn get_active_singbox_core_selection() -> Result<Option<(String, String)>, CommandError> {
    let settings = load_app_settings_file()?;
    match (
        settings.singbox_core.active_channel,
        settings.singbox_core.active_version,
    ) {
        (Some(channel), Some(version)) => Ok(Some((normalize_core_channel(&channel)?.to_string(), version))),
        (None, None) => Ok(None),
        _ => Err(CommandError::invalid_state(
            "get_active_singbox_core_selection",
            "app_settings.json must store both singbox_core.active_channel and singbox_core.active_version together",
        )),
    }
}

pub fn get_active_singbox_core_executable() -> Result<PathBuf, CommandError> {
    let (channel, version) = get_active_singbox_core_selection()?.ok_or_else(|| {
        CommandError::resource_not_found(
            "active sing-box core selection",
            "app_settings.json does not point to an installed core version",
        )
    })?;
    let executable_path = get_core_version_dir(&channel, &version)?.join(CORE_EXECUTABLE_NAME);
    if !executable_path.exists() {
        return Err(CommandError::resource_not_found(
            "active sing-box core executable",
            executable_path.display(),
        ));
    }

    Ok(executable_path)
}

pub fn normalize_core_channel(channel: &str) -> Result<&'static str, CommandError> {
    match channel {
        CORE_CHANNEL_STABLE => Ok(CORE_CHANNEL_STABLE),
        CORE_CHANNEL_TESTING => Ok(CORE_CHANNEL_TESTING),
        _ => Err(CommandError::invalid_state(
            "normalize_core_channel",
            format!("unsupported sing-box core channel: {}", channel),
        )),
    }
}

// 获取 sub 目录路径（放订阅得到的配置文件）
pub fn get_sub_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("sub");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("sub directory", e))?;
    }
    Ok(dir)
}

// 获取 log 目录路径（放核心生成的日志和崩溃日志）
pub fn get_log_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("log");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("log directory", e))?;
    }
    Ok(dir)
}

// 获取 config 目录路径（放 config_override.json、priority_config.json、subscriptions.json）
pub fn get_config_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("config");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("config directory", e))?;
    }
    Ok(dir)
}

// 获取 data 目录路径（放 singbox 运行目录和 temp_config.json）
pub fn get_data_dir() -> Result<PathBuf, CommandError> {
    let dir = get_exe_dir()?.join("data");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("data directory", e))?;
    }
    Ok(dir)
}

// --- 文件顺序管理 ---

fn get_subscriptions_path() -> Result<PathBuf, CommandError> {
    Ok(get_config_dir()?.join(SUBSCRIPTIONS_FILE))
}

fn load_subscriptions_json() -> Result<serde_json::Map<String, Value>, CommandError> {
    let path = get_subscriptions_path()?;
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| CommandError::io("failed to read subscriptions file", e))?;
    let value: Value =
        serde_json::from_str(&content).unwrap_or(Value::Object(serde_json::Map::new()));
    Ok(value.as_object().cloned().unwrap_or_default())
}

fn save_subscriptions_json(map: &serde_json::Map<String, Value>) -> Result<(), CommandError> {
    let path = get_subscriptions_path()?;
    write_json_file(&path, map)
}

fn load_file_order() -> Result<Vec<String>, CommandError> {
    let map = load_subscriptions_json()?;
    Ok(map
        .get(FILE_ORDER_KEY)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default())
}

fn save_file_order(order: &[String]) -> Result<(), CommandError> {
    let mut map = load_subscriptions_json()?;
    map.insert(
        FILE_ORDER_KEY.to_string(),
        Value::Array(order.iter().map(|s| Value::String(s.clone())).collect()),
    );
    save_subscriptions_json(&map)
}

fn append_to_file_order(stem: &str) -> Result<(), CommandError> {
    let mut order = load_file_order()?;
    if !order.iter().any(|s| s == stem) {
        order.push(stem.to_string());
        save_file_order(&order)?;
    }
    Ok(())
}

fn rename_in_file_order(old_stem: &str, new_stem: &str) -> Result<(), CommandError> {
    let mut order = load_file_order()?;
    for entry in order.iter_mut() {
        if entry == old_stem {
            *entry = new_stem.to_string();
            break;
        }
    }
    save_file_order(&order)
}

fn remove_from_file_order(stem: &str) -> Result<(), CommandError> {
    let mut order = load_file_order()?;
    order.retain(|s| s != stem);
    save_file_order(&order)
}

fn stem_from_filename(file_name: &str) -> &str {
    file_name.strip_suffix(".json").unwrap_or(file_name)
}

#[tauri::command]
pub async fn open_app_directory() -> Result<(), CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::resource_not_found("executable path", e))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::resource_not_found("executable directory", "parent path missing")
    })?;

    #[cfg(target_os = "windows")]
    {
        // 使用 Windows API 直接打开目录，避免命令行窗口闪烁
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("explorer")
            .arg(exe_dir)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("application directory", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(exe_dir)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("application directory", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(exe_dir)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("application directory", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn load_app_settings() -> Result<AppSettings, CommandError> {
    load_app_settings_file()
}

#[tauri::command]
pub async fn save_app_settings(settings: AppSettings) -> Result<(), CommandError> {
    save_app_settings_file(&settings)
}

#[tauri::command]
pub async fn save_subscription_config(
    file_name: String,
    content: String,
) -> Result<String, CommandError> {
    let sub_dir = get_sub_dir()?;
    let target_path = sub_dir.join(&file_name);

    fs::write(&target_path, content)
        .map_err(|e| CommandError::resource_not_found("subscription config", e))?;

    append_to_file_order(stem_from_filename(&file_name))?;

    Ok(target_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn copy_config_to_bin(config_path: String) -> Result<String, CommandError> {
    let sub_dir = get_sub_dir()?;
    let source_config_path = std::path::Path::new(&config_path);

    if !source_config_path.exists() {
        return Err(CommandError::resource_not_found(
            "source config file",
            config_path,
        ));
    }

    let config_file = source_config_path
        .file_name()
        .ok_or_else(|| CommandError::invalid_state("copy config", "invalid config file path"))?;
    let target_config_path = sub_dir.join(config_file);

    // 如果文件已存在且内容相同，则无需复制
    if target_config_path.exists() {
        let source_content = fs::read(&config_path)
            .map_err(|e| CommandError::resource_not_found("source config file", e))?;
        let target_content = fs::read(&target_config_path)
            .map_err(|e| CommandError::resource_not_found("target config file", e))?;
        if source_content == target_content {
            return Ok(target_config_path.to_string_lossy().into_owned());
        }
    }

    fs::copy(&config_path, &target_config_path)
        .map_err(|e| CommandError::resource_not_found("copied config file", e))?;

    let stem = target_config_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    append_to_file_order(stem)?;

    Ok(target_config_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn list_configs(_app_handle: tauri::AppHandle) -> Result<Vec<String>, CommandError> {
    let sub_dir = get_sub_dir()?;

    // 收集磁盘上所有 .json 文件
    let mut on_disk: std::collections::HashSet<String> = std::collections::HashSet::new();
    for entry in
        fs::read_dir(&sub_dir).map_err(|e| CommandError::resource_not_found("sub directory", e))?
    {
        let entry = entry.map_err(|e| CommandError::resource_not_found("directory entry", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                on_disk.insert(name.to_string());
            }
        }
    }

    // 按 _file_order 排序，磁盘上不在 order 中的追加到末尾
    let order = load_file_order()?;
    let mut result: Vec<String> = Vec::with_capacity(on_disk.len());

    for stem in &order {
        let file_name = format!("{}.json", stem);
        if on_disk.contains(&file_name) {
            result.push(sub_dir.join(&file_name).to_string_lossy().into_owned());
        }
    }

    let ordered_stems: std::collections::HashSet<&str> = order.iter().map(|s| s.as_str()).collect();
    for name in &on_disk {
        let stem = stem_from_filename(name);
        if !ordered_stems.contains(stem) {
            result.push(sub_dir.join(name).to_string_lossy().into_owned());
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn delete_config(config_path: String) -> Result<(), CommandError> {
    let sub_dir = get_sub_dir()?;
    let rm_full_path = sub_dir.join(&config_path);

    if !rm_full_path.exists() {
        return Err(CommandError::resource_not_found(
            "config file",
            rm_full_path.to_string_lossy(),
        ));
    }

    fs::remove_file(&rm_full_path)
        .map_err(|e| CommandError::resource_not_found("config file", e))?;

    remove_from_file_order(stem_from_filename(&config_path))?;

    Ok(())
}

#[tauri::command]
pub async fn rename_config(old_path: String, new_path: String) -> Result<(), CommandError> {
    let sub_dir = get_sub_dir()?;

    // 构建完整的旧文件和新文件路径
    let old_full_path = sub_dir.join(&old_path);
    let new_full_path = sub_dir.join(&new_path);

    // 检查旧文件是否存在
    if !old_full_path.exists() {
        return Err(CommandError::resource_not_found(
            "source config file",
            old_full_path.display(),
        ));
    }

    // 检查新文件名是否已经存在
    if new_full_path.exists() {
        return Err(CommandError::invalid_state(
            "rename config",
            format!(
                "a config file already exists at {}",
                new_full_path.display()
            ),
        ));
    }

    // 检查文件扩展名是否为 .json
    if new_full_path.extension().and_then(|s| s.to_str()) != Some("json") {
        return Err(CommandError::invalid_state(
            "rename config",
            "new filename must have .json extension",
        ));
    }

    // 执行重命名操作
    fs::rename(&old_full_path, &new_full_path)
        .map_err(|e| CommandError::resource_not_found("renamed config file", e))?;

    rename_in_file_order(stem_from_filename(&old_path), stem_from_filename(&new_path))?;

    Ok(())
}

#[tauri::command]
pub async fn save_subscriptions(subscriptions: String) -> Result<(), CommandError> {
    let mut parsed: serde_json::Map<String, Value> = serde_json::from_str(&subscriptions)
        .map_err(|e| CommandError::json("failed to parse subscriptions payload", e))?;

    // 前端不传 _file_order，从磁盘读取现有值并保留
    if !parsed.contains_key(FILE_ORDER_KEY) {
        if let Ok(existing) = load_subscriptions_json() {
            if let Some(order) = existing.get(FILE_ORDER_KEY) {
                parsed.insert(FILE_ORDER_KEY.to_string(), order.clone());
            }
        }
    }

    save_subscriptions_json(&parsed)
}

#[tauri::command]
pub async fn load_subscriptions() -> Result<String, CommandError> {
    let mut map = load_subscriptions_json()?;
    // 不把内部字段暴露给前端
    map.remove(FILE_ORDER_KEY);
    serde_json::to_string(&Value::Object(map))
        .map_err(|e| CommandError::json("failed to serialize subscriptions payload", e))
}

#[tauri::command]
pub async fn open_config_file(config_path: String) -> Result<(), CommandError> {
    let sub_dir = get_sub_dir()?;
    let full_path = sub_dir.join(&config_path);

    if !full_path.exists() {
        return Err(CommandError::resource_not_found(
            "config file",
            full_path.display(),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        // 使用 Windows API 直接打开文件，避免命令行窗口闪烁
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("cmd")
            .args(["/C", "start", "", &full_path.to_string_lossy()])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("config file", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&full_path).spawn().map_err(|e| {
            CommandError::ResourceNotFound(format!("Failed to open config file: {}", e))
        })?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&full_path)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("config file", e))?;
    }

    Ok(())
}
#[tauri::command]
pub async fn load_config_content(config_path: String) -> Result<Value, CommandError> {
    let sub_dir = get_sub_dir()?;
    let full_path = sub_dir.join(&config_path);

    if !full_path.exists() {
        return Err(CommandError::resource_not_found(
            "config file",
            full_path.display(),
        ));
    }

    let content = fs::read_to_string(&full_path)
        .map_err(|e| CommandError::resource_not_found("config file", e))?;

    let json_value: Value = serde_json::from_str(&content)
        .map_err(|e| CommandError::json("failed to parse config JSON", e))?;

    Ok(json_value)
}

#[tauri::command]
pub async fn save_config_content(config_path: String, content: String) -> Result<(), CommandError> {
    let sub_dir = get_sub_dir()?;
    let full_path = sub_dir.join(&config_path);

    // 验证 JSON 格式
    let _: Value =
        serde_json::from_str(&content).map_err(|e| CommandError::json("invalid config JSON", e))?;

    fs::write(&full_path, content)
        .map_err(|e| CommandError::resource_not_found("config file", e))?;

    Ok(())
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), CommandError> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("URL", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("URL", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("URL", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_panel_url() -> Result<(), CommandError> {
    let override_config = crate::config_override::get_override_config_if_enabled().await?;
    let config = override_config.ok_or_else(|| {
        CommandError::invalid_state("open panel", "config override is not enabled")
    })?;

    let url = extract_clash_api_url(&config).ok_or_else(|| {
        CommandError::invalid_state("open panel", "clash API not configured in override config")
    })?;

    open_url(url).await
}

#[tauri::command]
pub async fn get_clash_api_url(config_path: String) -> Result<Option<String>, CommandError> {
    let sub_dir = get_sub_dir()?;
    let full_path = sub_dir.join(&config_path);

    if !full_path.exists() {
        return Err(CommandError::resource_not_found(
            "config file",
            full_path.display(),
        ));
    }

    // 读取原始配置文件
    let content = fs::read_to_string(&full_path)
        .map_err(|e| CommandError::resource_not_found("config file", e))?;

    let mut config: Value = serde_json::from_str(&content)
        .map_err(|e| CommandError::json("failed to parse config JSON", e))?;

    // 检查是否有 override 配置并应用
    if let Ok(Some(override_config)) =
        crate::config_override::get_override_config_if_enabled().await
    {
        crate::config_override::apply_config_override(&mut config, &override_config);
    }

    Ok(extract_clash_api_url(&config))
}
