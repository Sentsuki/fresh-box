// 用户自定义的配置覆盖层。**合并逻辑**在这里，**存储**在 `store::settings`
// （阶段 4 之前是 `config_override.json`）。

use crate::errors::CommandError;
use crate::store::{Store, settings};
use serde_json::{Value, json};

const KEY_OVERRIDE: &str = "configOverride";

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

fn load_override(store: &Store) -> Result<OverrideConfig, CommandError> {
    settings::get_or_default(store, settings::SCOPE_APP, KEY_OVERRIDE)
}

fn save_override(store: &Store, value: &OverrideConfig) -> Result<(), CommandError> {
    settings::set(store, settings::SCOPE_APP, KEY_OVERRIDE, value)
}

pub(crate) fn enable_config_override_inner(store: &Store) -> Result<(), CommandError> {
    let mut override_config = load_override(store)?;
    override_config.enabled = true;
    save_override(store, &override_config)?;
    Ok(())
}

pub(crate) fn disable_config_override_inner(store: &Store) -> Result<(), CommandError> {
    let mut override_config = load_override(store)?;
    override_config.enabled = false;
    save_override(store, &override_config)?;
    Ok(())
}

pub(crate) fn save_config_override_inner(store: &Store, config: Value) -> Result<(), CommandError> {
    let mut override_config = load_override(store)?;
    override_config.config = config;
    save_override(store, &override_config)?;
    Ok(())
}

pub(crate) fn clear_config_override_inner(store: &Store) -> Result<(), CommandError> {
    let mut override_config = load_override(store)?;
    override_config.config = json!({});
    save_override(store, &override_config)?;
    Ok(())
}

pub(crate) fn load_config_override_inner(store: &Store) -> Result<Value, CommandError> {
    let override_config = load_override(store)?;
    Ok(override_config.config)
}

pub(crate) fn is_config_override_enabled_inner(store: &Store) -> Result<bool, CommandError> {
    let override_config = load_override(store)?;
    Ok(override_config.enabled)
}

pub fn apply_config_override(base_config: &mut Value, override_config: &Value) {
    if let Some(obj) = base_config.as_object_mut()
        && let Some(override_obj) = override_config.as_object()
    {
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

pub fn get_override_config_if_enabled(store: &Store) -> Result<Option<Value>, CommandError> {
    let override_config = load_override(store)?;
    if override_config.enabled {
        Ok(Some(override_config.config))
    } else {
        Ok(None)
    }
}
