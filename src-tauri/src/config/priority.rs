// fresh-box 自己的运行要求（TUN 栈、日志级别、必须存在的 clash_api 块）。
// **应用逻辑**在这里，**存储**在 `store::settings`（阶段 4 之前是
// `priority_config.json`）。

use crate::errors::CommandError;
use crate::store::{Store, settings};
use serde_json::Value;

const KEY_PRIORITY: &str = "priorityConfig";

pub const DEFAULT_STACK: &str = "mixed";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, specta::Type)]
pub struct PriorityInbound {
    pub stack: String,
}

impl Default for PriorityInbound {
    fn default() -> Self {
        Self {
            stack: DEFAULT_STACK.to_string(),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, specta::Type)]
pub struct LogConfig {
    pub disabled: bool,
    pub level: String,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            disabled: true,
            level: "info".to_string(),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, specta::Type)]
pub struct PriorityConfig {
    pub inbounds: Vec<PriorityInbound>,
    pub log: LogConfig,
}

pub(crate) fn save_priority_config_inner(
    store: &Store,
    config: PriorityConfig,
) -> Result<(), CommandError> {
    settings::set(store, settings::SCOPE_APP, KEY_PRIORITY, &config)
}

pub(crate) fn load_priority_config_inner(store: &Store) -> Result<PriorityConfig, CommandError> {
    settings::get_or_default(store, settings::SCOPE_APP, KEY_PRIORITY)
}


#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
pub struct ConfigFieldsCheck {
    pub has_stack_field: bool,
    pub has_log_field: bool,
    pub current_stack_value: Option<String>,
    pub current_log_disabled: Option<bool>,
    pub current_log_level: Option<String>,
}

pub(crate) fn check_config_fields_inner(
    store: &Store,
    profile_id: &str,
) -> Result<ConfigFieldsCheck, CommandError> {
    let config_content = crate::store::profiles::read_content(store, profile_id)?;
    let config: Value = serde_json::from_str(&config_content)?;

    let mut result = ConfigFieldsCheck {
        has_stack_field: false,
        has_log_field: false,
        current_stack_value: None,
        current_log_disabled: None,
        current_log_level: None,
    };

    if let Some(inbounds) = config.get("inbounds")
        && let Some(inbounds_array) = inbounds.as_array()
    {
        for inbound in inbounds_array {
            if let Some(inbound_obj) = inbound.as_object()
                && let Some(stack_value) = inbound_obj.get("stack")
            {
                result.has_stack_field = true;
                if let Some(stack_str) = stack_value.as_str() {
                    result.current_stack_value = Some(stack_str.to_string());
                }
                break;
            }
        }
    }

    if let Some(log_obj) = config.get("log")
        && log_obj.is_object()
    {
        result.has_log_field = true;
        if let Some(disabled_value) = log_obj.get("disabled") {
            result.current_log_disabled = disabled_value.as_bool();
        }
        if let Some(level_value) = log_obj.get("level")
            && let Some(level_str) = level_value.as_str()
        {
            result.current_log_level = Some(level_str.to_string());
        }
    }

    // Fall back to the override config for fields not present in the main config.
    // Reuse the existing abstraction rather than reading the file directly.
    let override_enabled =
        super::config_override::is_config_override_enabled_inner(store).unwrap_or(false);
    if override_enabled
        && let Ok(override_config) = super::config_override::load_config_override_inner(store)
    {
        if !result.has_stack_field
            && let Some(override_inbounds) = override_config.get("inbounds")
            && let Some(override_inbounds_array) = override_inbounds.as_array()
        {
            for inbound in override_inbounds_array {
                if let Some(inbound_obj) = inbound.as_object()
                    && let Some(stack_value) = inbound_obj.get("stack")
                {
                    result.has_stack_field = true;
                    if let Some(stack_str) = stack_value.as_str() {
                        result.current_stack_value = Some(stack_str.to_string());
                    }
                    break;
                }
            }
        }

        if !result.has_log_field
            && let Some(override_log_obj) = override_config.get("log")
            && override_log_obj.is_object()
        {
            result.has_log_field = true;
            if let Some(disabled_value) = override_log_obj.get("disabled") {
                result.current_log_disabled = disabled_value.as_bool();
            }
            if let Some(level_value) = override_log_obj.get("level")
                && let Some(level_str) = level_value.as_str()
            {
                result.current_log_level = Some(level_str.to_string());
            }
        }
    }

    Ok(result)
}

/// Applies fresh-box's own app-level settings (TUN stack choice, log
/// verbosity, the always-on internal `clash_api` stanza) on top of whatever
/// config content is already in `config` at this point — which, by the time
/// `services::singbox::build_config_content` calls this, may itself already
/// have a user-supplied config override layered in. That order (override
/// first, priority config always applied after and last) is deliberate and
/// not meant to change: priority config represents fresh-box's own
/// operational requirements (the daemon needs `experimental.clash_api`
/// present at all — see `apply_clash_api_config`'s doc comment — regardless
/// of anything the user's override says), so it has to win any conflict
/// with user-authored content, not the other way around.
///
/// Each field is applied independently and a failure on one (e.g. no
/// `inbounds` array for the stack setting to attach to) doesn't stop the
/// others from being attempted — logged via `tracing::warn!` rather than
/// silently dropped, so a misapplied setting shows up in the log file
/// instead of just quietly not taking effect.
pub fn apply_priority_config(
    config: &mut Value,
    priority_config: &PriorityConfig,
    default_mode: Option<&str>,
) -> Result<(), CommandError> {
    if let Some(first) = priority_config.inbounds.first()
        && let Err(e) = apply_stack_config(config, &first.stack)
    {
        tracing::warn!(error = ?e, "failed to apply stack config");
    }

    apply_log_config(config, &priority_config.log)?;

    if let Err(error) = apply_clash_api_config(config, default_mode) {
        tracing::warn!(error = ?error, "failed to apply clash_api configuration");
    }

    Ok(())
}

pub fn apply_stack_config(config: &mut Value, stack_value: &str) -> Result<(), CommandError> {
    if let Some(inbounds) = config.get_mut("inbounds") {
        if let Some(inbounds_array) = inbounds.as_array_mut() {
            let mut found_stack = false;

            for inbound in inbounds_array.iter_mut() {
                if let Some(inbound_obj) = inbound.as_object_mut()
                    && inbound_obj.contains_key("stack")
                {
                    inbound_obj.insert("stack".to_string(), Value::String(stack_value.to_string()));
                    found_stack = true;
                }
            }

            if !found_stack {
                return Err(CommandError::resource_not_found(
                    "inbounds configuration",
                    "no stack field found",
                ));
            }
        }
    } else {
        return Err(CommandError::resource_not_found(
            "config",
            "no inbounds configuration found",
        ));
    }

    Ok(())
}

pub fn apply_log_config(config: &mut Value, log_config: &LogConfig) -> Result<(), CommandError> {
    if config.get("log").is_none() {
        config
            .as_object_mut()
            .ok_or_else(|| {
                CommandError::invalid_state("apply_log_config", "invalid config format")
            })?
            .insert("log".to_string(), Value::Object(serde_json::Map::new()));
    }

    let log_obj = config
        .get_mut("log")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| {
            CommandError::invalid_state("apply_log_config", "invalid log configuration format")
        })?;

    log_obj.insert("disabled".to_string(), Value::Bool(log_config.disabled));
    log_obj.insert("level".to_string(), Value::String(log_config.level.clone()));

    Ok(())
}

/// Always injects a `clash_api` stanza with no `external_controller` (empty
/// address = sing-box never binds an HTTP listener for it — see
/// `experimental/clashapi/server.go` upstream: `externalController:
/// options.ExternalController != ""`). fresh-box doesn't talk to sing-box
/// over that HTTP API at all anymore (see `daemon_control.rs`), but boxdd's
/// gRPC `StartedService` (groups, clash mode, URL test, connections) is
/// itself backed by the same internal `adapter.ClashServer` object, which
/// only gets constructed when `experimental.clash_api` is present in the
/// config — so this block still needs to exist, just with nothing exposed
/// over the network. Not user-configurable: there's no controller/secret
/// left for a user to usefully set.
pub fn apply_clash_api_config(
    config: &mut Value,
    default_mode: Option<&str>,
) -> Result<(), CommandError> {
    if config.get("experimental").is_none() {
        config
            .as_object_mut()
            .ok_or_else(|| {
                CommandError::invalid_state("apply_clash_api_config", "invalid config format")
            })?
            .insert(
                "experimental".to_string(),
                Value::Object(serde_json::Map::new()),
            );
    }

    let experimental = config
        .get_mut("experimental")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| {
            CommandError::invalid_state(
                "apply_clash_api_config",
                "invalid experimental config format",
            )
        })?;

    // `default_mode` 只在确实知道用户上次选了什么时才写。
    //
    // 以前这里无条件写死 `"Rule"`，于是用户切到 Global、重启一次就被打回 Rule
    // （审计项 M-09）。当前模式由 `SubscribeClashMode` 推送并存进 `settings`
    // 表，启动时回填 —— daemon 仍是运行期唯一真相源，我们只是把它上次说的话
    // 记住了。
    let mut clash_api = serde_json::Map::new();
    clash_api.insert("external_controller".to_string(), Value::String(String::new()));
    if let Some(mode) = default_mode.filter(|m| !m.is_empty()) {
        clash_api.insert("default_mode".to_string(), Value::String(mode.to_string()));
    }
    experimental.insert("clash_api".to_string(), Value::Object(clash_api));

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn priority(stack: &str, log_disabled: bool, level: &str) -> PriorityConfig {
        PriorityConfig {
            inbounds: vec![PriorityInbound {
                stack: stack.to_string(),
            }],
            log: LogConfig {
                disabled: log_disabled,
                level: level.to_string(),
            },
        }
    }

    // ── clash_api ────────────────────────────────────────────────────────

    #[test]
    fn clash_api_is_always_injected_with_no_external_controller() {
        // 这一块是**技术必需**，不是可选项：boxdd 的 `StartedService`（代理组、
        // Clash 模式、测速、连接）全都建立在内部的 `adapter.ClashServer` 对象
        // 上，而那个对象只在配置里存在 `experimental.clash_api` 时才会被构造。
        // `external_controller` 留空 = 不监听任何 HTTP 端口
        // （`experimental/clashapi/server.go`）。
        let mut config = json!({});
        apply_clash_api_config(&mut config, None).unwrap();
        assert_eq!(config["experimental"]["clash_api"]["external_controller"], "");
    }

    #[test]
    fn default_mode_is_omitted_when_unknown() {
        // 以前这里无条件写死 `"Rule"`，用户切到 Global 重启一次就被打回
        // （审计项 M-09）。不知道上次选了什么就干脆不写这个字段。
        let mut config = json!({});
        apply_clash_api_config(&mut config, None).unwrap();
        assert!(
            config["experimental"]["clash_api"].get("default_mode").is_none(),
            "must not invent a default_mode"
        );
    }

    #[test]
    fn default_mode_is_written_back_when_known() {
        let mut config = json!({});
        apply_clash_api_config(&mut config, Some("global")).unwrap();
        assert_eq!(config["experimental"]["clash_api"]["default_mode"], "global");
    }

    #[test]
    fn an_empty_remembered_mode_counts_as_unknown() {
        let mut config = json!({});
        apply_clash_api_config(&mut config, Some("")).unwrap();
        assert!(config["experimental"]["clash_api"].get("default_mode").is_none());
    }

    #[test]
    fn existing_experimental_siblings_survive() {
        let mut config = json!({ "experimental": { "cache_file": { "enabled": true } } });
        apply_clash_api_config(&mut config, None).unwrap();
        assert_eq!(config["experimental"]["cache_file"]["enabled"], true);
        assert!(config["experimental"]["clash_api"].is_object());
    }

    // ── log ──────────────────────────────────────────────────────────────

    #[test]
    fn log_settings_overwrite_whatever_the_profile_said() {
        let mut config = json!({ "log": { "disabled": false, "level": "trace", "output": "x.log" } });
        apply_log_config(&mut config, &LogConfig { disabled: true, level: "warn".into() }).unwrap();
        assert_eq!(config["log"]["disabled"], true);
        assert_eq!(config["log"]["level"], "warn");
        // 只覆盖这两个键，别的保留。
        assert_eq!(config["log"]["output"], "x.log");
    }

    #[test]
    fn log_block_is_created_when_absent() {
        let mut config = json!({});
        apply_log_config(&mut config, &LogConfig { disabled: false, level: "info".into() }).unwrap();
        assert_eq!(config["log"]["level"], "info");
    }

    // ── stack ────────────────────────────────────────────────────────────

    #[test]
    fn stack_is_applied_only_to_inbounds_that_already_declare_one() {
        // 只改已经写了 `stack` 的 inbound —— 给一个 mixed 入站硬塞 `stack`
        // 字段会让配置非法。
        let mut config = json!({
            "inbounds": [
                { "type": "mixed", "listen": "127.0.0.1" },
                { "type": "tun", "stack": "system" }
            ]
        });
        apply_stack_config(&mut config, "gvisor").unwrap();
        assert!(config["inbounds"][0].get("stack").is_none());
        assert_eq!(config["inbounds"][1]["stack"], "gvisor");
    }

    #[test]
    fn no_stack_field_anywhere_is_an_error_the_caller_logs() {
        // `apply_priority_config` 把它降级成一条 warn 而不是让启动失败 ——
        // 用户的配置没有 TUN 入站是完全合法的。
        let mut config = json!({ "inbounds": [{ "type": "mixed" }] });
        assert!(apply_stack_config(&mut config, "mixed").is_err());
    }

    // ── 整体 ──────────────────────────────────────────────────────────────

    #[test]
    fn one_failing_field_does_not_block_the_others() {
        // 没有 TUN 入站 → stack 那步失败，但 log 和 clash_api 仍必须生效，
        // 否则 sing-box 起来之后代理页整个是空的。
        let mut config = json!({ "inbounds": [{ "type": "mixed" }] });
        apply_priority_config(&mut config, &priority("gvisor", true, "error"), Some("rule")).unwrap();
        assert_eq!(config["log"]["disabled"], true);
        assert_eq!(config["log"]["level"], "error");
        assert_eq!(config["experimental"]["clash_api"]["default_mode"], "rule");
    }
}
