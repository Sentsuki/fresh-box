// daemon_control.rs — proxy groups, Clash mode, delay tests and connection
// management, all driven through `sing-box-daemon.exe`'s gRPC API instead
// of the old Clash HTTP/WebSocket API. (Formerly `clash_client.rs`.)
//
// A few things boxdd's `StartedService` does not expose the way the Clash
// API did, worth knowing before touching this file:
//   * `URLTest` is fire-and-forget — it doesn't return a delay. The result
//     shows up later as an update on the `SubscribeGroups` stream, so a
//     "test this proxy's delay" call here means: subscribe, trigger the
//     test, and wait for that tag's entry to change.
//   * There's no unary "list all connections" call, only
//     `SubscribeConnections` (streaming). Reading one snapshot off it is
//     the equivalent of the old `GET /connections`.
//   * Per-call custom test URL overrides (the old `?url=` query param)
//     aren't supported by `URLTest` — it always uses the outbound's own
//     configured test URL, so there's no `url` parameter here at all.
//   * `GroupItem` doesn't carry the Clash API's `alive`/`udp` flags, so
//     `ProxyNodeOverview::alive` is always `None` and `::udp` is always
//     `false` here.

use std::time::Duration;

use indexmap::IndexMap;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::daemon::DaemonConnection;
use crate::daemon::daemon_api::Groups;
use crate::errors::CommandError;
use crate::services::singbox::{SingboxState, get_connection};

const DEFAULT_TEST_TIMEOUT_MS: u64 = 5_000;
const GLOBAL_GROUP_NAME: &str = "GLOBAL";

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProxyOverview {
    pub current_mode: String,
    pub available_modes: Vec<String>,
    pub proxy_groups: Vec<ProxyGroupOverview>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProxyGroupOverview {
    pub name: String,
    pub kind: String,
    pub current: String,
    pub current_delay: Option<i64>,
    pub options: Vec<ProxyNodeOverview>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ProxyNodeOverview {
    pub name: String,
    pub kind: String,
    pub delay: Option<i64>,
    pub alive: Option<bool>,
    pub is_selected: bool,
    pub udp: bool,
}

fn is_selector_like(kind: &str) -> bool {
    let kind = kind.to_lowercase();
    kind == "selector" || kind == "urltest"
}

fn build_overview(
    mode: crate::daemon::daemon_api::ClashModeStatus,
    groups: Groups,
) -> ProxyOverview {
    let available_modes = if !mode.mode_list.is_empty() {
        mode.mode_list
    } else {
        vec![
            "rule".to_string(),
            "global".to_string(),
            "direct".to_string(),
        ]
    };

    let proxy_groups = groups
        .group
        .into_iter()
        .filter(|g| is_selector_like(&g.r#type) && g.tag != GLOBAL_GROUP_NAME)
        .map(|g| {
            let options = g
                .items
                .iter()
                .map(|item| ProxyNodeOverview {
                    name: item.tag.clone(),
                    kind: item.r#type.clone(),
                    delay: (item.url_test_delay > 0).then_some(item.url_test_delay as i64),
                    alive: None,
                    is_selected: item.tag == g.selected,
                    udp: false,
                })
                .collect::<Vec<_>>();

            let current_delay = g
                .items
                .iter()
                .find(|item| item.tag == g.selected)
                .map(|item| item.url_test_delay as i64)
                .filter(|d| *d > 0);

            ProxyGroupOverview {
                name: g.tag,
                kind: g.r#type,
                current: g.selected,
                current_delay,
                options,
            }
        })
        .collect();

    ProxyOverview {
        current_mode: mode.current_mode,
        available_modes,
        proxy_groups,
    }
}

/// One-shot snapshot: fetch the current Clash mode and the first message
/// off the groups subscription, then stop subscribing.
pub(crate) async fn fetch_overview(
    connection: &DaemonConnection,
) -> Result<ProxyOverview, CommandError> {
    let mode = connection.clash_mode_status().await?;
    let mut stream = connection.subscribe_groups().await?;
    let groups = stream
        .message()
        .await
        .map_err(|e| CommandError::network(format!("read initial proxy groups: {e}")))?
        .unwrap_or_default();
    Ok(build_overview(mode, groups))
}

pub async fn get_proxy_overview(
    app: AppHandle,
    state: &SingboxState,
) -> Result<ProxyOverview, CommandError> {
    let connection = get_connection(state).await?;
    let overview = fetch_overview(&connection).await?;
    crate::tray::sync_tray_from_overview(&app, &overview);
    Ok(overview)
}

pub async fn update_proxy_mode(
    app: AppHandle,
    state: &SingboxState,
    mode: String,
) -> Result<ProxyOverview, CommandError> {
    if mode.trim().is_empty() {
        return Err(CommandError::validation("Proxy mode cannot be empty."));
    }
    let connection = get_connection(state).await?;
    connection.set_clash_mode(mode).await?;
    let overview = fetch_overview(&connection).await?;
    crate::tray::sync_tray_from_overview(&app, &overview);
    Ok(overview)
}

pub(crate) async fn select_proxy_inner(
    connection: &DaemonConnection,
    proxy_group: &str,
    node: &str,
) -> Result<(), CommandError> {
    connection
        .select_outbound(proxy_group.to_string(), node.to_string())
        .await
}

pub async fn select_proxy(
    app: AppHandle,
    state: &SingboxState,
    proxy_group: String,
    name: String,
) -> Result<ProxyOverview, CommandError> {
    if proxy_group.trim().is_empty() {
        return Err(CommandError::validation("Proxy group cannot be empty."));
    }
    if name.trim().is_empty() {
        return Err(CommandError::validation("Proxy name cannot be empty."));
    }

    let connection = get_connection(state).await?;
    select_proxy_inner(&connection, &proxy_group, &name).await?;

    let auto_close = app
        .state::<crate::config::app_settings::BackendPrefsState>()
        .get()
        .auto_close_connections;
    if auto_close {
        close_connections_by_group(&connection, &proxy_group).await;
    }

    let overview = fetch_overview(&connection).await?;
    crate::tray::sync_tray_from_overview(&app, &overview);
    Ok(overview)
}

/// Trigger a URL test for `outbound_tag` and wait for a fresh result to
/// appear on the groups subscription (see the module doc comment — this is
/// what stands in for the old synchronous "GET .../delay" call).
async fn await_url_test_delay(
    connection: &DaemonConnection,
    outbound_tag: &str,
    timeout_ms: u64,
) -> Result<i64, CommandError> {
    let timeout = Duration::from_millis(timeout_ms);
    let deadline = tokio::time::Instant::now() + timeout;

    let mut stream = connection.subscribe_groups().await?;
    let baseline = tokio::time::timeout(timeout, stream.message())
        .await
        .map_err(|_| CommandError::network("Timed out reading the initial proxy group snapshot."))?
        .map_err(|e| CommandError::network(format!("subscribe to proxy groups: {e}")))?
        .and_then(|groups| find_item_time(&groups, outbound_tag));

    connection.url_test(outbound_tag.to_string()).await?;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        let Ok(Ok(Some(groups))) = tokio::time::timeout(remaining, stream.message()).await else {
            break;
        };
        if let Some((time, delay)) = find_item_time_and_delay(&groups, outbound_tag)
            && Some(time) != baseline
        {
            return Ok(delay);
        }
    }

    Err(CommandError::network(format!(
        "Timed out waiting for a delay result for '{}'.",
        outbound_tag
    )))
}

fn find_item_time(groups: &Groups, tag: &str) -> Option<i64> {
    find_item_time_and_delay(groups, tag).map(|(time, _)| time)
}

fn find_item_time_and_delay(groups: &Groups, tag: &str) -> Option<(i64, i64)> {
    groups
        .group
        .iter()
        .flat_map(|g| g.items.iter())
        .find(|item| item.tag == tag)
        .map(|item| (item.url_test_time, item.url_test_delay as i64))
}

pub async fn test_proxy_delay(
    state: &SingboxState,
    proxy_name: String,
    timeout_ms: Option<u64>,
) -> Result<i64, CommandError> {
    let proxy_name = proxy_name.trim();
    if proxy_name.is_empty() {
        return Err(CommandError::validation("Proxy name cannot be empty."));
    }
    let connection = get_connection(state).await?;
    await_url_test_delay(
        &connection,
        proxy_name,
        timeout_ms.unwrap_or(DEFAULT_TEST_TIMEOUT_MS),
    )
    .await
}

pub async fn test_proxy_group_delay(
    app: AppHandle,
    state: &SingboxState,
    proxy_group: String,
    timeout_ms: Option<u64>,
) -> Result<IndexMap<String, i64>, CommandError> {
    let normalized_group = proxy_group.trim();
    if normalized_group.is_empty() {
        return Err(CommandError::validation("Proxy group cannot be empty."));
    }

    let connection = get_connection(state).await?;
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TEST_TIMEOUT_MS));
    let deadline = tokio::time::Instant::now() + timeout;

    connection.url_test(normalized_group.to_string()).await?;
    let mut stream = connection.subscribe_groups().await?;

    let mut last_seen: Option<IndexMap<String, i64>> = None;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        match tokio::time::timeout(remaining, stream.message()).await {
            Ok(Ok(Some(groups))) => {
                if let Some(group) = groups.group.iter().find(|g| g.tag == normalized_group) {
                    last_seen = Some(
                        group
                            .items
                            .iter()
                            .map(|item| (item.tag.clone(), item.url_test_delay as i64))
                            .collect(),
                    );
                }
            }
            _ => break,
        }
    }

    let result = last_seen.ok_or_else(|| {
        CommandError::network(format!(
            "Timed out waiting for delay results for group '{}'.",
            normalized_group
        ))
    })?;

    if let Ok(overview) = fetch_overview(&connection).await {
        crate::tray::sync_tray_from_overview(&app, &overview);
    }
    Ok(result)
}

/// Close every currently open connection whose proxy chain includes
/// `proxy_group_name`. One snapshot off `SubscribeConnections`, filtered
/// client-side — there's no server-side "close by group" call.
async fn close_connections_by_group(connection: &DaemonConnection, proxy_group_name: &str) {
    let mut stream = match connection.subscribe_connections(0).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("auto-close: failed to subscribe to connections: {:?}", e);
            return;
        }
    };

    let frame = match stream.message().await {
        Ok(Some(frame)) => frame,
        _ => return,
    };

    for event in frame.events {
        let Some(conn) = event.connection else {
            continue;
        };
        if conn.chain_list.iter().any(|c| c == proxy_group_name)
            && let Err(e) = connection.close_connection(conn.id).await
        {
            eprintln!("auto-close: failed to close connection: {:?}", e);
        }
    }
}

/// Public wrapper so `tray.rs` can reuse the group-close logic after a
/// tray-triggered proxy switch.
pub async fn close_connections_by_group_pub(connection: &DaemonConnection, proxy_group_name: &str) {
    close_connections_by_group(connection, proxy_group_name).await;
}

pub async fn close_all_connections(state: &SingboxState) -> Result<(), CommandError> {
    get_connection(state).await?.close_all_connections().await
}

pub async fn close_connection(state: &SingboxState, id: String) -> Result<(), CommandError> {
    get_connection(state).await?.close_connection(id).await
}
