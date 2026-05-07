use crate::errors::CommandError;
use serde_json::{json, Value};
use rand::Rng;
const PRIORITY_CONFIG_FILE: &str = "priority_config.json";

pub const DEFAULT_CLASH_CONTROLLER: &str = "127.0.0.1:51385";
pub const DEFAULT_CLASH_SECRET: &str = "~1]<R]:4db~4R)__EP4TN5dkLjob;9";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ClashApiConfig {
    pub external_controller: Option<String>,
    pub secret: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct PriorityConfig {
    pub stack: Option<String>, // 直接存储 stack 值: "mixed", "gvisor", "system"
    pub log: Option<LogConfig>,
    pub clash_api: Option<ClashApiConfig>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct LogConfig {
    pub disabled: bool, // log.disabled
    pub level: String,  // "trace", "debug", "info", "warn", "error", "fatal", "panic"
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            disabled: false,
            level: "info".to_string(),
        }
    }
}

#[tauri::command]
pub async fn save_priority_config(config: PriorityConfig) -> Result<(), CommandError> {
    super::config::save_named_config(PRIORITY_CONFIG_FILE, &config)
}

#[tauri::command]
pub async fn load_priority_config() -> Result<PriorityConfig, CommandError> {
    super::config::load_named_config_or_default(PRIORITY_CONFIG_FILE)
}

#[tauri::command]
pub async fn clear_priority_config() -> Result<(), CommandError> {
    super::config::remove_named_config(PRIORITY_CONFIG_FILE)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ConfigFieldsCheck {
    pub has_stack_field: bool,
    pub has_log_field: bool,
    pub current_stack_value: Option<String>,
    pub current_log_disabled: Option<bool>,
    pub current_log_level: Option<String>,
}

#[tauri::command]
pub async fn check_config_fields(config_path: String) -> Result<ConfigFieldsCheck, CommandError> {
    use std::fs;

    // 读取原始配置文件
    let config_content = fs::read_to_string(&config_path)?;
    let config: Value = serde_json::from_str(&config_content)?;

    let mut result = ConfigFieldsCheck {
        has_stack_field: false,
        has_log_field: false,
        current_stack_value: None,
        current_log_disabled: None,
        current_log_level: None,
    };

    // 检查原始配置文件中的 stack 字段
    if let Some(inbounds) = config.get("inbounds") {
        if let Some(inbounds_array) = inbounds.as_array() {
            for inbound in inbounds_array {
                if let Some(inbound_obj) = inbound.as_object() {
                    if let Some(stack_value) = inbound_obj.get("stack") {
                        result.has_stack_field = true;
                        if let Some(stack_str) = stack_value.as_str() {
                            result.current_stack_value = Some(stack_str.to_string());
                        }
                        break;
                    }
                }
            }
        }
    }

    // 检查原始配置文件中的 log 字段
    if let Some(log_obj) = config.get("log") {
        if log_obj.is_object() {
            result.has_log_field = true;

            // 获取当前的 disabled 值
            if let Some(disabled_value) = log_obj.get("disabled") {
                result.current_log_disabled = disabled_value.as_bool();
            }

            // 获取当前的 level 值
            if let Some(level_value) = log_obj.get("level") {
                if let Some(level_str) = level_value.as_str() {
                    result.current_log_level = Some(level_str.to_string());
                }
            }
        }
    }

    // 检查 Config Override 中的字段
    let config_dir = super::config::get_config_dir()?;
    let override_path = config_dir.join("config_override.json");

    if override_path.exists() {
        if let Ok(override_content) = fs::read_to_string(&override_path) {
            if let Ok(override_config) = serde_json::from_str::<Value>(&override_content) {
                // 检查 Config Override 中的 stack 字段
                if !result.has_stack_field {
                    if let Some(override_inbounds) = override_config.get("inbounds") {
                        if let Some(override_inbounds_array) = override_inbounds.as_array() {
                            for inbound in override_inbounds_array {
                                if let Some(inbound_obj) = inbound.as_object() {
                                    if let Some(stack_value) = inbound_obj.get("stack") {
                                        result.has_stack_field = true;
                                        if let Some(stack_str) = stack_value.as_str() {
                                            result.current_stack_value =
                                                Some(stack_str.to_string());
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // 检查 Config Override 中的 log 字段
                if !result.has_log_field {
                    if let Some(override_log_obj) = override_config.get("log") {
                        if override_log_obj.is_object() {
                            result.has_log_field = true;

                            // 获取当前的 disabled 值
                            if let Some(disabled_value) = override_log_obj.get("disabled") {
                                result.current_log_disabled = disabled_value.as_bool();
                            }

                            // 获取当前的 level 值
                            if let Some(level_value) = override_log_obj.get("level") {
                                if let Some(level_str) = level_value.as_str() {
                                    result.current_log_level = Some(level_str.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(result)
}

// 默认 Clash API 地址和密钥（已在文件顶部声明为 pub const）
const DEFAULT_TEST_URL: &str = "https://www.gstatic.com/generate_204";

#[derive(serde::Serialize)]
pub struct CoreClientConfig {
    pub http_url: String,
    pub ws_url: String,
    pub secret: String,
    pub test_url: String,
}

#[tauri::command]
pub async fn get_core_client_config() -> Result<CoreClientConfig, CommandError> {
    let config: PriorityConfig =
        super::config::load_named_config_or_default(PRIORITY_CONFIG_FILE)?;
    let app_settings = super::config::load_app_settings_file()?;

    let controller = config
        .clash_api
        .as_ref()
        .and_then(|c| c.external_controller.as_deref())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLASH_CONTROLLER);

    let secret = config
        .clash_api
        .as_ref()
        .and_then(|c| c.secret.as_deref())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLASH_SECRET);

    let test_url = app_settings
        .settings
        .test_url
        .as_str();

    Ok(CoreClientConfig {
        http_url: format!("http://{}", controller),
        ws_url: format!("ws://{}", controller),
        secret: secret.to_string(),
        test_url: if test_url.is_empty() { DEFAULT_TEST_URL.to_string() } else { test_url.to_string() },
    })
}

#[tauri::command]
pub async fn generate_random_port() -> Result<u16, CommandError> {
    let port: u16 = rand::thread_rng().gen_range(10000..=65535);
    Ok(port)
}

#[tauri::command]
pub async fn generate_random_secret() -> Result<String, CommandError> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    let secret: String = (0..32)
        .map(|_| {
            let idx = rng.gen_range(0..CHARS.len());
            CHARS[idx] as char
        })
        .collect();
    Ok(secret)
}

// 应用优先级配置到配置对象
// 这个函数会在 Config Override 之后调用，确保优先级更高
pub fn apply_priority_config(
    config: &mut Value,
    priority_config: &PriorityConfig,
) -> Result<(), CommandError> {
    // 应用 stack 配置
    if let Some(stack_value) = &priority_config.stack {
        apply_stack_config(config, stack_value)?;
    }

    // 应用 log 配置
    if let Some(log_config) = &priority_config.log {
        apply_log_config(config, log_config)?;
    }

    // 始终写入 clash_api 配置（使用自定义值或默认值），确保 temp_config 里的值可控
    let clash_api = priority_config.clash_api.clone().unwrap_or(ClashApiConfig {
        external_controller: Some(DEFAULT_CLASH_CONTROLLER.to_string()),
        secret: Some(DEFAULT_CLASH_SECRET.to_string()),
    });
    if let Err(error) = apply_clash_api_config(config, &clash_api) {
        eprintln!(
            "Warning: Failed to apply clash_api configuration: {:?}",
            error
        );
    }

    Ok(())
}

// 应用 stack 配置到配置对象
pub fn apply_stack_config(config: &mut Value, stack_value: &str) -> Result<(), CommandError> {
    // 检查配置中是否有 inbounds 数组
    if let Some(inbounds) = config.get_mut("inbounds") {
        if let Some(inbounds_array) = inbounds.as_array_mut() {
            let mut found_stack = false;

            // 遍历 inbounds 数组，查找包含 stack 字段的对象
            for inbound in inbounds_array.iter_mut() {
                if let Some(inbound_obj) = inbound.as_object_mut() {
                    if inbound_obj.contains_key("stack") {
                        inbound_obj
                            .insert("stack".to_string(), Value::String(stack_value.to_string()));
                        found_stack = true;
                    }
                }
            }

            if !found_stack {
                return Err(CommandError::ResourceNotFound(
                    "No stack field found in inbounds configuration".to_string(),
                ));
            }
        }
    } else {
        return Err(CommandError::ResourceNotFound(
            "No inbounds configuration found".to_string(),
        ));
    }

    Ok(())
}

// 应用 log 配置到配置对象
pub fn apply_log_config(config: &mut Value, log_config: &LogConfig) -> Result<(), CommandError> {
    // 确保配置中有 log 对象
    if config.get("log").is_none() {
        config
            .as_object_mut()
            .ok_or_else(|| CommandError::ResourceNotFound("Invalid config format".to_string()))?
            .insert("log".to_string(), Value::Object(serde_json::Map::new()));
    }

    // 获取 log 对象的可变引用
    let log_obj = config
        .get_mut("log")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| {
            CommandError::ResourceNotFound("Invalid log configuration format".to_string())
        })?;

    // 应用 disabled 设置
    log_obj.insert("disabled".to_string(), Value::Bool(log_config.disabled));

    // 应用 level 设置
    log_obj.insert("level".to_string(), Value::String(log_config.level.clone()));

    Ok(())
}

// 应用 clash_api 配置：无条件覆盖 experimental.clash_api 整节
pub fn apply_clash_api_config(
    config: &mut Value,
    clash_api: &ClashApiConfig,
) -> Result<(), CommandError> {
    let controller = clash_api
        .external_controller
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLASH_CONTROLLER);

    let secret = clash_api
        .secret
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLASH_SECRET);

    // 确保 experimental 对象存在
    if config.get("experimental").is_none() {
        config
            .as_object_mut()
            .ok_or_else(|| CommandError::ResourceNotFound("Invalid config format".to_string()))?
            .insert(
                "experimental".to_string(),
                Value::Object(serde_json::Map::new()),
            );
    }

    let experimental = config
        .get_mut("experimental")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| {
            CommandError::ResourceNotFound("Invalid experimental config format".to_string())
        })?;

    // 完全替换 clash_api 节，不保留原始配置
    experimental.insert(
        "clash_api".to_string(),
        json!({
            "access_control_allow_private_network": false,
            "default_mode": "Rule",
            "external_controller": controller,
            "secret": secret
        }),
    );

    Ok(())
}
