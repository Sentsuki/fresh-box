// errors.rs - 错误类型定义

#[derive(Debug, serde::Serialize)]
pub enum CommandError {
    ProcessAlreadyRunning,
    ProcessNotRunning,
    ResourceNotFound(String),
    FailedToStartProcess(String),
    FailedToStopProcess(String),
}