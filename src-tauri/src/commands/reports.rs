// reports.rs — crash/OOM/power report commands for the Advanced page.
//
// Crash reports are merged from two sources, mirroring the official desktop
// client's `app:`/`daemon:` prefixing (`reports.ts` upstream): fresh-box's
// own `crash_reports` module (native Tauri panics + renderer errors caught
// by `ErrorBoundary`, see that module's doc comment) and the daemon's own
// `DesktopService.ListCrashReports` (sing-box core panics). OOM and power
// reports only ever come from the daemon — fresh-box itself has no OOM
// killer or power-event tracking of its own.

use crate::crash_reports;
use crate::daemon::desktop_api::{CrashReportEntry, OomReportEntry, OomReportFile};
use crate::errors::CommandError;
use crate::services::singbox::{SingboxState, get_connection};
use tauri::State;

const APP_PREFIX: &str = "app:";
const DAEMON_PREFIX: &str = "daemon:";

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReportSummary {
    pub id: String,
    /// RFC3339.
    pub time: String,
    pub is_read: bool,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReportFileView {
    pub name: String,
    /// `None` for a binary file (a memory profile) that isn't shown inline.
    pub content: Option<String>,
    pub is_binary: bool,
}

fn millis_to_rfc3339(millis: i64) -> String {
    chrono::DateTime::from_timestamp_millis(millis)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

fn crash_entry_summary(entry: CrashReportEntry) -> ReportSummary {
    ReportSummary {
        id: format!("{DAEMON_PREFIX}{}", entry.name),
        time: millis_to_rfc3339(entry.crashed_at),
        is_read: entry.is_read,
    }
}

fn oom_entry_summary(entry: OomReportEntry) -> ReportSummary {
    ReportSummary {
        id: entry.name,
        time: millis_to_rfc3339(entry.recorded_at),
        is_read: entry.is_read,
    }
}

fn oom_files_view(files: Vec<OomReportFile>) -> Vec<ReportFileView> {
    files
        .into_iter()
        .map(|file| {
            if file.is_profile {
                ReportFileView {
                    name: file.name,
                    content: None,
                    is_binary: true,
                }
            } else {
                ReportFileView {
                    name: file.name,
                    content: Some(String::from_utf8_lossy(&file.content).into_owned()),
                    is_binary: false,
                }
            }
        })
        .collect()
}

// ── Crash reports (merged app + daemon) ─────────────────────────────────

#[tauri::command]
#[specta::specta]
pub async fn list_crash_reports_all(
    singbox: State<'_, SingboxState>,
) -> Result<Vec<ReportSummary>, CommandError> {
    let mut reports: Vec<ReportSummary> = crash_reports::list()
        .into_iter()
        .map(|r| ReportSummary {
            id: format!("{APP_PREFIX}{}", r.id),
            time: r.time,
            // fresh-box's own app-level reports have no read/unread
            // tracking of their own (there's nowhere near as many of these
            // as sing-box-core crashes, and no other client reads them) —
            // always reporting them read just means they never contribute
            // to an unread badge.
            is_read: true,
        })
        .collect();

    // Best-effort: if the daemon isn't reachable right now, still show
    // whatever app-level reports exist rather than failing the whole list.
    if let Ok(connection) = get_connection(singbox.inner()).await
        && let Ok(daemon_reports) = connection.list_crash_reports().await
    {
        reports.extend(daemon_reports.into_iter().map(crash_entry_summary));
    }

    reports.sort_by(|a, b| b.time.cmp(&a.time));
    Ok(reports)
}

#[tauri::command]
#[specta::specta]
pub async fn read_crash_report(
    singbox: State<'_, SingboxState>,
    id: String,
) -> Result<Vec<ReportFileView>, CommandError> {
    if let Some(name) = id.strip_prefix(APP_PREFIX) {
        let report = crash_reports::read(name)
            .ok_or_else(|| CommandError::resource_not_found("crash report", name))?;
        return Ok(vec![ReportFileView {
            name: "crash.txt".to_string(),
            content: Some(format!("{}\n\n{}", report.summary, report.details)),
            is_binary: false,
        }]);
    }

    let name = id.strip_prefix(DAEMON_PREFIX).unwrap_or(&id).to_string();
    let connection = get_connection(singbox.inner()).await?;
    let files = connection.read_crash_report(name.clone()).await?;
    let _ = connection.mark_crash_report_read(name).await;
    Ok(files
        .into_iter()
        .map(|file| ReportFileView {
            name: file.name,
            content: Some(file.content),
            is_binary: false,
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_crash_report(
    singbox: State<'_, SingboxState>,
    id: String,
) -> Result<(), CommandError> {
    if let Some(name) = id.strip_prefix(APP_PREFIX) {
        crash_reports::delete(name);
        return Ok(());
    }
    let name = id.strip_prefix(DAEMON_PREFIX).unwrap_or(&id).to_string();
    let connection = get_connection(singbox.inner()).await?;
    connection.delete_crash_report(name).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_all_crash_reports(
    singbox: State<'_, SingboxState>,
) -> Result<(), CommandError> {
    crash_reports::delete_all();
    if let Ok(connection) = get_connection(singbox.inner()).await {
        let _ = connection.delete_all_crash_reports().await;
    }
    Ok(())
}

// ── OOM reports ──────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub async fn list_oom_reports(
    singbox: State<'_, SingboxState>,
) -> Result<Vec<ReportSummary>, CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    let reports = connection.list_oom_reports().await?;
    let mut summaries: Vec<ReportSummary> = reports.into_iter().map(oom_entry_summary).collect();
    summaries.sort_by(|a, b| b.time.cmp(&a.time));
    Ok(summaries)
}

#[tauri::command]
#[specta::specta]
pub async fn read_oom_report(
    singbox: State<'_, SingboxState>,
    name: String,
) -> Result<Vec<ReportFileView>, CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    let files = connection.read_oom_report(name.clone()).await?;
    let _ = connection.mark_oom_report_read(name).await;
    Ok(oom_files_view(files))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_oom_report(
    singbox: State<'_, SingboxState>,
    name: String,
) -> Result<(), CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    connection.delete_oom_report(name).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_all_oom_reports(singbox: State<'_, SingboxState>) -> Result<(), CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    connection.delete_all_oom_reports().await
}

// ── Power reports ────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub async fn list_power_reports(
    singbox: State<'_, SingboxState>,
) -> Result<Vec<ReportSummary>, CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    let reports = connection.list_power_reports().await?;
    let mut summaries: Vec<ReportSummary> = reports.into_iter().map(oom_entry_summary).collect();
    summaries.sort_by(|a, b| b.time.cmp(&a.time));
    Ok(summaries)
}

#[tauri::command]
#[specta::specta]
pub async fn read_power_report(
    singbox: State<'_, SingboxState>,
    name: String,
) -> Result<Vec<ReportFileView>, CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    let files = connection.read_power_report(name.clone()).await?;
    let _ = connection.mark_power_report_read(name).await;
    Ok(oom_files_view(files))
}

#[tauri::command]
#[specta::specta]
pub async fn delete_power_report(
    singbox: State<'_, SingboxState>,
    name: String,
) -> Result<(), CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    connection.delete_power_report(name).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_all_power_reports(
    singbox: State<'_, SingboxState>,
) -> Result<(), CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    connection.delete_all_power_reports().await
}
