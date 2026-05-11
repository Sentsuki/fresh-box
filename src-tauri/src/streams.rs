use crate::errors::CommandError;
use futures_util::StreamExt;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::sync::watch;
use tokio_tungstenite::connect_async;

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

struct WsConfig {
    base_url: String,
    secret: String,
}

fn get_ws_config() -> WsConfig {
    use crate::priority_config::{DEFAULT_CLASH_CONTROLLER, DEFAULT_CLASH_SECRET};
    const PRIORITY_CONFIG_FILE: &str = "priority_config.json";

    let config: crate::priority_config::PriorityConfig =
        crate::config::load_named_config_or_default(PRIORITY_CONFIG_FILE).unwrap_or_default();

    let clash_api = config.experimental.clash_api.as_ref();

    let controller = clash_api
        .and_then(|c| c.external_controller.as_deref())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLASH_CONTROLLER);

    let secret = clash_api
        .and_then(|c| c.secret.as_deref())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLASH_SECRET);

    WsConfig {
        base_url: format!("ws://{}", controller),
        secret: secret.to_string(),
    }
}

// ── Traffic stream ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_traffic_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let (tx, rx) = watch::channel(false);
    {
        let mut guard = state.traffic.lock().await;
        if let Some(old_tx) = guard.replace(tx) {
            let _ = old_tx.send(true);
        }
    }
    tokio::spawn(run_traffic_stream(app, rx));
    Ok(())
}

#[tauri::command]
pub async fn stop_traffic_stream(
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let mut guard = state.traffic.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(true);
    }
    Ok(())
}

async fn run_traffic_stream(app: tauri::AppHandle, mut stop_rx: watch::Receiver<bool>) {
    loop {
        if *stop_rx.borrow() {
            break;
        }

        let cfg = get_ws_config();
        let ws_url = format!(
            "{}/traffic?token={}",
            cfg.base_url,
            urlencoding::encode(&cfg.secret)
        );

        let _ = app.emit("stream-traffic-status", "connecting");

        match connect_async(&ws_url).await {
            Ok((mut ws_stream, _)) => {
                let _ = app.emit("stream-traffic-status", "connected");
                loop {
                    tokio::select! {
                        _ = stop_rx.changed() => {
                            if *stop_rx.borrow() {
                                let _ = app.emit("stream-traffic-status", "disconnected");
                                return;
                            }
                        }
                        msg = ws_stream.next() => {
                            match msg {
                                Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                                        let _ = app.emit("stream-traffic", data);
                                    }
                                }
                                Some(Ok(_)) => {}
                                _ => break,
                            }
                        }
                    }
                }
                let _ = app.emit("stream-traffic-status", "error");
            }
            Err(_) => {
                let _ = app.emit("stream-traffic-status", "error");
            }
        }

        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    let _ = app.emit("stream-traffic-status", "disconnected");
                    break;
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(1500)) => {}
        }

        let _ = app.emit("stream-traffic-status", "connecting");
    }

    let _ = app.emit("stream-traffic-status", "disconnected");
}

// ── Memory stream ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_memory_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let (tx, rx) = watch::channel(false);
    {
        let mut guard = state.memory.lock().await;
        if let Some(old_tx) = guard.replace(tx) {
            let _ = old_tx.send(true);
        }
    }
    tokio::spawn(run_memory_stream(app, rx));
    Ok(())
}

#[tauri::command]
pub async fn stop_memory_stream(
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let mut guard = state.memory.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(true);
    }
    Ok(())
}

async fn run_memory_stream(app: tauri::AppHandle, mut stop_rx: watch::Receiver<bool>) {
    loop {
        if *stop_rx.borrow() {
            break;
        }

        let cfg = get_ws_config();
        let ws_url = format!(
            "{}/memory?token={}",
            cfg.base_url,
            urlencoding::encode(&cfg.secret)
        );

        let _ = app.emit("stream-memory-status", "connecting");

        match connect_async(&ws_url).await {
            Ok((mut ws_stream, _)) => {
                let _ = app.emit("stream-memory-status", "connected");
                loop {
                    tokio::select! {
                        _ = stop_rx.changed() => {
                            if *stop_rx.borrow() {
                                let _ = app.emit("stream-memory-status", "disconnected");
                                return;
                            }
                        }
                        msg = ws_stream.next() => {
                            match msg {
                                Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                                        let _ = app.emit("stream-memory", data);
                                    }
                                }
                                Some(Ok(_)) => {}
                                _ => break,
                            }
                        }
                    }
                }
                let _ = app.emit("stream-memory-status", "error");
            }
            Err(_) => {
                let _ = app.emit("stream-memory-status", "error");
            }
        }

        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    let _ = app.emit("stream-memory-status", "disconnected");
                    break;
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(1500)) => {}
        }

        let _ = app.emit("stream-memory-status", "connecting");
    }

    let _ = app.emit("stream-memory-status", "disconnected");
}

// ── Connections stream ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_connections_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let (tx, rx) = watch::channel(false);
    {
        let mut guard = state.connections.lock().await;
        if let Some(old_tx) = guard.replace(tx) {
            let _ = old_tx.send(true);
        }
    }
    tokio::spawn(run_connections_stream(app, rx));
    Ok(())
}

#[tauri::command]
pub async fn stop_connections_stream(
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let mut guard = state.connections.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(true);
    }
    Ok(())
}

async fn run_connections_stream(app: tauri::AppHandle, mut stop_rx: watch::Receiver<bool>) {
    loop {
        if *stop_rx.borrow() {
            break;
        }

        let cfg = get_ws_config();
        let ws_url = format!(
            "{}/connections?token={}",
            cfg.base_url,
            urlencoding::encode(&cfg.secret)
        );

        let _ = app.emit("stream-connections-status", "connecting");

        match connect_async(&ws_url).await {
            Ok((mut ws_stream, _)) => {
                let _ = app.emit("stream-connections-status", "connected");
                loop {
                    tokio::select! {
                        _ = stop_rx.changed() => {
                            if *stop_rx.borrow() {
                                let _ = app.emit("stream-connections-status", "disconnected");
                                return;
                            }
                        }
                        msg = ws_stream.next() => {
                            match msg {
                                Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                                        let _ = app.emit("stream-connections", data);
                                    }
                                }
                                Some(Ok(_)) => {}
                                _ => break,
                            }
                        }
                    }
                }
                let _ = app.emit("stream-connections-status", "error");
            }
            Err(_) => {
                let _ = app.emit("stream-connections-status", "error");
            }
        }

        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    let _ = app.emit("stream-connections-status", "disconnected");
                    break;
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(1500)) => {}
        }

        let _ = app.emit("stream-connections-status", "connecting");
    }

    let _ = app.emit("stream-connections-status", "disconnected");
}

// ── Logs stream ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_logs_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let (tx, rx) = watch::channel(false);
    {
        let mut guard = state.logs.lock().await;
        if let Some(old_tx) = guard.replace(tx) {
            let _ = old_tx.send(true);
        }
    }
    tokio::spawn(run_logs_stream(app, rx));
    Ok(())
}

#[tauri::command]
pub async fn stop_logs_stream(
    state: tauri::State<'_, StreamsState>,
) -> Result<(), CommandError> {
    let mut guard = state.logs.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(true);
    }
    Ok(())
}

async fn run_logs_stream(app: tauri::AppHandle, mut stop_rx: watch::Receiver<bool>) {
    if *stop_rx.borrow() {
        return;
    }

    // Check if logs are disabled
    const PRIORITY_CONFIG_FILE: &str = "priority_config.json";
    let priority_config: crate::priority_config::PriorityConfig =
        crate::config::load_named_config_or_default(PRIORITY_CONFIG_FILE).unwrap_or_default();

    if priority_config.log.disabled {
        let _ = app.emit("stream-logs-status", "disabled");
        return;
    }

    let log_level = crate::config::load_app_settings_file()
        .map(|s| s.logs.log_level)
        .unwrap_or_else(|_| "info".to_string());

    loop {
        if *stop_rx.borrow() {
            break;
        }

        let cfg = get_ws_config();
        let ws_url = format!(
            "{}/logs?level={}&token={}",
            cfg.base_url,
            urlencoding::encode(&log_level),
            urlencoding::encode(&cfg.secret)
        );

        let _ = app.emit("stream-logs-status", "connecting");

        match connect_async(&ws_url).await {
            Ok((mut ws_stream, _)) => {
                let _ = app.emit("stream-logs-status", "connected");
                loop {
                    tokio::select! {
                        _ = stop_rx.changed() => {
                            if *stop_rx.borrow() {
                                let _ = app.emit("stream-logs-status", "disconnected");
                                return;
                            }
                        }
                        msg = ws_stream.next() => {
                            match msg {
                                Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                                        let _ = app.emit("stream-logs", data);
                                    }
                                }
                                Some(Ok(_)) => {}
                                _ => break,
                            }
                        }
                    }
                }
                let _ = app.emit("stream-logs-status", "error");
            }
            Err(_) => {
                let _ = app.emit("stream-logs-status", "error");
            }
        }

        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    let _ = app.emit("stream-logs-status", "disconnected");
                    break;
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(1500)) => {}
        }

        let _ = app.emit("stream-logs-status", "connecting");
    }

    let _ = app.emit("stream-logs-status", "disconnected");
}
