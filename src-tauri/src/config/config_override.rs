use crate::errors::CommandError;
use serde_json::{json, Value};

const OVERRIDE_CONFIG_FILE: &str = "config_override.json";

#[derive(serde::Serialize, serde::Deserialize)]
struct OverrideConfig {
    enabled: bool,
    config: Value,
}

impl Default for OverrideConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            config: json!({}),
        }
    }
}

fn load_override_file() -> Result<OverrideConfig, CommandError> {
    super::io::load_named_config_or_default(OVERRIDE_CONFIG_FILE)
}

fn save_override_file(override_config: &OverrideConfig) -> Result<(), CommandError> {
    super::io::save_named_config(OVERRIDE_CONFIG_FILE, override_config)
}

pub(crate) fn enable_config_override_inner() -> Result<(), CommandError> {
    let mut override_config = load_override_file()?;
    override_config.enabled = true;
    save_override_file(&override_config)?;
    Ok(())
}

pub(crate) fn disable_config_override_inner() -> Result<(), CommandError> {
    let mut override_config = load_override_file()?;
    override_config.enabled = false;
    save_override_file(&override_config)?;
    Ok(())
}

pub(crate) fn save_config_override_inner(config: Value) -> Result<(), CommandError> {
    let mut override_config = load_override_file()?;
    override_config.config = config;
    save_override_file(&override_config)?;
    Ok(())
}

pub(crate) fn clear_config_override_inner() -> Result<(), CommandError> {
    let mut override_config = load_override_file()?;
    override_config.config = json!({});
    save_override_file(&override_config)?;
    Ok(())
}

pub(crate) fn load_config_override_inner() -> Result<Value, CommandError> {
    let override_config = load_override_file()?;
    Ok(override_config.config)
}

pub(crate) fn is_config_override_enabled_inner() -> Result<bool, CommandError> {
    let override_config = load_override_file()?;
    Ok(override_config.enabled)
}

pub fn apply_config_override(base_config: &mut Value, override_config: &Value) {
    if let Some(obj) = base_config.as_object_mut()
        && let Some(override_obj) = override_config.as_object() {
            for (key, value) in override_obj {
                if let Some(existing_value) = obj.get_mut(key) {
                    if existing_value.is_object() && value.is_object() {
                        apply_config_override(existing_value, value);
                    } else {
                        obj[key] = value.clone();
                    }
                } else {
                    obj.insert(key.clone(), value.clone());
                }
            }
        }
}

pub async fn get_override_config_if_enabled() -> Result<Option<Value>, CommandError> {
    let override_config = load_override_file()?;
    if override_config.enabled {
        Ok(Some(override_config.config))
    } else {
        Ok(None)
    }
}
