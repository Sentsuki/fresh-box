// tools.rs — one-shot network diagnostics (network quality / STUN test),
// run through the currently running sing-box instance's own outbound(s) via
// `StartedService.StartNetworkQualityTest`/`StartSTUNTest`. Each is a single
// gRPC server-streaming call: this module spawns a task that drains it and
// republishes every step as a Tauri event, exactly like `services::streams`
// does for traffic/logs/connections — except there's no reconnect loop here
// (a test just runs to completion, or is cancelled), so it's a much smaller
// version of the same "spawn a task, replace-and-cancel the previous one on
// a new start" shape.
//
// Unlike `services::streams`, a test isn't tied to the daemon-level
// reconciliation loop's own retry/backoff — it's a single explicit user
// action against whatever connection happens to be up right now. If the
// daemon connection isn't currently available, the start command just fails
// outright (`CommandError::ProcessNotRunning` via `get_connection`) rather
// than waiting around for one.

use serde_json::json;
use tauri::Emitter;
use tokio::sync::{Mutex, watch};

use crate::daemon::daemon_api::{NetworkQualityTestRequest, StunTestRequest};
use crate::errors::CommandError;
use crate::services::singbox::{SingboxState, get_connection};

pub const NETWORK_QUALITY_EVENT: &str = "tools-network-quality-progress";
pub const STUN_TEST_EVENT: &str = "tools-stun-test-progress";

pub struct ToolsState {
    network_quality: Mutex<Option<watch::Sender<bool>>>,
    stun_test: Mutex<Option<watch::Sender<bool>>>,
}

impl ToolsState {
    pub fn new() -> Self {
        Self {
            network_quality: Mutex::new(None),
            stun_test: Mutex::new(None),
        }
    }
}

impl Default for ToolsState {
    fn default() -> Self {
        Self::new()
    }
}

/// Replaces (and cancels) whatever task previously held this slot, and
/// returns the new "am I still the current run" receiver for the task about
/// to be spawned — mirrors `services::streams::start_stream_slot`.
async fn start_slot(slot: &Mutex<Option<watch::Sender<bool>>>) -> watch::Receiver<bool> {
    let (tx, rx) = watch::channel(false);
    let mut guard = slot.lock().await;
    if let Some(old_tx) = guard.replace(tx) {
        let _ = old_tx.send(true);
    }
    rx
}

async fn cancel_slot(slot: &Mutex<Option<watch::Sender<bool>>>) {
    if let Some(tx) = slot.lock().await.take() {
        let _ = tx.send(true);
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkQualityTestOptions {
    // `rename_all = "camelCase"` would otherwise expect `configUrl` — kept
    // as `configURL` to match the frontend's `NetworkQualityTestOptions`
    // (itself matching the proto field's own `configURL` spelling).
    #[serde(rename = "configURL")]
    pub config_url: String,
    pub outbound_tag: String,
    pub serial: bool,
    pub http3: bool,
    pub max_runtime_seconds: i32,
}

pub async fn start_network_quality_test(
    app: tauri::AppHandle,
    tools: tauri::State<'_, ToolsState>,
    singbox: tauri::State<'_, SingboxState>,
    options: NetworkQualityTestOptions,
) -> Result<(), CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    let mut cancelled = start_slot(&tools.network_quality).await;

    let mut stream = connection
        .start_network_quality_test(NetworkQualityTestRequest {
            config_url: options.config_url,
            outbound_tag: options.outbound_tag,
            serial: options.serial,
            max_runtime_seconds: options.max_runtime_seconds,
            http3: options.http3,
        })
        .await?;

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = cancelled.changed() => return,
                message = stream.message() => {
                    match message {
                        Ok(Some(progress)) => {
                            let is_final = progress.is_final;
                            let _ = app.emit(
                                NETWORK_QUALITY_EVENT,
                                json!({
                                    "phase": progress.phase,
                                    "downloadCapacity": progress.download_capacity,
                                    "uploadCapacity": progress.upload_capacity,
                                    "downloadRPM": progress.download_rpm,
                                    "uploadRPM": progress.upload_rpm,
                                    "idleLatencyMs": progress.idle_latency_ms,
                                    "elapsedMs": progress.elapsed_ms,
                                    "isFinal": is_final,
                                    "error": progress.error,
                                    "downloadCapacityAccuracy": progress.download_capacity_accuracy,
                                    "uploadCapacityAccuracy": progress.upload_capacity_accuracy,
                                    "downloadRPMAccuracy": progress.download_rpm_accuracy,
                                    "uploadRPMAccuracy": progress.upload_rpm_accuracy,
                                }),
                            );
                            if is_final {
                                return;
                            }
                        }
                        Ok(None) => return,
                        Err(status) => {
                            let _ = app.emit(
                                NETWORK_QUALITY_EVENT,
                                json!({ "isFinal": true, "error": status.message() }),
                            );
                            return;
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

pub async fn cancel_network_quality_test(
    tools: tauri::State<'_, ToolsState>,
) -> Result<(), CommandError> {
    cancel_slot(&tools.network_quality).await;
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StunTestOptions {
    pub server: String,
    pub outbound_tag: String,
}

pub async fn start_stun_test(
    app: tauri::AppHandle,
    tools: tauri::State<'_, ToolsState>,
    singbox: tauri::State<'_, SingboxState>,
    options: StunTestOptions,
) -> Result<(), CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    let mut cancelled = start_slot(&tools.stun_test).await;

    let mut stream = connection
        .start_stun_test(StunTestRequest {
            server: options.server,
            outbound_tag: options.outbound_tag,
        })
        .await?;

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = cancelled.changed() => return,
                message = stream.message() => {
                    match message {
                        Ok(Some(progress)) => {
                            let is_final = progress.is_final;
                            let _ = app.emit(
                                STUN_TEST_EVENT,
                                json!({
                                    "phase": progress.phase,
                                    "externalAddr": progress.external_addr,
                                    "latencyMs": progress.latency_ms,
                                    "natMapping": progress.nat_mapping,
                                    "natFiltering": progress.nat_filtering,
                                    "isFinal": is_final,
                                    "error": progress.error,
                                    "natTypeSupported": progress.nat_type_supported,
                                }),
                            );
                            if is_final {
                                return;
                            }
                        }
                        Ok(None) => return,
                        Err(status) => {
                            let _ = app.emit(
                                STUN_TEST_EVENT,
                                json!({ "isFinal": true, "error": status.message() }),
                            );
                            return;
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

pub async fn cancel_stun_test(tools: tauri::State<'_, ToolsState>) -> Result<(), CommandError> {
    cancel_slot(&tools.stun_test).await;
    Ok(())
}
