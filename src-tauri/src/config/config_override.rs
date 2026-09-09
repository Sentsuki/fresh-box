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

#[cfg(test)]
mod tests {
    use super::*;

    fn merged(base: serde_json::Value, overlay: serde_json::Value) -> serde_json::Value {
        let mut result = base;
        apply_config_override(&mut result, &overlay);
        result
    }

    #[test]
    fn adds_keys_the_base_does_not_have() {
        let result = merged(json!({ "a": 1 }), json!({ "b": 2 }));
        assert_eq!(result, json!({ "a": 1, "b": 2 }));
    }

    #[test]
    fn overlay_wins_on_scalars() {
        let result = merged(json!({ "level": "info" }), json!({ "level": "debug" }));
        assert_eq!(result, json!({ "level": "debug" }));
    }

    #[test]
    fn objects_merge_recursively_rather_than_being_replaced() {
        // 这是这个函数最容易被误解的地方：覆盖 `log.level` 不该把 `log.disabled`
        // 一起抹掉。整体替换的话用户想改一个字段就得把整块抄一遍。
        let result = merged(
            json!({ "log": { "disabled": false, "level": "info" } }),
            json!({ "log": { "level": "debug" } }),
        );
        assert_eq!(
            result,
            json!({ "log": { "disabled": false, "level": "debug" } })
        );
    }

    #[test]
    fn arrays_are_replaced_wholesale_not_merged() {
        // 数组按整体替换 —— 逐元素合并对 `inbounds`/`outbounds` 这种没有意义
        // （第 0 个 inbound 和第 0 个覆盖项没有任何对应关系）。
        let result = merged(
            json!({ "dns": { "servers": ["a", "b"] } }),
            json!({ "dns": { "servers": ["c"] } }),
        );
        assert_eq!(result, json!({ "dns": { "servers": ["c"] } }));
    }

    #[test]
    fn a_scalar_can_replace_an_object_and_vice_versa() {
        assert_eq!(
            merged(json!({ "x": { "y": 1 } }), json!({ "x": 5 })),
            json!({ "x": 5 })
        );
        assert_eq!(
            merged(json!({ "x": 5 }), json!({ "x": { "y": 1 } })),
            json!({ "x": { "y": 1 } })
        );
    }

    #[test]
    fn an_empty_overlay_changes_nothing() {
        let base = json!({ "log": { "level": "info" }, "inbounds": [1, 2] });
        assert_eq!(merged(base.clone(), json!({})), base);
    }

    #[test]
    fn a_non_object_base_is_left_alone() {
        // 防御性：配置理应是对象，但传进来别的东西时不该 panic。
        assert_eq!(merged(json!([1, 2]), json!({ "a": 1 })), json!([1, 2]));
    }
}
