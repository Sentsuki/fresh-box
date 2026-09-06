// Crash/error reporting commands — lets the renderer record its own errors
// into `crash_reports`. Listing/reading/deleting recorded reports (native
// panics from here and from sing-box core alike) lives in
// `commands::reports` instead, merged with the daemon's own crash reports —
// see that module's doc comment.

use crate::crash_reports;
use crate::errors::CommandError;

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
