use crate::config::AppSettings;
use crate::errors::CommandError;
use serde_json::Value;
use std::fs;

#[tauri::command]
pub async fn open_app_directory() -> Result<(), CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::resource_not_found("executable path", e))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::resource_not_found("executable directory", "parent path missing")
    })?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("explorer")
            .arg(exe_dir)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("application directory", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(exe_dir)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("application directory", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(exe_dir)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("application directory", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn load_app_settings() -> Result<AppSettings, CommandError> {
    crate::config::app_settings::load_app_settings_file()
}

#[tauri::command]
pub async fn save_app_settings(mut settings: AppSettings) -> Result<(), CommandError> {
    if let Ok(current) = crate::config::app_settings::load_app_settings_file() {
        settings.settings.singbox_core.active_channel =
            current.settings.singbox_core.active_channel;
        settings.settings.singbox_core.active_version =
            current.settings.singbox_core.active_version;
    }
    crate::config::app_settings::save_app_settings_file(&settings)
}

#[tauri::command]
pub async fn save_subscription_config(
    file_name: String,
    content: String,
) -> Result<String, CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
    let target_path = sub_dir.join(&file_name);

    fs::write(&target_path, content)
        .map_err(|e| CommandError::resource_not_found("subscription config", e))?;

    crate::config::profiles::append_to_file_order(crate::config::profiles::stem_from_filename(
        &file_name,
    ))?;

    Ok(target_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn copy_config_to_bin(config_path: String) -> Result<String, CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
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
    crate::config::profiles::append_to_file_order(stem)?;

    Ok(target_config_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn list_configs(_app_handle: tauri::AppHandle) -> Result<Vec<String>, CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;

    let mut on_disk: std::collections::HashSet<String> = std::collections::HashSet::new();
    for entry in
        fs::read_dir(&sub_dir).map_err(|e| CommandError::resource_not_found("sub directory", e))?
    {
        let entry = entry.map_err(|e| CommandError::resource_not_found("directory entry", e))?;
        let path = entry.path();
        if let Some(name) = path
            .extension()
            .and_then(|s| s.to_str())
            .filter(|&ext| ext == "json")
            .and_then(|_| path.file_name())
            .and_then(|s| s.to_str())
        {
            on_disk.insert(name.to_string());
        }
    }

    let order = crate::config::profiles::load_file_order()?;
    let mut result: Vec<String> = Vec::with_capacity(on_disk.len());

    for stem in &order {
        let file_name = format!("{}.json", stem);
        if on_disk.contains(&file_name) {
            result.push(sub_dir.join(&file_name).to_string_lossy().into_owned());
        }
    }

    let ordered_stems: std::collections::HashSet<&str> = order.iter().map(|s| s.as_str()).collect();
    for name in &on_disk {
        let stem = crate::config::profiles::stem_from_filename(name);
        if !ordered_stems.contains(stem) {
            result.push(sub_dir.join(name).to_string_lossy().into_owned());
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn delete_config(config_path: String) -> Result<(), CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
    let rm_full_path = sub_dir.join(&config_path);

    if !rm_full_path.exists() {
        return Err(CommandError::resource_not_found(
            "config file",
            rm_full_path.to_string_lossy(),
        ));
    }

    fs::remove_file(&rm_full_path)
        .map_err(|e| CommandError::resource_not_found("config file", e))?;

    crate::config::profiles::remove_from_file_order(crate::config::profiles::stem_from_filename(
        &config_path,
    ))?;

    Ok(())
}

#[tauri::command]
pub async fn rename_config(old_path: String, new_path: String) -> Result<(), CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
    let old_full_path = sub_dir.join(&old_path);
    let new_full_path = sub_dir.join(&new_path);

    if !old_full_path.exists() {
        return Err(CommandError::resource_not_found(
            "source config file",
            old_full_path.display(),
        ));
    }

    if new_full_path.exists() {
        return Err(CommandError::invalid_state(
            "rename config",
            format!(
                "a config file already exists at {}",
                new_full_path.display()
            ),
        ));
    }

    if new_full_path.extension().and_then(|s| s.to_str()) != Some("json") {
        return Err(CommandError::invalid_state(
            "rename config",
            "new filename must have .json extension",
        ));
    }

    fs::rename(&old_full_path, &new_full_path)
        .map_err(|e| CommandError::resource_not_found("renamed config file", e))?;

    crate::config::profiles::rename_in_file_order(
        crate::config::profiles::stem_from_filename(&old_path),
        crate::config::profiles::stem_from_filename(&new_path),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn save_subscriptions(subscriptions: String) -> Result<(), CommandError> {
    let mut parsed: serde_json::Map<String, Value> = serde_json::from_str(&subscriptions)
        .map_err(|e| CommandError::json("failed to parse subscriptions payload", e))?;

    if !parsed.contains_key(crate::config::profiles::FILE_ORDER_KEY)
        && let Ok(existing) = crate::config::profiles::load_subscriptions_json()
        && let Some(order) = existing.get(crate::config::profiles::FILE_ORDER_KEY)
    {
        parsed.insert(
            crate::config::profiles::FILE_ORDER_KEY.to_string(),
            order.clone(),
        );
    }

    crate::config::profiles::save_subscriptions_json(&parsed)
}

#[tauri::command]
pub async fn load_subscriptions() -> Result<String, CommandError> {
    let mut map = crate::config::profiles::load_subscriptions_json()?;
    map.remove(crate::config::profiles::FILE_ORDER_KEY);
    serde_json::to_string(&Value::Object(map))
        .map_err(|e| CommandError::json("failed to serialize subscriptions payload", e))
}

#[tauri::command]
pub async fn open_config_file(config_path: String) -> Result<(), CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
    let full_path = sub_dir.join(&config_path);

    if !full_path.exists() {
        return Err(CommandError::resource_not_found(
            "config file",
            full_path.display(),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &full_path.to_string_lossy()])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("config file", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&full_path)
            .spawn()
            .map_err(|e| {
                CommandError::ResourceNotFound(format!("Failed to open config file: {}", e))
            })?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&full_path)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("config file", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn load_config_content(config_path: String) -> Result<Value, CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
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
    let sub_dir = crate::config::paths::get_sub_dir()?;
    let full_path = sub_dir.join(&config_path);

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
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("URL", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("URL", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| CommandError::resource_not_found("URL", e))?;
    }

    Ok(())
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

#[tauri::command]
pub async fn get_clash_api_url(config_path: String) -> Result<Option<String>, CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
    let full_path = sub_dir.join(&config_path);

    if !full_path.exists() {
        return Err(CommandError::resource_not_found(
            "config file",
            full_path.display(),
        ));
    }

    let content = fs::read_to_string(&full_path)
        .map_err(|e| CommandError::resource_not_found("config file", e))?;

    let mut config: Value = serde_json::from_str(&content)
        .map_err(|e| CommandError::json("failed to parse config JSON", e))?;

    if let Ok(Some(override_config)) = crate::config::get_override_config_if_enabled().await {
        crate::config::apply_config_override(&mut config, &override_config);
    }

    Ok(extract_clash_api_url(&config))
}

#[derive(serde::Serialize)]
pub struct FetchSubscriptionResult {
    pub content: String,
    pub file_name: String,
}

fn extract_file_name_from_url(url: &str) -> String {
    let path_part = url.split('?').next().unwrap_or(url);
    let name = path_part.split('/').next_back().unwrap_or("subscription");
    if name.is_empty() {
        return "subscription.json".to_string();
    }
    if name.ends_with(".json") {
        name.to_string()
    } else {
        format!("{}.json", name)
    }
}

#[tauri::command]
pub async fn fetch_subscription(url: String) -> Result<FetchSubscriptionResult, CommandError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(CommandError::validation(
            "Subscription URL must start with http:// or https://",
        ));
    }

    let file_name = extract_file_name_from_url(&url);

    let client = reqwest::Client::builder()
        .user_agent("fresh-box")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| CommandError::network(format!("Failed to create HTTP client: {}", e)))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| CommandError::network(format!("Failed to fetch subscription: {}", e)))?;

    if !response.status().is_success() {
        return Err(CommandError::network(format!(
            "HTTP error {}",
            response.status()
        )));
    }

    let content = response.text().await.map_err(|e| {
        CommandError::network(format!("Failed to read subscription content: {}", e))
    })?;

    Ok(FetchSubscriptionResult { content, file_name })
}
