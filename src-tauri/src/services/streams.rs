use crate::errors::CommandError;
use futures_util::StreamExt;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::{watch, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};

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

fn base_stream_ws_url(path: &str) -> String {
    let endpoint = crate::services::clash_client::get_clash_endpoint();
    format!(
        "{}/{}?token={}",
        endpoint.ws_base(),
        path,
        urlencoding::encode(&endpoint.secret)
    )
}

fn logs_stream_ws_url(log_level: &str) -> String {
    let endpoint = crate::services::clash_client::get_clash_endpoint();
    format!(
        "{}/logs?level={}&token={}",
        endpoint.ws_base(),
        urlencoding::encode(log_level),
        urlencoding::encode(&endpoint.secret)
    )
}

async fn run_json_stream<F>(
    app: tauri::AppHandle,
    mut stop_rx: watch::Receiver<bool>,
    status_event: &'static str,
    data_event: &'static str,
    build_ws_url: F,
) where
    F: Fn() -> String + Send + 'static,
{
    loop {
        if *stop_rx.borrow() {
            break;
        }

        let ws_url = build_ws_url();
        let _ = app.emit(status_event, "connecting");

        match connect_async(&ws_url).await {
            Ok((mut ws_stream, _)) => {
                let _ = app.emit(status_event, "connected");
                loop {
                    tokio::select! {
                        _ = stop_rx.changed() => {
                            if *stop_rx.borrow() {
                                let _ = app.emit(status_event, "disconnected");
                                return;
                            }
                        }
                        msg = ws_stream.next() => {
                            match msg {
                                Some(Ok(Message::Text(text))) => {
                                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                                        let _ = app.emit(data_event, data);
                                    }
                                }
                                Some(Ok(_)) => {}
                                _ => break,
                            }
                        }
                    }
                }
                let _ = app.emit(status_event, "error");
            }
            Err(_) => {
                let _ = app.emit(status_event, "error");
            }
        }

        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    let _ = app.emit(status_event, "disconnected");
                    break;
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(1500)) => {}
        }

        let _ = app.emit(status_event, "connecting");
    }

    let _ = app.emit(status_event, "disconnected");
}


// ── Traffic stream ─────────────────────────────────────────────────────────

pub async fn start_traffic_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let rx = start_stream_slot(&state.traffic).await;
    tokio::spawn(run_json_stream(
        app,
        rx,
        "stream-traffic-status",
        "stream-traffic",
        || base_stream_ws_url("traffic"),
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
) -> Result<(), CommandError> {
    let rx = start_stream_slot(&state.memory).await;
    tokio::spawn(run_json_stream(
        app,
        rx,
        "stream-memory-status",
        "stream-memory",
        || base_stream_ws_url("memory"),
    ));
    Ok(())
}

pub async fn stop_memory_stream(
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    stop_stream_slot(&state.memory).await;
    Ok(())
}

// ── Connections stream ─────────────────────────────────────────────────────

pub async fn start_connections_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let rx = start_stream_slot(&state.connections).await;
    tokio::spawn(run_json_stream(
        app,
        rx,
        "stream-connections-status",
        "stream-connections",
        || base_stream_ws_url("connections"),
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

pub async fn start_logs_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let rx = start_stream_slot(&state.logs).await;
    tokio::spawn(run_logs_stream(app, rx));
    Ok(())
}

pub async fn stop_logs_stream(
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    stop_stream_slot(&state.logs).await;
    Ok(())
}

async fn run_logs_stream(app: tauri::AppHandle, stop_rx: watch::Receiver<bool>) {
    if *stop_rx.borrow() {
        return;
    }

    // Check if logs are disabled
    const PRIORITY_CONFIG_FILE: &str = "priority_config.json";
    let priority_config: crate::config::PriorityConfig =
        crate::config::load_named_config_or_default(PRIORITY_CONFIG_FILE).unwrap_or_default();

    if priority_config.log.disabled {
        let _ = app.emit("stream-logs-status", "disabled");
        return;
    }

    let log_level = crate::config::load_app_settings_file()
        .map(|s| s.logs.log_level)
        .unwrap_or_else(|_| "info".to_string());

    run_json_stream(
        app,
        stop_rx,
        "stream-logs-status",
        "stream-logs",
        move || logs_stream_ws_url(&log_level),
    )
    .await;
}

