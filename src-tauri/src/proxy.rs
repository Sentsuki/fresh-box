use crate::errors::CommandError;
use tauri_plugin_http::reqwest;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::State;
use crate::singbox::SingboxState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Proxy {
    name: String,
    type_: String,
    delay: i64,
    status: String,
}

#[tauri::command]
pub async fn get_proxies(state: State<'_, SingboxState>) -> Result<Vec<Proxy>, CommandError> {
    // 检查 singbox 是否在运行
    let is_running = {
        let process_guard = state.singbox_process.lock().unwrap();
        process_guard.is_some()
    };
    
    if !is_running {
        return Err(CommandError::ProcessNotRunning);
    }

    let client = reqwest::Client::new();
    let response = client
        .get("http://127.0.0.1:9090/proxies")
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| CommandError::FailedToStartProcess(e.to_string()))?;

    let text = response
        .text()
        .await
        .map_err(|e| CommandError::FailedToStartProcess(e.to_string()))?;

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| CommandError::FailedToStartProcess(e.to_string()))?;

    let mut proxies = Vec::new();
    if let Some(proxies_obj) = json.get("proxies") {
        if let Some(proxies_map) = proxies_obj.as_object() {
            for (name, proxy_info) in proxies_map {
                let delay = proxy_info
                    .get("delay")
                    .and_then(|d| d.as_i64())
                    .unwrap_or(-1);
                let type_ = proxy_info
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let status = proxy_info
                    .get("status")
                    .and_then(|s| s.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                proxies.push(Proxy {
                    name: name.clone(),
                    type_,
                    delay,
                    status,
                });
            }
        }
    }

    Ok(proxies)
}

#[tauri::command]
pub async fn select_proxy(state: State<'_, SingboxState>, name: String) -> Result<(), CommandError> {
    // 检查 singbox 是否在运行
    let is_running = {
        let process_guard = state.singbox_process.lock().unwrap();
        process_guard.is_some()
    };
    
    if !is_running {
        return Err(CommandError::ProcessNotRunning);
    }

    let client = reqwest::Client::new();
    let response = client
        .put(format!("http://127.0.0.1:9090/proxies/{}", name))
        .header("Content-Type", "application/json")
        .body(format!("{{\"name\":\"{}\"}}", name))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| CommandError::FailedToStartProcess(e.to_string()))?;

    if !response.status().is_success() {
        return Err(CommandError::FailedToStartProcess(format!(
            "Failed to select proxy: {}",
            response.status()
        )));
    }

    Ok(())
}