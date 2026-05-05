use thiserror::Error;

#[derive(Debug, Error, serde::Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum CommandError {
    #[error("Process is already running")]
    ProcessAlreadyRunning,
    #[error("Process is not running")]
    ProcessNotRunning,
    #[error("{0}")]
    NetworkError(String),
    #[error("{0}")]
    PermissionDenied(String),
    #[error("{0}")]
    ValidationError(String),
    #[error("{0}")]
    InvalidState(String),
    #[error("{0}")]
    ResourceNotFound(String),
    #[error("{0}")]
    FailedToStartProcess(String),
    #[error("{0}")]
    FailedToStopProcess(String),
    #[error("{0}")]
    IoError(String),
    #[error("{0}")]
    JsonError(String),
}

impl CommandError {
    pub fn network(details: impl Into<String>) -> Self {
        Self::NetworkError(details.into())
    }

    pub fn permission_denied(details: impl Into<String>) -> Self {
        Self::PermissionDenied(details.into())
    }

    pub fn validation(details: impl Into<String>) -> Self {
        Self::ValidationError(details.into())
    }

    pub fn invalid_state(context: impl Into<String>, details: impl std::fmt::Display) -> Self {
        Self::InvalidState(format!("{}: {}", context.into(), details))
    }

    pub fn resource_not_found(
        resource: impl Into<String>,
        details: impl std::fmt::Display,
    ) -> Self {
        Self::ResourceNotFound(format!("{}: {}", resource.into(), details))
    }

    pub fn io(context: impl Into<String>, error: impl std::fmt::Display) -> Self {
        Self::IoError(format!("{}: {}", context.into(), error))
    }

    pub fn json(context: impl Into<String>, error: impl std::fmt::Display) -> Self {
        Self::JsonError(format!("{}: {}", context.into(), error))
    }
}

impl From<std::io::Error> for CommandError {
    fn from(error: std::io::Error) -> Self {
        CommandError::io("I/O operation failed", error)
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(error: serde_json::Error) -> Self {
        CommandError::json("JSON operation failed", error)
    }
}
