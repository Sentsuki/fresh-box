// errors.rs - 错误类型定义

#[derive(Debug, serde::Serialize)]
pub enum CommandError {
    ProcessAlreadyRunning,
    ProcessNotRunning,
    ResourceNotFound(String),
    FailedToStartProcess(String),
    FailedToStopProcess(String),
    IoError(String),
    JsonError(String),
}

impl From<std::io::Error> for CommandError {
    fn from(error: std::io::Error) -> Self {
        CommandError::IoError(error.to_string())
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(error: serde_json::Error) -> Self {
        CommandError::JsonError(error.to_string())
    }
}
