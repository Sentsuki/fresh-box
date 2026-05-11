use crate::errors::CommandError;
use crate::streams::StreamsState;
use tauri::State;

#[tauri::command]
pub async fn start_traffic_stream(
    app: tauri::AppHandle,
    state: State<'_, StreamsState>,
) -> Result<(), CommandError> {
    crate::streams::start_traffic_stream(app, state).await
}

#[tauri::command]
pub async fn stop_traffic_stream(state: State<'_, StreamsState>) -> Result<(), CommandError> {
    crate::streams::stop_traffic_stream(state).await
}

#[tauri::command]
pub async fn start_memory_stream(
    app: tauri::AppHandle,
    state: State<'_, StreamsState>,
) -> Result<(), CommandError> {
    crate::streams::start_memory_stream(app, state).await
}

#[tauri::command]
pub async fn stop_memory_stream(state: State<'_, StreamsState>) -> Result<(), CommandError> {
    crate::streams::stop_memory_stream(state).await
}

#[tauri::command]
pub async fn start_connections_stream(
    app: tauri::AppHandle,
    state: State<'_, StreamsState>,
) -> Result<(), CommandError> {
    crate::streams::start_connections_stream(app, state).await
}

#[tauri::command]
pub async fn stop_connections_stream(state: State<'_, StreamsState>) -> Result<(), CommandError> {
    crate::streams::stop_connections_stream(state).await
}

#[tauri::command]
pub async fn start_logs_stream(
    app: tauri::AppHandle,
    state: State<'_, StreamsState>,
) -> Result<(), CommandError> {
    crate::streams::start_logs_stream(app, state).await
}

#[tauri::command]
pub async fn stop_logs_stream(state: State<'_, StreamsState>) -> Result<(), CommandError> {
    crate::streams::stop_logs_stream(state).await
}
