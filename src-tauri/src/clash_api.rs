use crate::errors::CommandError;
use reqwest::Client;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::time::Duration;

const DEFAULT_TEST_URL: &str = "https://www.gstatic.com/generate_204";
const DEFAULT_TEST_TIMEOUT_MS: u64 = 5_000;
const GLOBAL_GROUP_NAME: &str = "GLOBAL";

struct ApiConfig {
    base_url: String,
    secret: String,
    test_url: String,
}

fn get_api_config() -> ApiConfig {
    use crate::priority_config::{PriorityConfig, DEFAULT_CLASH_CONTROLLER, DEFAULT_CLASH_SECRET};
    const PRIORITY_CONFIG_FILE: &str = "priority_config.json";

    let config: PriorityConfig =
        crate::config::load_named_config_or_default(PRIORITY_CONFIG_FILE)
            .unwrap_or_default();
    let app_settings = crate::config::load_app_settings_file().unwrap_or_default();

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
        .test_url
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_TEST_URL);

    ApiConfig {
        base_url: format!("http://{}", controller),
        secret: secret.to_string(),
        test_url: test_url.to_string(),
    }
}

#[derive(Debug, Deserialize)]
struct ClashConfigResponse {
    mode: String,
    #[serde(default, rename = "mode-list")]
    mode_list: Vec<String>,
    #[serde(default)]
    modes: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ClashProxiesResponse {
    proxies: HashMap<String, ClashProxy>,
}

#[derive(Debug, Deserialize)]
struct ClashRulesResponse {
    #[serde(default)]
    rules: Vec<ClashRule>,
}

#[derive(Debug, Deserialize)]
struct ClashRuleProvidersResponse {
    #[serde(default)]
    providers: Option<ClashRuleProviders>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ClashRuleProviders {
    List(Vec<ClashRuleProvider>),
    Map(HashMap<String, ClashRuleProvider>),
}

#[derive(Debug, Deserialize, Clone)]
struct ClashProxy {
    name: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    history: Vec<ClashDelayHistory>,
    #[serde(default)]
    all: Vec<String>,
    #[serde(default)]
    now: String,
    #[serde(default)]
    alive: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ClashDelayHistory {
    time: String,
    delay: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ClashOverview {
    current_mode: String,
    available_modes: Vec<String>,
    proxy_groups: Vec<ClashProxyGroup>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ClashProxyGroup {
    name: String,
    kind: String,
    current: String,
    current_delay: Option<i64>,
    options: Vec<ClashProxyNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ClashProxyNode {
    name: String,
    kind: String,
    delay: Option<i64>,
    alive: Option<bool>,
    is_selected: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClashRuleExtra {
    disabled: Option<bool>,
    hit_at: Option<String>,
    hit_count: Option<u64>,
    miss_at: Option<String>,
    miss_count: Option<u64>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClashRule {
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    payload: String,
    #[serde(default)]
    proxy: String,
    size: Option<i64>,
    uuid: Option<String>,
    disabled: Option<bool>,
    index: Option<usize>,
    extra: Option<ClashRuleExtra>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClashRuleProvider {
    #[serde(default)]
    behavior: String,
    #[serde(default)]
    format: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    rule_count: u64,
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    vehicle_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ClashRulesSnapshot {
    rules: Vec<ClashRule>,
    providers: Vec<ClashRuleProvider>,
}

fn clash_client() -> Result<Client, CommandError> {
    Client::builder()
        .user_agent("fresh-box")
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| {
            CommandError::network(format!(
                "Failed to initialize the Clash API client: {}",
                error
            ))
        })
}

fn build_clash_url(base_url: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

fn map_clash_network_error(context: &str, error: reqwest::Error) -> CommandError {
    if error.is_timeout() {
        return CommandError::network(format!(
            "{}: request timed out. Check whether the core is responsive and try again.",
            context
        ));
    }

    if error.is_connect() {
        let api = get_api_config();
        return CommandError::network(format!(
            "{}: could not connect to the core at {}. Make sure the Clash API is running.",
            context, api.base_url
        ));
    }

    if let Some(status) = error.status() {
        let hint = match status.as_u16() {
            401 | 403 => "core authentication failed. Verify the Clash API secret.",
            404 => "the requested Clash API endpoint is not available.",
            500..=599 => "the core returned an internal server error.",
            _ => "the request failed unexpectedly.",
        };

        return CommandError::network(format!("{}: {} (HTTP {}).", context, hint, status));
    }

    CommandError::network(format!("{}: {}", context, error))
}

async fn clash_get<T>(path: &str, context: &str) -> Result<T, CommandError>
where
    T: DeserializeOwned,
{
    let api = get_api_config();
    let client = clash_client()?;
    let response = client
        .get(build_clash_url(&api.base_url, path))
        .bearer_auth(&api.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error(context, error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error(context, error))?;

    response
        .json::<T>()
        .await
        .map_err(|error| CommandError::network(format!("{}: invalid response: {}", context, error)))
}

async fn clash_patch(
    path: &str,
    payload: serde_json::Value,
    context: &str,
) -> Result<(), CommandError> {
    let api = get_api_config();
    let client = clash_client()?;
    client
        .patch(build_clash_url(&api.base_url, path))
        .bearer_auth(&api.secret)
        .json(&payload)
        .send()
        .await
        .map_err(|error| map_clash_network_error(context, error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error(context, error))?;

    Ok(())
}

async fn clash_put(
    path: &str,
    payload: serde_json::Value,
    context: &str,
) -> Result<(), CommandError> {
    let api = get_api_config();
    let client = clash_client()?;
    client
        .put(build_clash_url(&api.base_url, path))
        .bearer_auth(&api.secret)
        .json(&payload)
        .send()
        .await
        .map_err(|error| map_clash_network_error(context, error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error(context, error))?;

    Ok(())
}

async fn fetch_clash_overview_inner() -> Result<ClashOverview, CommandError> {
    let (config, proxies) = tokio::try_join!(
        clash_get::<ClashConfigResponse>("/configs", "Failed to load Clash mode configuration"),
        clash_get::<ClashProxiesResponse>("/proxies", "Failed to load Clash proxy groups"),
    )?;

    Ok(build_clash_overview(config, proxies))
}

async fn fetch_clash_rules_inner() -> Result<ClashRulesSnapshot, CommandError> {
    let (rules, providers) = tokio::try_join!(
        clash_get::<ClashRulesResponse>("/rules", "Failed to load Clash rules"),
        clash_get::<ClashRuleProvidersResponse>(
            "/providers/rules",
            "Failed to load Clash rule providers"
        ),
    )?;

    Ok(ClashRulesSnapshot {
        rules: rules
            .rules
            .into_iter()
            .enumerate()
            .map(|(index, mut rule)| {
                if let Some(proxy_name) = rule
                    .proxy
                    .strip_prefix("route(")
                    .and_then(|value| value.strip_suffix(')'))
                {
                    rule.proxy = proxy_name.to_string();
                }
                if rule.index.is_none() {
                    rule.index = Some(index);
                }
                rule
            })
            .collect(),
        providers: normalize_rule_providers(providers.providers),
    })
}

async fn execute_proxy_delay_test(
    proxy_name: &str,
    url: Option<&str>,
    timeout_ms: Option<u64>,
) -> Result<(), CommandError> {
    if proxy_name.trim().is_empty() {
        return Err(CommandError::validation("Proxy name cannot be empty."));
    }

    let api = get_api_config();
    let client = clash_client()?;
    let encoded_name = urlencoding::encode(proxy_name.trim());
    let target_url = url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(api.test_url.as_str());
    let timeout = timeout_ms.unwrap_or(DEFAULT_TEST_TIMEOUT_MS);
    let request_url = format!(
        "{}?url={}&timeout={}",
        build_clash_url(&api.base_url, &format!("/proxies/{}/delay", encoded_name)),
        urlencoding::encode(target_url),
        timeout
    );

    client
        .get(request_url)
        .bearer_auth(&api.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error("Failed to test proxy delay", error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error("Failed to test proxy delay", error))?;

    Ok(())
}

fn build_clash_overview(
    config: ClashConfigResponse,
    proxies: ClashProxiesResponse,
) -> ClashOverview {
    let available_modes = if !config.mode_list.is_empty() {
        config.mode_list
    } else if !config.modes.is_empty() {
        config.modes
    } else {
        vec![
            "rule".to_string(),
            "global".to_string(),
            "direct".to_string(),
        ]
    };

    let sort_index = proxies
        .proxies
        .get(GLOBAL_GROUP_NAME)
        .map(|proxy| proxy.all.clone())
        .unwrap_or_default();

    let mut proxy_groups = proxies
        .proxies
        .values()
        .filter(|proxy| !proxy.all.is_empty() && proxy.name != GLOBAL_GROUP_NAME)
        .cloned()
        .collect::<Vec<_>>();

    proxy_groups.sort_by(|left, right| compare_group_order(&sort_index, &left.name, &right.name));

    let groups = proxy_groups
        .into_iter()
        .map(|group| {
            let options = group
                .all
                .iter()
                .filter_map(|name| proxies.proxies.get(name))
                .map(|node| ClashProxyNode {
                    name: node.name.clone(),
                    kind: node.kind.clone(),
                    delay: last_delay(&node.history),
                    alive: node.alive,
                    is_selected: node.name == group.now,
                })
                .collect::<Vec<_>>();

            let current_delay = group
                .all
                .iter()
                .find(|name| **name == group.now)
                .and_then(|name| proxies.proxies.get(name))
                .and_then(|node| last_delay(&node.history));

            ClashProxyGroup {
                name: group.name,
                kind: group.kind,
                current: group.now,
                current_delay,
                options,
            }
        })
        .collect::<Vec<_>>();

    ClashOverview {
        current_mode: config.mode,
        available_modes,
        proxy_groups: groups,
    }
}

fn normalize_rule_providers(providers: Option<ClashRuleProviders>) -> Vec<ClashRuleProvider> {
    match providers {
        Some(ClashRuleProviders::List(items)) => items,
        Some(ClashRuleProviders::Map(items)) => items.into_values().collect(),
        None => Vec::new(),
    }
}

fn compare_group_order(sort_index: &[String], left: &str, right: &str) -> Ordering {
    match (
        sort_index.iter().position(|name| name == left),
        sort_index.iter().position(|name| name == right),
    ) {
        (Some(left_index), Some(right_index)) => left_index.cmp(&right_index),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => left.cmp(right),
    }
}

fn last_delay(history: &[ClashDelayHistory]) -> Option<i64> {
    history.last().map(|entry| entry.delay)
}

#[tauri::command]
pub async fn get_clash_overview() -> Result<ClashOverview, CommandError> {
    fetch_clash_overview_inner().await
}

#[tauri::command]
pub async fn update_clash_mode(mode: String) -> Result<ClashOverview, CommandError> {
    if mode.trim().is_empty() {
        return Err(CommandError::validation("Clash mode cannot be empty."));
    }

    clash_patch(
        "/configs",
        json!({ "mode": mode }),
        "Failed to update Clash mode",
    )
    .await?;

    fetch_clash_overview_inner().await
}

#[tauri::command]
pub async fn select_clash_proxy(
    proxy_group: String,
    name: String,
) -> Result<ClashOverview, CommandError> {
    if proxy_group.trim().is_empty() {
        return Err(CommandError::validation("Proxy group cannot be empty."));
    }

    if name.trim().is_empty() {
        return Err(CommandError::validation("Proxy name cannot be empty."));
    }

    let encoded_group = urlencoding::encode(proxy_group.trim());
    clash_put(
        &format!("/proxies/{}", encoded_group),
        json!({ "name": name }),
        "Failed to switch proxy node",
    )
    .await?;

    fetch_clash_overview_inner().await
}

#[tauri::command]
pub async fn test_clash_proxy_delay(
    proxy_name: String,
    url: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ClashOverview, CommandError> {
    execute_proxy_delay_test(proxy_name.as_str(), url.as_deref(), timeout_ms).await?;

    fetch_clash_overview_inner().await
}

#[tauri::command]
pub async fn test_clash_proxy_group_delay(
    proxy_group: String,
    url: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ClashOverview, CommandError> {
    let normalized_group = proxy_group.trim();
    if normalized_group.is_empty() {
        return Err(CommandError::validation("Proxy group cannot be empty."));
    }

    let overview = fetch_clash_overview_inner().await?;
    let group = overview
        .proxy_groups
        .iter()
        .find(|item| item.name == normalized_group)
        .ok_or_else(|| CommandError::resource_not_found("proxy group", normalized_group))?;

    for node in &group.options {
        execute_proxy_delay_test(node.name.as_str(), url.as_deref(), timeout_ms).await?;
    }

    fetch_clash_overview_inner().await
}

#[tauri::command]
pub async fn get_clash_rules() -> Result<ClashRulesSnapshot, CommandError> {
    fetch_clash_rules_inner().await
}

#[tauri::command]
pub async fn toggle_clash_rule(
    rule_uuid: Option<String>,
    rule_index: Option<usize>,
    disabled: bool,
) -> Result<ClashRulesSnapshot, CommandError> {
    if let Some(uuid) = rule_uuid
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        clash_put(
            &format!("/rules/{}", urlencoding::encode(uuid)),
            json!({}),
            "Failed to toggle Clash rule",
        )
        .await?;
        return fetch_clash_rules_inner().await;
    }

    if let Some(index) = rule_index {
        let mut payload = serde_json::Map::new();
        payload.insert(index.to_string(), json!(disabled));
        clash_patch(
            "/rules/disable",
            Value::Object(payload),
            "Failed to toggle Clash rule",
        )
        .await?;
        return fetch_clash_rules_inner().await;
    }

    Err(CommandError::validation(
        "Rule toggle requires either a rule UUID or rule index.",
    ))
}

#[tauri::command]
pub async fn update_clash_rule_provider(name: String) -> Result<ClashRulesSnapshot, CommandError> {
    let normalized_name = name.trim();
    if normalized_name.is_empty() {
        return Err(CommandError::validation(
            "Rule provider name cannot be empty.",
        ));
    }

    clash_put(
        &format!("/providers/rules/{}", urlencoding::encode(normalized_name)),
        json!({}),
        "Failed to update Clash rule provider",
    )
    .await?;

    fetch_clash_rules_inner().await
}
