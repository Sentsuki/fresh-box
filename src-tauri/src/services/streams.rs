// streams.rs — 只剩连接流了。
//
// 流量、内存、日志已经在阶段 2 迁到前端直连 daemon（`src/daemon/statusStream.ts`、
// `src/hooks/useLogsStream.ts`），Rust 这边不再转发也不再改形状。连接流是阶段 3
// 的最后一块 —— 它需要把事件累加逻辑一起搬过去，所以单独一步。
//
// 剩下的这份实现仍带着 Clash 兼容形状的历史包袱（搜 "NOTE:"），那些正是阶段 3
// 要一起消掉的东西：恒空字段、`downloadTotal` 用活跃连接求和（会回落）、CLOSED
// 事件里 daemon 给的最终统计被丢弃。

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::json;
use tauri::Emitter;
use tokio::sync::{Mutex, watch};

use crate::daemon::DaemonConnection;
use crate::daemon::daemon_api::ConnectionEvents;
use crate::errors::CommandError;
use crate::services::singbox::{SingboxState, get_connection};

const CONNECTIONS_INTERVAL_MS: i64 = 1_000;

pub struct StreamsState {
    connections: Mutex<Option<watch::Sender<bool>>>,
}

impl StreamsState {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(None),
        }
    }
}

impl Default for StreamsState {
    fn default() -> Self {
        Self::new()
    }
}

async fn start_stream_slot(slot: &Mutex<Option<watch::Sender<bool>>>) -> watch::Receiver<bool> {
    let (tx, rx) = watch::channel(false);
    let mut guard = slot.lock().await;
    if let Some(old_tx) = guard.replace(tx) {
        let _ = old_tx.send(true);
    }
    rx
}

async fn stop_stream_slot(slot: &Mutex<Option<watch::Sender<bool>>>) {
    let mut guard = slot.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(true);
    }
}

/// Shared retry loop: run `body` for as long as `services::singbox`'s
/// reconciliation loop reports the daemon connected *and* sing-box
/// running, (re)starting it exactly when that changes.
///
/// Each stream used to run its own entirely independent connect/backoff
/// cycle here — its own `get_connection` call, its own 1.5s retry sleep,
/// its own "connected"/"error" classification — completely disconnected
/// from `services::singbox::spawn_reconciliation_loop`'s own connect/retry
/// loop driving `DAEMON_STATE_EVENT`. The two could disagree (a stream
/// reporting itself freshly "connected" for a moment right as the
/// daemon-level state flipped to `Unavailable`, four streams each grinding
/// through their own out-of-phase backoff instead of one shared one) for no
/// reason other than that nothing tied them together. Subscribing to
/// `services::singbox::subscribe`'s `ConnectionPhase` feed instead makes
/// the daemon-level reconciliation loop the single source of truth both
/// signals are ultimately driven by — a stream now starts, stops, and
/// retries in lockstep with it rather than maintaining a second, possibly
/// contradictory opinion about whether the daemon is reachable.
async fn run_with_reconnect<F, Fut>(
    app: tauri::AppHandle,
    singbox: SingboxState,
    mut stop_rx: watch::Receiver<bool>,
    status_event: &'static str,
    mut body: F,
) where
    F: FnMut(tauri::AppHandle, DaemonConnection) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let mut phase_rx = crate::services::singbox::subscribe(&singbox);

    'outer: loop {
        if *stop_rx.borrow() {
            break;
        }

        // Wait until the daemon-level loop reports sing-box actually
        // running — no polling or backoff of our own; `phase_rx.changed()`
        // resolves the instant that loop publishes a new phase.
        while !phase_rx.borrow().running() {
            let _ = app.emit(status_event, "connecting");
            tokio::select! {
                _ = stop_rx.changed() => {
                    if *stop_rx.borrow() {
                        let _ = app.emit(status_event, "disconnected");
                        return;
                    }
                }
                result = phase_rx.changed() => {
                    // Only fails if `SingboxState`'s `phase_tx` was
                    // dropped, which doesn't happen while the app is
                    // running (it's Tauri-managed state) — but don't spin
                    // on it if it ever does.
                    if result.is_err() {
                        let _ = app.emit(status_event, "disconnected");
                        return;
                    }
                }
            }
        }

        let connection = match get_connection(&singbox).await {
            Ok(connection) => connection,
            // Lost a narrow race: the phase flipped to "running" and back
            // before this call landed. `phase_rx` already has the newer
            // value queued, so loop back to the wait above rather than
            // surfacing this as a stream error.
            Err(_) => continue 'outer,
        };

        let _ = app.emit(status_event, "connected");
        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    let _ = app.emit(status_event, "disconnected");
                    return;
                }
            }
            result = phase_rx.changed() => {
                // Daemon-level phase moved on (sing-box stopped, the
                // connection dropped, ...) — go back to the wait loop
                // instead of treating this as this stream's own failure.
                if result.is_err() {
                    let _ = app.emit(status_event, "disconnected");
                    return;
                }
            }
            _ = body(app.clone(), connection) => {
                // The gRPC subscription itself ended/failed while the
                // daemon still reports sing-box running — this stream's own
                // problem (pipe hiccup, ...), not a daemon-level one.
                let _ = app.emit(status_event, "error");
            }
        }
    }

    let _ = app.emit(status_event, "disconnected");
}

// ── Connections stream ─────────────────────────────────────────────────────

/// One entry of client-side connection state, accumulated from the
/// incremental `ConnectionEvent`s boxdd sends (there is no unary "list all
/// connections" call — see the module doc comment in `daemon_control.rs`).
#[derive(Clone)]
struct TrackedConnection {
    value: serde_json::Value,
}

fn split_host_port(address: &str) -> (String, String) {
    // Handles bracketed IPv6 (`[::1]:80`) and plain `host:port`.
    if let Some(rest) = address.strip_prefix('[')
        && let Some(end) = rest.find(']')
    {
        let host = &rest[..end];
        let port = rest[end + 1..].trim_start_matches(':');
        return (host.to_string(), port.to_string());
    }
    match address.rsplit_once(':') {
        Some((host, port)) => (host.to_string(), port.to_string()),
        None => (address.to_string(), String::new()),
    }
}

fn format_timestamp_millis(millis: i64) -> String {
    chrono::DateTime::from_timestamp_millis(millis)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

fn apply_connection_event(
    tracked: &mut HashMap<String, TrackedConnection>,
    event: &crate::daemon::daemon_api::ConnectionEvent,
) {
    // NOTE: compared against the raw proto enum int (0=NEW, 1=UPDATE,
    // 2=CLOSED) from `proto/daemon/started_service.proto` rather than the
    // generated Rust variant name — `ConnectionEvent.r#type` is a plain
    // `i32` field (prost doesn't generate a clamping accessor here), and
    // `ConnectionEventType::try_from` would just add a Result to unwrap for
    // one comparison.
    if event.r#type == 2 {
        tracked.remove(&event.id);
        return;
    }

    // UPDATE events (the ones that actually carry non-zero
    // `up/downlinkDelta`) come back from `StartedService.buildTrafficUpdates`
    // upstream *without* a `Connection` payload — only CONNECTION_EVENT_NEW
    // fills that in (see `daemon/started_service.go`: the UPDATE branches
    // build `&ConnectionEvent{Type: ..., UplinkDelta: ..., DownlinkDelta:
    // ...}` with no `Connection` field). Bailing out here whenever
    // `event.connection` is absent silently dropped every delta after the
    // initial (always-zero-delta) NEW event, which is why speeds always
    // read 0. Patch the existing tracked entry's cumulative totals/speed
    // fields in place instead of discarding the event.
    let Some(conn) = event.connection.as_ref() else {
        if let Some(existing) = tracked.get_mut(&event.id)
            && let Some(obj) = existing.value.as_object_mut()
        {
            let download_speed = event.downlink_delta.max(0);
            let upload_speed = event.uplink_delta.max(0);
            let prev_download = obj["download"].as_i64().unwrap_or(0);
            let prev_upload = obj["upload"].as_i64().unwrap_or(0);
            obj["download"] = json!(prev_download + download_speed);
            obj["upload"] = json!(prev_upload + upload_speed);
            obj["downloadSpeed"] = json!(download_speed);
            obj["uploadSpeed"] = json!(upload_speed);
        }
        return;
    };

    let (source_ip, source_port) = split_host_port(&conn.source);
    let (destination_ip, destination_port) = split_host_port(&conn.destination);
    let process_path = conn.process_info.as_ref().map(|p| p.process_path.clone());
    let process_name = process_path
        .as_deref()
        .and_then(|p| p.rsplit(['/', '\\']).next().map(str::to_string));

    let value = json!({
        "id": conn.id,
        "metadata": {
            "network": conn.network,
            "type": conn.inbound_type,
            "host": if conn.domain.is_empty() { destination_ip.clone() } else { conn.domain.clone() },
            "sourceIP": source_ip,
            "sourcePort": source_port,
            "destinationIP": destination_ip,
            "destinationPort": destination_port,
            "dnsMode": "",
            "processPath": process_path,
            "remoteDestination": conn.destination,
            "sniffHost": conn.domain,
            "inboundUser": conn.user,
            "inboundName": conn.inbound,
            "inboundPort": serde_json::Value::Null,
            "process": process_name,
        },
        // NOTE: cumulative bytes for this connection. `Connection` also
        // carries `uplink`/`downlink`, which we treat as the same figures
        // `ConnectionEvent.{up,down}linkDelta` already give us more
        // directly below, so they're unused here.
        "upload": conn.uplink_total,
        "download": conn.downlink_total,
        // NOTE: `createdAt` is Unix milliseconds — confirmed against a
        // running daemon (matches the millisecond convention the rest of
        // this proto already uses for time fields, e.g.
        // `SubscribeConnectionsRequest.interval`, which is exactly what
        // `CONNECTIONS_INTERVAL_MS` above is denominated in).
        "start": format_timestamp_millis(conn.created_at),
        "chains": conn.chain_list,
        "rule": conn.rule,
        "rulePayload": "",
        "uploadSpeed": event.uplink_delta.max(0),
        "downloadSpeed": event.downlink_delta.max(0),
    });

    tracked.insert(event.id.clone(), TrackedConnection { value });
}

fn build_frame(tracked: &HashMap<String, TrackedConnection>) -> serde_json::Value {
    let mut download_total: i64 = 0;
    let mut upload_total: i64 = 0;
    let mut download_speed: i64 = 0;
    let mut upload_speed: i64 = 0;
    let connections: Vec<&serde_json::Value> = tracked
        .values()
        .map(|c| {
            download_total += c.value["download"].as_i64().unwrap_or(0);
            upload_total += c.value["upload"].as_i64().unwrap_or(0);
            download_speed += c.value["downloadSpeed"].as_i64().unwrap_or(0);
            upload_speed += c.value["uploadSpeed"].as_i64().unwrap_or(0);
            &c.value
        })
        .collect();

    json!({
        "downloadTotal": download_total,
        "uploadTotal": upload_total,
        "connections": connections,
        "totalDownloadSpeed": download_speed,
        "totalUploadSpeed": upload_speed,
    })
}

async fn run_connections(app: tauri::AppHandle, connection: DaemonConnection) {
    let Ok(mut stream) = connection
        .subscribe_connections(CONNECTIONS_INTERVAL_MS)
        .await
    else {
        return;
    };

    let tracked: Arc<Mutex<HashMap<String, TrackedConnection>>> =
        Arc::new(Mutex::new(HashMap::new()));

    while let Ok(Some(frame)) = stream.message().await {
        let ConnectionEvents { events, reset } = frame;
        let mut guard = tracked.lock().await;
        if reset {
            guard.clear();
        }
        for event in &events {
            apply_connection_event(&mut guard, event);
        }
        let payload = build_frame(&guard);
        drop(guard);
        let _ = app.emit("stream-connections", payload);
    }
}

pub async fn start_connections_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
    singbox: tauri::State<'_, SingboxState>,
) -> Result<(), CommandError> {
    let rx = start_stream_slot(&state.connections).await;
    let singbox = singbox.inner().clone();
    tokio::spawn(run_with_reconnect(
        app,
        singbox,
        rx,
        "stream-connections-status",
        run_connections,
    ));
    Ok(())
}

pub async fn stop_connections_stream(
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    stop_stream_slot(&state.connections).await;
    Ok(())
}
