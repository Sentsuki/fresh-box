use crate::errors::CommandError;
use serde_json::{Value, json};

pub(crate) const PRIORITY_CONFIG_FILE: &str = "priority_config.json";

pub const DEFAULT_STACK: &str = "mixed";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct PriorityConfig {
    pub inbounds: Vec<PriorityInbound>,
    pub log: LogConfig,
}

pub(crate) fn save_priority_config_inner(config: PriorityConfig) -> Result<(), CommandError> {
    super::io::save_named_config(PRIORITY_CONFIG_FILE, &config)
}

pub(crate) fn load_priority_config_inner() -> Result<PriorityConfig, CommandError> {
    super::io::load_named_config_or_default(PRIORITY_CONFIG_FILE)
}

pub fn ensure_priority_config_initialized() {
    let config_dir = match super::paths::get_config_dir() {
        Ok(dir) => dir,
        Err(e) => {
            tracing::warn!(error = ?e, "ensure_priority_config_initialized: failed to get config dir");
            return;
        }
    };

    let path = config_dir.join(PRIORITY_CONFIG_FILE);
    if path.exists() {
        return;
    }

    let default_config = PriorityConfig {
        inbounds: vec![PriorityInbound {
            stack: DEFAULT_STACK.to_string(),
        }],
        log: LogConfig::default(),
    };

    if let Err(e) = super::io::save_named_config(PRIORITY_CONFIG_FILE, &default_config) {
        tracing::warn!(error = ?e, "ensure_priority_config_initialized: failed to write defaults");
    } else {
        tracing::info!("priority_config.json initialized with defaults");
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ConfigFieldsCheck {
    pub has_stack_field: bool,
    pub has_log_field: bool,
    pub current_stack_value: Option<String>,
    pub current_log_disabled: Option<bool>,
    pub current_log_level: Option<String>,
}

pub(crate) fn check_config_fields_inner(
    config_path: String,
) -> Result<ConfigFieldsCheck, CommandError> {
    use std::fs;

    let config_content = fs::read_to_string(&config_path)?;
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
        super::config_override::is_config_override_enabled_inner().unwrap_or(false);
    if override_enabled
        && let Ok(override_config) = super::config_override::load_config_override_inner()
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
) -> Result<(), CommandError> {
    if let Some(first) = priority_config.inbounds.first()
        && let Err(e) = apply_stack_config(config, &first.stack)
    {
        tracing::warn!(error = ?e, "failed to apply stack config");
    }

    apply_log_config(config, &priority_config.log)?;

    if let Err(error) = apply_clash_api_config(config) {
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
pub fn apply_clash_api_config(config: &mut Value) -> Result<(), CommandError> {
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

    experimental.insert(
        "clash_api".to_string(),
        json!({
            "external_controller": "",
            "default_mode": "Rule"
        }),
    );

    Ok(())
}
