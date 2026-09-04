// streams.rs — push traffic/memory/connections/logs updates to the
// frontend as Tauri events, sourced from `sing-box-daemon.exe`'s gRPC
// streaming RPCs instead of four separate Clash API WebSockets.
//
// Event names and payload shapes are kept identical to the old Clash-API
// backed implementation (see `src/hooks/use{Traffic,Memory,Connections,Logs}Stream.ts`)
// so the frontend doesn't need to change. A few fields don't have a clean
// source in boxdd's API and are approximated — search this file for
// "NOTE:" to find them.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::json;
use tauri::Emitter;
use tokio::sync::{Mutex, watch};

use crate::daemon::DaemonConnection;
use crate::daemon::daemon_api::{ConnectionEvents, Log};
use crate::errors::CommandError;
use crate::services::singbox::{SingboxState, get_connection};

const STATUS_INTERVAL_MS: i64 = 1_000;
const CONNECTIONS_INTERVAL_MS: i64 = 1_000;

pub struct StreamsState {
    traffic: Mutex<Option<watch::Sender<bool>>>,
    memory: Mutex<Option<watch::Sender<bool>>>,
    connections: Mutex<Option<watch::Sender<bool>>>,
    logs: Mutex<Option<watch::Sender<bool>>>,
}

impl StreamsState {
    pub fn new() -> Self {
        Self {
            traffic: Mutex::new(None),
            memory: Mutex::new(None),
            connections: Mutex::new(None),
            logs: Mutex::new(None),
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

// ── Traffic stream ─────────────────────────────────────────────────────────

pub async fn start_traffic_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
    singbox: tauri::State<'_, SingboxState>,
) -> Result<(), CommandError> {
    let rx = start_stream_slot(&state.traffic).await;
    let singbox = singbox.inner().clone();
    tokio::spawn(run_with_reconnect(
        app,
        singbox,
        rx,
        "stream-traffic-status",
        |app, connection| async move {
            let Ok(mut stream) = connection.subscribe_status(STATUS_INTERVAL_MS).await else {
                return;
            };
            while let Ok(Some(status)) = stream.message().await {
                let _ = app.emit(
                    "stream-traffic",
                    json!({ "down": status.downlink, "up": status.uplink }),
                );
            }
        },
    ));
    Ok(())
}

pub async fn stop_traffic_stream(
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    stop_stream_slot(&state.traffic).await;
    Ok(())
}

// ── Memory stream ──────────────────────────────────────────────────────────

pub async fn start_memory_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
    singbox: tauri::State<'_, SingboxState>,
) -> Result<(), CommandError> {
    let rx = start_stream_slot(&state.memory).await;
    let singbox = singbox.inner().clone();
    tokio::spawn(run_with_reconnect(
        app,
        singbox,
        rx,
        "stream-memory-status",
        |app, connection| async move {
            let Ok(mut stream) = connection.subscribe_status(STATUS_INTERVAL_MS).await else {
                return;
            };
            while let Ok(Some(status)) = stream.message().await {
                let _ = app.emit("stream-memory", json!({ "inuse": status.memory }));
            }
        },
    ));
    Ok(())
}

pub async fn stop_memory_stream(state: tauri::State<'_, StreamsState>) -> Result<(), CommandError> {
    stop_stream_slot(&state.memory).await;
    Ok(())
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

// ── Logs stream ────────────────────────────────────────────────────────────

fn log_level_name(level: crate::daemon::daemon_api::LogLevel) -> &'static str {
    use crate::daemon::daemon_api::LogLevel;
    match level {
        LogLevel::Panic => "panic",
        LogLevel::Fatal => "fatal",
        LogLevel::Error => "error",
        LogLevel::Warn => "warning",
        LogLevel::Info => "info",
        LogLevel::Debug => "debug",
        LogLevel::Trace => "trace",
    }
}

/// Strip terminal color escape codes (`ESC [ ... <final byte>`, e.g. the
/// SGR sequences `aurora.Colorize`/`aurora.Cyan`/etc. produce) out of a log
/// message.
///
/// This isn't a character-encoding problem — the daemon really does send
/// these bytes, and they're valid UTF-8 (prost would refuse to decode a
/// `string` field otherwise). It's an upstream sing-box quirk: the log
/// entries `StartedService` captures for `SubscribeLog` are delivered
/// through the `log.PlatformWriter` path (`AttachPlatformWriter` in
/// `daemon/attached_service.go`), which always formats through
/// `platformFormatter` — and that formatter's `DisableColors` is never set
/// (the one line that would wire it up to `PlatformWriter.DisableColors()`
/// is dead code, commented out in `log/observable.go` upstream). So every
/// log line comes through pre-colorized for a terminal, regardless of the
/// config's own `log.disabled`/`level`. fresh-box's Logs page is a
/// plain-text viewer, so left alone those escape sequences render as
/// garbled control characters — strip them here so only the sink (this
/// Tauri event, and anything that reads it downstream) ever needs to care.
fn strip_ansi_codes(input: &str) -> String {
    if !input.contains('\u{1b}') {
        return input.to_string();
    }
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next(); // consume the '['
            // Consume through the CSI sequence's final byte (0x40..=0x7E
            // covers every terminator, not just SGR's 'm', in case aurora
            // ever emits something else).
            for next in chars.by_ref() {
                if ('\x40'..='\x7e').contains(&next) {
                    break;
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

async fn run_logs(app: tauri::AppHandle, connection: DaemonConnection) {
    let Ok(mut stream) = connection.subscribe_log().await else {
        return;
    };
    while let Ok(Some(Log { messages, .. })) = stream.message().await {
        for message in messages {
            let _ = app.emit(
                "stream-logs",
                json!({
                    "type": log_level_name(message.level()),
                    "payload": strip_ansi_codes(&message.message),
                }),
            );
        }
    }
}

pub async fn start_logs_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
    singbox: tauri::State<'_, SingboxState>,
) -> Result<(), CommandError> {
    let rx = start_stream_slot(&state.logs).await;

    let priority_config: crate::config::PriorityConfig =
        crate::config::load_named_config_or_default(crate::config::priority::PRIORITY_CONFIG_FILE)
            .unwrap_or_default();
    if priority_config.log.disabled {
        let _ = app.emit("stream-logs-status", "disabled");
        return Ok(());
    }

    let singbox = singbox.inner().clone();
    tokio::spawn(run_with_reconnect(
        app,
        singbox,
        rx,
        "stream-logs-status",
        run_logs,
    ));
    Ok(())
}

pub async fn stop_logs_stream(state: tauri::State<'_, StreamsState>) -> Result<(), CommandError> {
    stop_stream_slot(&state.logs).await;
    Ok(())
}
