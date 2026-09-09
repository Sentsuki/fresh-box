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
    /// 能不能打包导出。只有 daemon 记录的报告可以 —— fresh-box 自己的那几条
    /// （渲染层错误、Tauri panic）没有对应的 daemon 归档。
    ///
    /// 用一个字段而不是让前端去嗅 `app:` 前缀：那个前缀是 id 的传输形式，
    /// 不该变成 UI 的判断依据。
    pub exportable: bool,
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
        exportable: true,
    }
}

fn oom_entry_summary(entry: OomReportEntry) -> ReportSummary {
    ReportSummary {
        id: entry.name,
        time: millis_to_rfc3339(entry.recorded_at),
        is_read: entry.is_read,
        exportable: true,
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
            // daemon 那边没有这条报告，自然也打包不出来。
            exportable: false,
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

/// 把一份 daemon 记录的报告打包写到 `destination`。
///
/// 路径由前端在系统保存对话框里拿到（那是 UI 的事），实际的 RPC 与落盘在这里
/// （webview 碰不到文件系统）。`with_configuration` / `with_log` 直接透传给
/// daemon —— 报告里要不要带上当时的配置和日志，是提 issue 时才需要权衡的事，
/// 所以交给调用方决定而不是在这里替它定。
async fn write_archive(
    archive: crate::daemon::desktop_api::CrashReportArchive,
    destination: &str,
) -> Result<String, CommandError> {
    let path = std::path::PathBuf::from(destination);
    let data = archive.data;
    let written = path.clone();
    tokio::task::spawn_blocking(move || {
        std::fs::write(&written, &data).map_err(|e| CommandError::io("write report archive", e))
    })
    .await
    .map_err(|e| CommandError::invalid_state("write report archive", e.to_string()))??;
    Ok(path.display().to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn export_crash_report(
    singbox: State<'_, SingboxState>,
    id: String,
    destination: String,
    with_configuration: bool,
    with_log: bool,
) -> Result<String, CommandError> {
    if id.starts_with(APP_PREFIX) {
        // `exportable: false` 的报告不该走到这里；真走到了就说明前端在自己
        // 拼 id，明确报错而不是写出一个空档案。
        return Err(CommandError::validation(
            "This crash report was recorded by fresh-box itself and has no daemon archive",
        ));
    }
    let name = id.strip_prefix(DAEMON_PREFIX).unwrap_or(&id).to_string();
    let connection = get_connection(singbox.inner()).await?;
    let archive = connection
        .export_crash_report(name, with_configuration, with_log)
        .await?;
    write_archive(archive, &destination).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_oom_report(
    singbox: State<'_, SingboxState>,
    name: String,
    destination: String,
    with_configuration: bool,
    with_log: bool,
) -> Result<String, CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    let archive = connection
        .export_oom_report(name, with_configuration, with_log)
        .await?;
    write_archive(archive, &destination).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_power_report(
    singbox: State<'_, SingboxState>,
    name: String,
    destination: String,
    with_configuration: bool,
    with_log: bool,
) -> Result<String, CommandError> {
    let connection = get_connection(singbox.inner()).await?;
    let archive = connection
        .export_power_report(name, with_configuration, with_log)
        .await?;
    write_archive(archive, &destination).await
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

#[cfg(test)]
mod tests {
    use super::*;

    fn crash(name: &str, at: i64, read: bool) -> CrashReportEntry {
        CrashReportEntry {
            name: name.to_string(),
            crashed_at: at,
            is_read: read,
        }
    }

    #[test]
    fn daemon_crash_reports_are_prefixed_and_exportable() {
        // 前缀是 id 的传输形式：`read`/`delete`/`export` 都靠它区分这条报告
        // 归谁管。`exportable` 则是给 UI 的判断依据，免得前端自己去嗅前缀。
        let summary = crash_entry_summary(crash("2026-01-01T00-00-00", 1_700_000_000_000, false));
        assert_eq!(summary.id, "daemon:2026-01-01T00-00-00");
        assert!(summary.exportable);
        assert!(!summary.is_read);
    }

    #[test]
    fn oom_reports_carry_no_prefix() {
        // OOM / 电源报告只有 daemon 一个来源，不需要区分，所以 id 就是名字
        // 本身 —— `read_oom_report(name)` 直接拿它去调。
        let summary = oom_entry_summary(OomReportEntry {
            name: "oom-1".to_string(),
            recorded_at: 1_700_000_000_000,
            is_read: true,
        });
        assert_eq!(summary.id, "oom-1");
        assert!(summary.is_read);
        assert!(summary.exportable);
    }

    #[test]
    fn timestamps_become_rfc3339() {
        assert_eq!(
            millis_to_rfc3339(0),
            chrono::DateTime::from_timestamp_millis(0)
                .expect("epoch")
                .to_rfc3339()
        );
        assert!(millis_to_rfc3339(1_700_000_000_000).starts_with("2023-11-"));
    }

    #[test]
    fn an_unrepresentable_timestamp_becomes_an_empty_string_not_a_panic() {
        // daemon 送来的是 int64 毫秒；坏数据不该让整个报告列表挂掉，最多是
        // 那一行没有时间显示。
        assert_eq!(millis_to_rfc3339(i64::MIN), "");
        assert_eq!(millis_to_rfc3339(i64::MAX), "");
    }

    #[test]
    fn a_memory_profile_is_marked_binary_and_not_inlined() {
        // 内存 profile 是 pprof 二进制，塞进 JSON 会变成一大坨乱码 ——
        // 前端据 `is_binary` 只显示文件名。
        let views = oom_files_view(vec![OomReportFile {
            name: "heap.pprof".to_string(),
            content: vec![0x1f, 0x8b, 0x00, 0xff],
            is_profile: true,
        }]);
        assert_eq!(views.len(), 1);
        assert!(views[0].is_binary);
        assert!(views[0].content.is_none());
    }

    #[test]
    fn a_text_file_is_inlined() {
        let views = oom_files_view(vec![OomReportFile {
            name: "report.txt".to_string(),
            content: b"out of memory".to_vec(),
            is_profile: false,
        }]);
        assert!(!views[0].is_binary);
        assert_eq!(views[0].content.as_deref(), Some("out of memory"));
    }

    #[test]
    fn invalid_utf8_in_a_text_file_is_replaced_rather_than_dropped() {
        // `from_utf8_lossy`：宁可显示替换字符，也不要因为一个坏字节就让整份
        // 报告读不出来 —— 这些报告的用途就是出问题之后拿来看。
        let views = oom_files_view(vec![OomReportFile {
            name: "report.txt".to_string(),
            content: vec![b'o', b'k', 0xff],
            is_profile: false,
        }]);
        let content = views[0].content.as_deref().expect("text file is inlined");
        assert!(content.starts_with("ok"));
        assert!(content.contains('\u{fffd}'));
    }
}
