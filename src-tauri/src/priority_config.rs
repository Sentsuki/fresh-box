use crate::errors::CommandError;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

const PRIORITY_CONFIG_FILE: &str = "priority_config.json";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct PriorityConfig {
    pub stack: Option<String>, // 直接存储 stack 值: "mixed", "gvisor", "system"
    pub log: Option<LogConfig>,
    // 未来可以添加其他高优先级配置选项
    // pub dns: Option<DnsConfig>,
    // pub routing: Option<RoutingConfig>,
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

fn get_priority_config_path() -> Result<PathBuf, CommandError> {
    let bin_dir = super::config::get_bin_dir()?;
    Ok(bin_dir.join(PRIORITY_CONFIG_FILE))
}

#[tauri::command]
pub async fn save_priority_config(config: PriorityConfig) -> Result<(), CommandError> {
    let config_path = get_priority_config_path()?;
    let config_str = serde_json::to_string_pretty(&config)?;
    fs::write(&config_path, config_str)?;
    Ok(())
}

#[tauri::command]
pub async fn load_priority_config() -> Result<PriorityConfig, CommandError> {
    let config_path = get_priority_config_path()?;
    if !config_path.exists() {
        return Ok(PriorityConfig::default());
    }

    let config_str = fs::read_to_string(&config_path)?;
    let config: PriorityConfig = serde_json::from_str(&config_str)?;
    Ok(config)
}

#[tauri::command]
pub async fn clear_priority_config() -> Result<(), CommandError> {
    let config_path = get_priority_config_path()?;
    if config_path.exists() {
        fs::remove_file(&config_path)?;
    }
    Ok(())
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
    let bin_dir = super::config::get_bin_dir()?;
    let override_path = bin_dir.join("config_override.json");

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

    // 未来可以在这里添加其他配置的应用逻辑
    // if let Some(dns_config) = &priority_config.dns {
    //     apply_dns_config(config, dns_config)?;
    // }

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
