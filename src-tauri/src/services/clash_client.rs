use crate::errors::CommandError;
use reqwest::Client;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::json;
use indexmap::IndexMap;
use std::time::Duration;

const DEFAULT_TEST_URL: &str = "https://www.gstatic.com/generate_204";
const DEFAULT_TEST_TIMEOUT_MS: u64 = 5_000;
const GLOBAL_GROUP_NAME: &str = "GLOBAL";

/// Resolved Clash API endpoint configuration.  Shared by the HTTP client
/// (`clash_client`) and the WebSocket stream client (`streams`).
pub struct ClashEndpoint {
    /// The `host:port` of the external controller, without any URL scheme.
    pub controller: String,
    pub secret: String,
    pub test_url: String,
}

impl ClashEndpoint {
    /// Base URL for REST API calls: `http://<controller>`.
    pub fn http_base(&self) -> String {
        format!("http://{}", self.controller)
    }

    /// Base URL for WebSocket streams: `ws://<controller>`.
    pub fn ws_base(&self) -> String {
        format!("ws://{}", self.controller)
    }
}

/// Read the active Clash API endpoint from `priority_config.json` and
/// `app_settings.json`.  Falls back to compile-time defaults when the files
/// are absent or the relevant fields are empty.
pub fn get_clash_endpoint() -> ClashEndpoint {
    use crate::config::{DEFAULT_CLASH_CONTROLLER, DEFAULT_CLASH_SECRET};
    const PRIORITY_CONFIG_FILE: &str = "priority_config.json";

    let config: crate::config::PriorityConfig =
        crate::config::load_named_config_or_default(PRIORITY_CONFIG_FILE).unwrap_or_default();
    let app_settings = crate::config::load_app_settings_file().unwrap_or_default();

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

    ClashEndpoint {
        controller: controller.to_string(),
        secret: secret.to_string(),
        test_url: if test_url.is_empty() {
            DEFAULT_TEST_URL.to_string()
        } else {
            test_url.to_string()
        },
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
    proxies: indexmap::IndexMap<String, ClashProxy>,
}

#[derive(Debug, Deserialize)]
struct ClashRulesResponse {
    #[serde(default)]
    rules: Vec<ClashRule>,
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
    #[serde(default)]
    udp: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ClashDelayHistory {
    time: String,
    delay: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ClashOverview {
    pub current_mode: String,
    pub available_modes: Vec<String>,
    pub proxy_groups: Vec<ClashProxyGroup>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ClashProxyGroup {
    pub name: String,
    pub kind: String,
    pub current: String,
    pub current_delay: Option<i64>,
    pub options: Vec<ClashProxyNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ClashProxyNode {
    pub name: String,
    pub kind: String,
    pub delay: Option<i64>,
    pub alive: Option<bool>,
    pub is_selected: bool,
    pub udp: bool,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ClashRulesSnapshot {
    rules: Vec<ClashRule>,
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
        let endpoint = get_clash_endpoint();
        return CommandError::network(format!(
            "{}: could not connect to the core at {}. Make sure the Clash API is running.",
            context,
            endpoint.http_base()
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
    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    let response = client
        .get(build_clash_url(&endpoint.http_base(), path))
        .bearer_auth(&endpoint.secret)
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
    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    client
        .patch(build_clash_url(&endpoint.http_base(), path))
        .bearer_auth(&endpoint.secret)
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
    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    client
        .put(build_clash_url(&endpoint.http_base(), path))
        .bearer_auth(&endpoint.secret)
        .json(&payload)
        .send()
        .await
        .map_err(|error| map_clash_network_error(context, error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error(context, error))?;

    Ok(())
}

pub(crate) async fn fetch_clash_overview_inner() -> Result<ClashOverview, CommandError> {
    let (config, proxies) = tokio::try_join!(
        clash_get::<ClashConfigResponse>("/configs", "Failed to load Clash mode configuration"),
        clash_get::<ClashProxiesResponse>("/proxies", "Failed to load Clash proxy groups"),
    )?;

    Ok(build_clash_overview(config, proxies))
}

async fn fetch_clash_rules_inner() -> Result<ClashRulesSnapshot, CommandError> {
    let rules = clash_get::<ClashRulesResponse>("/rules", "Failed to load Clash rules").await?;

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
    })
}

#[derive(Debug, Deserialize)]
struct DelayResponse {
    delay: i64,
}

async fn execute_proxy_delay_test(
    proxy_name: &str,
    url: Option<&str>,
    timeout_ms: Option<u64>,
) -> Result<i64, CommandError> {
    if proxy_name.trim().is_empty() {
        return Err(CommandError::validation("Proxy name cannot be empty."));
    }

    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    let encoded_name = urlencoding::encode(proxy_name.trim());
    let target_url = url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(endpoint.test_url.as_str());
    let timeout = timeout_ms.unwrap_or(DEFAULT_TEST_TIMEOUT_MS);
    let request_url = format!(
        "{}?url={}&timeout={}",
        build_clash_url(
            &endpoint.http_base(),
            &format!("/proxies/{}/delay", encoded_name)
        ),
        urlencoding::encode(target_url),
        timeout
    );

    let response = client
        .get(request_url)
        .bearer_auth(&endpoint.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error("Failed to test proxy delay", error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error("Failed to test proxy delay", error))?;

    let data = response.json::<DelayResponse>().await.map_err(|error| {
        CommandError::network(format!("Failed to parse delay response: {}", error))
    })?;

    Ok(data.delay)
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

    let proxy_groups = proxies
        .proxies
        .values()
        .filter(|proxy| {
            let kind = proxy.kind.to_lowercase();
            (kind == "selector" || kind == "urltest") && proxy.name != GLOBAL_GROUP_NAME
        })
        .cloned()
        .collect::<Vec<_>>();

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
                    udp: node.udp,
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



fn last_delay(history: &[ClashDelayHistory]) -> Option<i64> {
    history.last().map(|entry| entry.delay)
}

pub(crate) async fn select_proxy_inner(proxy_group: &str, node: &str) -> Result<(), CommandError> {
    let encoded_group = urlencoding::encode(proxy_group.trim());
    clash_put(
        &format!("/proxies/{}", encoded_group),
        json!({ "name": node }),
        "Failed to switch proxy node",
    )
    .await
}

pub async fn get_clash_overview(app: tauri::AppHandle) -> Result<ClashOverview, CommandError> {
    let overview = fetch_clash_overview_inner().await?;
    crate::tray::sync_tray_from_overview(&app, &overview);
    Ok(overview)
}

pub async fn update_clash_mode(
    app: tauri::AppHandle,
    mode: String,
) -> Result<ClashOverview, CommandError> {
    if mode.trim().is_empty() {
        return Err(CommandError::validation("Clash mode cannot be empty."));
    }

    clash_patch(
        "/configs",
        json!({ "mode": mode }),
        "Failed to update Clash mode",
    )
    .await?;

    let overview = fetch_clash_overview_inner().await?;
    crate::tray::sync_tray_from_overview(&app, &overview);
    Ok(overview)
}

pub async fn select_clash_proxy(
    app: tauri::AppHandle,
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

    let overview = fetch_clash_overview_inner().await?;
    crate::tray::sync_tray_from_overview(&app, &overview);
    Ok(overview)
}

pub async fn test_clash_proxy_delay(
    proxy_name: String,
    url: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<i64, CommandError> {
    execute_proxy_delay_test(proxy_name.as_str(), url.as_deref(), timeout_ms).await
}

pub async fn test_clash_proxy_group_delay(
    app: tauri::AppHandle,
    proxy_group: String,
    url: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<IndexMap<String, i64>, CommandError> {
    let normalized_group = proxy_group.trim();
    if normalized_group.is_empty() {
        return Err(CommandError::validation("Proxy group cannot be empty."));
    }

    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    let encoded_group = urlencoding::encode(normalized_group);
    let target_url = url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(endpoint.test_url.as_str());
    let timeout = timeout_ms.unwrap_or(DEFAULT_TEST_TIMEOUT_MS);
    let request_url = format!(
        "{}?url={}&timeout={}",
        build_clash_url(
            &endpoint.http_base(),
            &format!("/group/{}/delay", encoded_group)
        ),
        urlencoding::encode(target_url),
        timeout
    );

    let response = client
        .get(request_url)
        .bearer_auth(&endpoint.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error("Failed to test group delay", error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error("Failed to test group delay", error))?;

    let data = response
        .json::<IndexMap<String, i64>>()
        .await
        .map_err(|error| {
            CommandError::network(format!("Failed to parse group delay response: {}", error))
        })?;

    if let Ok(overview) = fetch_clash_overview_inner().await {
        crate::tray::sync_tray_from_overview(&app, &overview);
    }
    Ok(data)
}

pub async fn get_clash_rules() -> Result<ClashRulesSnapshot, CommandError> {
    fetch_clash_rules_inner().await
}

pub async fn query_dns(
    name: String,
    r#type: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    let mut request_url = format!(
        "{}?name={}",
        build_clash_url(&endpoint.http_base(), "/dns/query"),
        urlencoding::encode(&name)
    );
    if let Some(t) = r#type {
        request_url.push_str(&format!("&type={}", urlencoding::encode(&t)));
    }

    let response = client
        .get(request_url)
        .bearer_auth(&endpoint.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error("Failed to query DNS", error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error("Failed to query DNS", error))?;

    let data = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| {
            CommandError::network(format!("Failed to parse DNS response: {}", error))
        })?;

    Ok(data)
}

pub async fn flush_fakeip_cache() -> Result<(), CommandError> {
    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    let request_url = build_clash_url(&endpoint.http_base(), "/cache/fakeip/flush");

    client
        .post(request_url)
        .bearer_auth(&endpoint.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error("Failed to flush Fake-IP cache", error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error("Failed to flush Fake-IP cache", error))?;

    Ok(())
}

pub async fn flush_dns_cache() -> Result<(), CommandError> {
    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    let request_url = build_clash_url(&endpoint.http_base(), "/cache/dns/flush");

    client
        .post(request_url)
        .bearer_auth(&endpoint.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error("Failed to flush DNS cache", error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error("Failed to flush DNS cache", error))?;

    Ok(())
}

pub async fn close_all_connections() -> Result<(), CommandError> {
    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    client
        .delete(build_clash_url(&endpoint.http_base(), "/connections"))
        .bearer_auth(&endpoint.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error("Failed to close all connections", error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error("Failed to close all connections", error))?;
    Ok(())
}

pub async fn close_connection(id: String) -> Result<(), CommandError> {
    let endpoint = get_clash_endpoint();
    let client = clash_client()?;
    let path = format!("/connections/{}", urlencoding::encode(&id));
    client
        .delete(build_clash_url(&endpoint.http_base(), &path))
        .bearer_auth(&endpoint.secret)
        .send()
        .await
        .map_err(|error| map_clash_network_error("Failed to close connection", error))?
        .error_for_status()
        .map_err(|error| map_clash_network_error("Failed to close connection", error))?;
    Ok(())
}
