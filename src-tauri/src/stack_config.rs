use crate::errors::CommandError;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

const STACK_CONFIG_FILE: &str = "stack_config.json";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct StackConfig {
    pub enabled: bool,
    pub stack_option: String, // "mixed", "gvisor", "system"
}

impl Default for StackConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            stack_option: "mixed".to_string(),
        }
    }
}

fn get_stack_config_path() -> Result<PathBuf, CommandError> {
    let bin_dir = super::config::get_bin_dir()?;
    Ok(bin_dir.join(STACK_CONFIG_FILE))
}

#[tauri::command]
pub async fn save_stack_config(config: StackConfig) -> Result<(), CommandError> {
    let config_path = get_stack_config_path()?;
    let config_str = serde_json::to_string_pretty(&config)?;
    fs::write(&config_path, config_str)?;
    Ok(())
}

#[tauri::command]
pub async fn load_stack_config() -> Result<StackConfig, CommandError> {
    let config_path = get_stack_config_path()?;
    if !config_path.exists() {
        return Ok(StackConfig::default());
    }

    let config_str = fs::read_to_string(&config_path)?;
    let config: StackConfig = serde_json::from_str(&config_str)?;
    Ok(config)
}

#[tauri::command]
pub async fn clear_stack_config() -> Result<(), CommandError> {
    let config_path = get_stack_config_path()?;
    if config_path.exists() {
        fs::remove_file(&config_path)?;
    }
    Ok(())
}

// 应用 stack 配置到配置对象
// 这个函数会在 Config Override 之后调用，确保优先级更高
pub fn apply_stack_config(config: &mut Value, stack_config: &StackConfig) -> Result<(), CommandError> {
    if !stack_config.enabled {
        return Ok(());
    }

    // 检查配置中是否有 inbounds 数组
    if let Some(inbounds) = config.get_mut("inbounds") {
        if let Some(inbounds_array) = inbounds.as_array_mut() {
            let mut found_stack = false;
            
            // 遍历 inbounds 数组，查找包含 stack 字段的对象
            for inbound in inbounds_array.iter_mut() {
                if let Some(inbound_obj) = inbound.as_object_mut() {
                    if inbound_obj.contains_key("stack") {
                        inbound_obj.insert(
                            "stack".to_string(), 
                            Value::String(stack_config.stack_option.clone())
                        );
                        found_stack = true;
                    }
                }
            }
            
            if !found_stack {
                return Err(CommandError::ResourceNotFound(
                    "No stack field found in inbounds configuration".to_string()
                ));
            }
        }
    } else {
        return Err(CommandError::ResourceNotFound(
            "No inbounds configuration found".to_string()
        ));
    }

    Ok(())
}

// 检查配置中是否存在 stack 字段
pub fn has_stack_field(config: &Value) -> bool {
    if let Some(inbounds) = config.get("inbounds") {
        if let Some(inbounds_array) = inbounds.as_array() {
            return inbounds_array.iter().any(|inbound| {
                if let Some(inbound_obj) = inbound.as_object() {
                    inbound_obj.contains_key("stack")
                } else {
                    false
                }
            });
        }
    }
    false
}

// 获取当前配置中的 stack 值
pub fn get_current_stack_value(config: &Value) -> Option<String> {
    if let Some(inbounds) = config.get("inbounds") {
        if let Some(inbounds_array) = inbounds.as_array() {
            for inbound in inbounds_array {
                if let Some(inbound_obj) = inbound.as_object() {
                    if let Some(stack_value) = inbound_obj.get("stack") {
                        if let Some(stack_str) = stack_value.as_str() {
                            return Some(stack_str.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}