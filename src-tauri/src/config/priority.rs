use crate::errors::CommandError;
use rand::RngExt as _;
use serde_json::{Value, json};

const PRIORITY_CONFIG_FILE: &str = "priority_config.json";

pub const DEFAULT_CLASH_CONTROLLER: &str = "127.0.0.1:8964";
pub const DEFAULT_CLASH_SECRET: &str = "UV;.#DyQP4)a:P.wFq?cU9lPz:sj";
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct ExperimentalConfig {
    pub clash_api: Option<ClashApiConfig>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ClashApiConfig {
    pub external_controller: Option<String>,
    pub secret: Option<String>,
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
    pub experimental: ExperimentalConfig,
}

pub(crate) fn save_priority_config_inner(config: PriorityConfig) -> Result<(), CommandError> {
    super::io::save_named_config(PRIORITY_CONFIG_FILE, &config)
}

pub(crate) fn load_priority_config_inner() -> Result<PriorityConfig, CommandError> {
    super::io::load_named_config_or_default(PRIORITY_CONFIG_FILE)
}

pub(crate) fn clear_priority_config_inner() -> Result<(), CommandError> {
    super::io::remove_named_config(PRIORITY_CONFIG_FILE)
}

pub fn ensure_priority_config_initialized() {
    let config_dir = match super::paths::get_config_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!(
                "ensure_priority_config_initialized: failed to get config dir: {:?}",
                e
            );
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
        experimental: ExperimentalConfig {
            clash_api: Some(ClashApiConfig {
                external_controller: Some(DEFAULT_CLASH_CONTROLLER.to_string()),
                secret: Some(DEFAULT_CLASH_SECRET.to_string()),
            }),
        },
    };

    if let Err(e) = super::io::save_named_config(PRIORITY_CONFIG_FILE, &default_config) {
        eprintln!(
            "ensure_priority_config_initialized: failed to write defaults: {:?}",
            e
        );
    } else {
        println!("priority_config.json initialized with defaults.");
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

    let config_dir = super::paths::get_config_dir()?;
    let override_path = config_dir.join("config_override.json");

    if override_path.exists()
        && let Ok(override_content) = fs::read_to_string(&override_path)
        && let Ok(override_config) = serde_json::from_str::<Value>(&override_content)
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

const DEFAULT_TEST_URL: &str = "https://www.gstatic.com/generate_204";

#[derive(serde::Serialize)]
pub struct CoreClientConfig {
    pub http_url: String,
    pub ws_url: String,
    pub secret: String,
    pub test_url: String,
}

pub(crate) fn get_core_client_config_inner() -> Result<CoreClientConfig, CommandError> {
    let config: PriorityConfig = super::io::load_named_config_or_default(PRIORITY_CONFIG_FILE)?;
    let app_settings = super::app_settings::load_app_settings_file()?;

    let clash_api = config.experimental.clash_api.as_ref();

    let controller = clash_api
        .and_then(|c| c.external_controller.as_deref())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLASH_CONTROLLER);

    let secret = clash_api
        .and_then(|c| c.secret.as_deref())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLASH_SECRET);

    let test_url = app_settings.settings.test_url.as_str();

    Ok(CoreClientConfig {
        http_url: format!("http://{}", controller),
        ws_url: format!("ws://{}", controller),
        secret: secret.to_string(),
        test_url: if test_url.is_empty() {
            DEFAULT_TEST_URL.to_string()
        } else {
            test_url.to_string()
        },
    })
}

pub(crate) fn generate_random_port_inner() -> Result<u16, CommandError> {
    let port: u16 = rand::rng().random_range(10000..=65535);
    Ok(port)
}

pub(crate) fn generate_random_secret_inner() -> Result<String, CommandError> {
    const UPPER: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const LOWER: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
    const DIGIT: &[u8] = b"0123456789";
    const ALL: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    let mut rng = rand::rng();

    let mut chars = Vec::with_capacity(32);
    
    // 保证各有 3 个
    for _ in 0..3 {
        chars.push(UPPER[rng.random_range(0..UPPER.len())] as char);
    }
    for _ in 0..3 {
        chars.push(LOWER[rng.random_range(0..LOWER.len())] as char);
    }
    for _ in 0..3 {
        chars.push(DIGIT[rng.random_range(0..DIGIT.len())] as char);
    }

    // 补齐剩下的 23 个
    for _ in 0..23 {
        chars.push(ALL[rng.random_range(0..ALL.len())] as char);
    }

    // Fisher-Yates shuffle
    for i in (1..chars.len()).rev() {
        let j = rng.random_range(0..=i);
        chars.swap(i, j);
    }

    let secret: String = chars.into_iter().collect();
    Ok(secret)
}

pub fn apply_priority_config(
    config: &mut Value,
    priority_config: &PriorityConfig,
) -> Result<(), CommandError> {
    if let Some(first) = priority_config.inbounds.first()
        && let Err(e) = apply_stack_config(config, &first.stack)
    {
        eprintln!("Warning: Failed to apply stack config: {:?}", e);
    }

    apply_log_config(config, &priority_config.log)?;

    let clash_api = priority_config
        .experimental
        .clash_api
        .clone()
        .unwrap_or(ClashApiConfig {
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

pub fn apply_log_config(config: &mut Value, log_config: &LogConfig) -> Result<(), CommandError> {
    if config.get("log").is_none() {
        config
            .as_object_mut()
            .ok_or_else(|| CommandError::ResourceNotFound("Invalid config format".to_string()))?
            .insert("log".to_string(), Value::Object(serde_json::Map::new()));
    }

    let log_obj = config
        .get_mut("log")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| {
            CommandError::ResourceNotFound("Invalid log configuration format".to_string())
        })?;

    log_obj.insert("disabled".to_string(), Value::Bool(log_config.disabled));
    log_obj.insert("level".to_string(), Value::String(log_config.level.clone()));

    Ok(())
}

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
