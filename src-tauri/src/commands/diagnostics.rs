// Crash/error reporting commands — the frontend's read/write access to
// `crash_reports`. Covers both directions: listing what's already been
// recorded (native panics, via `logger.rs`), and letting the renderer
// record its own errors (React errors caught by `ErrorBoundary`, which
// previously only ever reached `console.error` and were gone the moment
// the user closed the app — see `crash_reports`'s module doc comment).

use crate::crash_reports::{self, CrashReport};
use crate::errors::CommandError;

#[tauri::command]
pub async fn list_crash_reports() -> Result<Vec<CrashReport>, CommandError> {
    Ok(crash_reports::list())
}

/// Record a renderer-side error `ErrorBoundary` caught. `stack` is React's
/// component stack (`ErrorInfo.componentStack`) appended after the JS
/// error's own stack, when available — both are useful for tracing which
/// page/component actually broke.
#[tauri::command]
pub async fn record_frontend_error(
    name: String,
    message: String,
    stack: Option<String>,
) -> Result<(), CommandError> {
    let summary = format!("{name}: {message}");
    let details = match stack {
        Some(stack) => format!("{summary}\n\n{stack}"),
        None => summary.clone(),
    };
    crash_reports::write("renderer", &summary, &details);
    Ok(())
}
