use crate::config::{get_bin_dir, get_data_dir};
use crate::errors::CommandError;
use crate::singbox::SingboxState;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, State};

const GITHUB_RELEASE_API: &str = "https://api.github.com/repos/SagerNet/sing-box/releases/latest";
const WINDOWS_AMD64_ASSET_SUFFIX: &str = "windows-amd64.zip";
const CORE_UPDATE_PROGRESS_EVENT: &str = "core-update-progress";
const CORE_EXECUTABLE_NAME: &str = "sing-box.exe";

#[derive(Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct LatestReleaseResponse {
    tag_name: String,
    assets: Vec<ReleaseAsset>,
}

struct LatestReleaseMetadata {
    tag: String,
    archive_name: String,
    archive_url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct CoreUpdateProgressEvent {
    stage: String,
    percent: u8,
    message: String,
}

#[derive(Serialize)]
pub struct SingboxCoreStatus {
    pub installed: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub is_running: bool,
}

#[derive(Serialize)]
pub struct SingboxCoreUpdateResult {
    pub previous_version: Option<String>,
    pub current_version: String,
    pub latest_version: String,
    pub restart_required: bool,
}

struct CoreUpdatePaths {
    zip_path: PathBuf,
    executable_path: PathBuf,
    staged_path: PathBuf,
    backup_path: PathBuf,
}

#[tauri::command]
pub async fn get_singbox_core_status(
    state: State<'_, SingboxState>,
) -> Result<SingboxCoreStatus, CommandError> {
    let is_running = crate::singbox::is_singbox_running(state).await?;
    let current_version = get_installed_singbox_version()?;
    let latest_release = fetch_latest_release_metadata().await?;
    let latest_version = normalized_version(&latest_release.tag).or(Some(latest_release.tag));
    let update_available = match (&current_version, &latest_version) {
        (Some(current), Some(latest)) => current != latest,
        (None, Some(_)) => true,
        _ => false,
    };

    Ok(SingboxCoreStatus {
        installed: current_version.is_some(),
        current_version,
        latest_version,
        update_available,
        is_running,
    })
}

#[tauri::command]
pub async fn update_singbox_core(
    app: AppHandle,
    state: State<'_, SingboxState>,
) -> Result<SingboxCoreUpdateResult, CommandError> {
    cleanup_staged_core_update_files()?;
    emit_progress(
        &app,
        "preparing",
        5,
        "Checking the latest sing-box release...",
    );

    let previous_version = get_installed_singbox_version()?;
    let latest_release = fetch_latest_release_metadata().await?;
    let latest_version =
        normalized_version(&latest_release.tag).unwrap_or(latest_release.tag.clone());
    let update_paths = get_update_paths(&latest_release.archive_name)?;

    emit_progress(
        &app,
        "downloading",
        8,
        format!("Downloading {}...", latest_release.archive_name),
    );
    download_file_with_progress(
        &app,
        &latest_release.archive_url,
        &update_paths.zip_path,
        "Downloading sing-box core...",
        8,
        68,
    )
    .await?;

    emit_progress(&app, "extracting", 76, "Extracting sing-box.exe...");
    extract_core_executable(&update_paths.zip_path, &update_paths.staged_path)?;

    let restart_required = crate::singbox::is_singbox_running(state).await?;
    emit_progress(
        &app,
        "applying",
        90,
        if restart_required {
            "Replacing sing-box.exe. Restart sing-box after the update finishes."
        } else {
            "Applying the updated sing-box core..."
        },
    );
    apply_staged_core_update(&update_paths, restart_required)?;
    cleanup_download_artifacts(&update_paths)?;

    let current_version = get_installed_singbox_version()?.ok_or_else(|| {
        CommandError::io(
            "Updated sing-box version could not be read",
            "sing-box.exe is missing",
        )
    })?;
    if current_version != latest_version {
        return Err(CommandError::validation(format!(
            "Installed sing-box version {} does not match the downloaded release {}.",
            current_version, latest_version
        )));
    }

    emit_progress(
        &app,
        "complete",
        100,
        if restart_required {
            "Core update completed. Restart sing-box to start using the new version."
        } else {
            "Core update completed."
        },
    );

    Ok(SingboxCoreUpdateResult {
        previous_version,
        current_version,
        latest_version,
        restart_required,
    })
}

pub fn cleanup_staged_core_update_files_directly() -> Result<(), CommandError> {
    cleanup_staged_core_update_files()
}

fn cleanup_staged_core_update_files() -> Result<(), CommandError> {
    let paths = get_update_paths("cleanup.zip")?;

    if !paths.executable_path.exists() {
        if paths.staged_path.exists() {
            rename_file(
                &paths.staged_path,
                &paths.executable_path,
                "Failed to restore the staged sing-box executable on startup",
            )?;
        } else if paths.backup_path.exists() {
            rename_file(
                &paths.backup_path,
                &paths.executable_path,
                "Failed to restore the previous sing-box executable on startup",
            )?;
        }
    }

    if paths.executable_path.exists() && paths.staged_path.exists() {
        remove_file_if_exists(
            &paths.staged_path,
            "Failed to clean the staged sing-box executable on startup",
        )?;
    }

    if paths.executable_path.exists() && paths.backup_path.exists() {
        remove_file_if_exists(
            &paths.backup_path,
            "Failed to clean the previous sing-box executable on startup",
        )?;
    }

    cleanup_download_artifacts(&paths)?;
    Ok(())
}

fn get_update_paths(asset_name: &str) -> Result<CoreUpdatePaths, CommandError> {
    let bin_dir = get_bin_dir()?;
    let update_dir = get_data_dir()?.join("core-update");
    fs::create_dir_all(&update_dir).map_err(|error| {
        map_io_error(
            "Failed to prepare the sing-box core update directory",
            &update_dir,
            error,
        )
    })?;
    fs::create_dir_all(&bin_dir).map_err(|error| {
        map_io_error(
            "Failed to prepare the sing-box bin directory",
            &bin_dir,
            error,
        )
    })?;

    let executable_path = bin_dir.join(CORE_EXECUTABLE_NAME);

    Ok(CoreUpdatePaths {
        zip_path: update_dir.join(asset_name),
        executable_path: executable_path.clone(),
        staged_path: executable_path.with_extension("exe.new"),
        backup_path: executable_path.with_extension("exe.old"),
    })
}

async fn fetch_latest_release_metadata() -> Result<LatestReleaseMetadata, CommandError> {
    let response = github_client()?
        .get(GITHUB_RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| map_network_error("Failed to reach GitHub", error))?
        .error_for_status()
        .map_err(|error| map_network_error("GitHub rejected the release metadata request", error))?
        .json::<LatestReleaseResponse>()
        .await
        .map_err(|error| {
            map_network_error(
                "Failed to parse the latest sing-box release metadata",
                error,
            )
        })?;

    let archive = response
        .assets
        .iter()
        .find(|asset| asset.name.ends_with(WINDOWS_AMD64_ASSET_SUFFIX))
        .ok_or_else(|| {
            CommandError::validation(
                "No Windows amd64 sing-box core asset was found in the latest GitHub release.",
            )
        })?;

    Ok(LatestReleaseMetadata {
        tag: response.tag_name,
        archive_name: archive.name.clone(),
        archive_url: archive.browser_download_url.clone(),
    })
}

async fn download_file_with_progress(
    app: &AppHandle,
    url: &str,
    destination: &Path,
    message: &str,
    start_percent: u8,
    end_percent: u8,
) -> Result<(), CommandError> {
    let response = github_client()?
        .get(url)
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .map_err(|error| map_network_error("Failed to download the sing-box release asset", error))?
        .error_for_status()
        .map_err(|error| {
            map_network_error("GitHub rejected the sing-box download request", error)
        })?;

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            map_io_error(
                "Failed to prepare the download directory for the sing-box core",
                parent,
                error,
            )
        })?;
    }

    remove_file_if_exists(destination, "Failed to clear the previous sing-box archive")?;

    let mut file = File::create(destination).map_err(|error| {
        map_io_error(
            "Failed to create the temporary sing-box archive",
            destination,
            error,
        )
    })?;
    let total_size = response.content_length();
    let mut downloaded = 0_u64;
    let mut last_percent = start_percent;
    emit_progress(app, "downloading", start_percent, message);

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|error| map_network_error("The sing-box download was interrupted", error))?;
        file.write_all(&chunk).map_err(|error| {
            map_io_error(
                "Failed to write the downloaded sing-box archive to disk",
                destination,
                error,
            )
        })?;
        downloaded += chunk.len() as u64;

        if let Some(total_size) = total_size {
            let percent = scale_progress(downloaded, total_size, start_percent, end_percent);
            if percent > last_percent {
                last_percent = percent;
                emit_progress(app, "downloading", percent, message);
            }
        }
    }

    file.flush().map_err(|error| {
        map_io_error(
            "Failed to finalize the downloaded sing-box archive",
            destination,
            error,
        )
    })?;

    Ok(())
}

fn extract_core_executable(archive_path: &Path, staged_path: &Path) -> Result<(), CommandError> {
    remove_file_if_exists(
        staged_path,
        "Failed to clear the staged sing-box executable",
    )?;

    let archive_file = File::open(archive_path).map_err(|error| {
        map_io_error(
            "Failed to open the downloaded sing-box archive",
            archive_path,
            error,
        )
    })?;
    let mut archive = zip::ZipArchive::new(archive_file).map_err(|error| {
        CommandError::validation(format!(
            "The downloaded sing-box archive could not be opened: {}",
            error
        ))
    })?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| {
            CommandError::validation(format!(
                "Failed to read an entry from the sing-box archive: {}",
                error
            ))
        })?;
        let entry_name = entry.name().replace('\\', "/");
        if entry_name.ends_with("/sing-box.exe") || entry_name == CORE_EXECUTABLE_NAME {
            let mut staged_file = File::create(staged_path).map_err(|error| {
                map_io_error(
                    "Failed to create the staged sing-box executable",
                    staged_path,
                    error,
                )
            })?;
            io::copy(&mut entry, &mut staged_file).map_err(|error| {
                map_io_error(
                    "Failed to extract sing-box.exe from the downloaded archive",
                    staged_path,
                    error,
                )
            })?;
            staged_file.flush().map_err(|error| {
                map_io_error(
                    "Failed to finalize the staged sing-box executable",
                    staged_path,
                    error,
                )
            })?;
            return Ok(());
        }
    }

    Err(CommandError::validation(
        "sing-box.exe was not found in the downloaded archive.",
    ))
}

fn apply_staged_core_update(
    paths: &CoreUpdatePaths,
    restart_required: bool,
) -> Result<(), CommandError> {
    if !paths.staged_path.exists() {
        return Err(CommandError::resource_not_found(
            "staged sing-box executable",
            paths.staged_path.display(),
        ));
    }

    remove_file_if_exists(
        &paths.backup_path,
        "Failed to clear the previous sing-box backup",
    )?;

    let had_existing_core = paths.executable_path.exists();
    if had_existing_core {
        rename_file(
            &paths.executable_path,
            &paths.backup_path,
            "Failed to move the current sing-box executable out of the way",
        )?;
    }

    if let Err(error) = rename_file(
        &paths.staged_path,
        &paths.executable_path,
        "Failed to place the new sing-box executable",
    ) {
        if had_existing_core && paths.backup_path.exists() && !paths.executable_path.exists() {
            let _ = fs::rename(&paths.backup_path, &paths.executable_path);
        }
        return Err(error);
    }

    if !restart_required {
        remove_file_if_exists(
            &paths.backup_path,
            "Failed to remove the previous sing-box backup after the update",
        )?;
    }

    Ok(())
}

fn cleanup_download_artifacts(paths: &CoreUpdatePaths) -> Result<(), CommandError> {
    remove_file_if_exists(
        &paths.zip_path,
        "Failed to clean the downloaded sing-box archive",
    )?;
    Ok(())
}

fn remove_file_if_exists(path: &Path, context: &str) -> Result<(), CommandError> {
    if path.exists() {
        fs::remove_file(path).map_err(|error| map_io_error(context, path, error))?;
    }
    Ok(())
}

fn rename_file(source: &Path, target: &Path, context: &str) -> Result<(), CommandError> {
    fs::rename(source, target).map_err(|error| map_io_error(context, source, error))
}

fn scale_progress(downloaded: u64, total: u64, start_percent: u8, end_percent: u8) -> u8 {
    if total == 0 || end_percent <= start_percent {
        return end_percent;
    }

    let span = u64::from(end_percent - start_percent);
    let progressed = downloaded.saturating_mul(span) / total;
    let value = u64::from(start_percent) + progressed;
    value.min(u64::from(end_percent)) as u8
}

fn emit_progress(app: &AppHandle, stage: &str, percent: u8, message: impl Into<String>) {
    let _ = app.emit(
        CORE_UPDATE_PROGRESS_EVENT,
        CoreUpdateProgressEvent {
            stage: stage.to_string(),
            percent,
            message: message.into(),
        },
    );
}

fn github_client() -> Result<Client, CommandError> {
    Client::builder()
        .user_agent("fresh-box")
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|error| {
            CommandError::network(format!("Failed to initialize the HTTP client: {}", error))
        })
}

fn map_network_error(context: &str, error: reqwest::Error) -> CommandError {
    if error.is_timeout() {
        return CommandError::network(format!(
            "{}: request timed out. Check your network connection and try again.",
            context
        ));
    }

    if error.is_connect() {
        return CommandError::network(format!(
            "{}: could not connect to GitHub. Check your network connection or proxy settings.",
            context
        ));
    }

    if let Some(status) = error.status() {
        let hint = match status.as_u16() {
            401 | 403 => {
                "GitHub refused the request. You may be rate limited or blocked by a proxy."
            }
            404 => "GitHub could not find the requested release asset.",
            500..=599 => "GitHub is currently unavailable. Please try again later.",
            _ => "The request failed unexpectedly.",
        };
        return CommandError::network(format!("{}: {} (HTTP {}).", context, hint, status));
    }

    CommandError::network(format!("{}: {}", context, error))
}

fn map_io_error(context: &str, path: &Path, error: io::Error) -> CommandError {
    if error.kind() == io::ErrorKind::PermissionDenied {
        return CommandError::permission_denied(format!(
            "{}: {}. Make sure fresh-box can write to {} and close other programs that may be using it.",
            context,
            error,
            path.display()
        ));
    }

    CommandError::io(format!("{} ({})", context, path.display()), error)
}

fn get_installed_singbox_version() -> Result<Option<String>, CommandError> {
    let singbox_path = get_bin_dir()?.join(CORE_EXECUTABLE_NAME);
    if !singbox_path.exists() {
        return Ok(None);
    }

    let mut command = Command::new(&singbox_path);
    hide_window(&mut command);

    let output = command.arg("version").output().map_err(|error| {
        map_io_error(
            "Failed to read the installed sing-box version",
            &singbox_path,
            error,
        )
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let reason = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("exit code {:?}", output.status.code())
        };

        return Err(CommandError::io(
            format!(
                "Failed to read the installed sing-box version ({})",
                singbox_path.display()
            ),
            reason,
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .unwrap_or_default();

    if first_line.is_empty() {
        return Ok(None);
    }

    Ok(normalized_version(first_line).or_else(|| Some(first_line.to_string())))
}

fn normalized_version(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let candidate = trimmed
        .split_whitespace()
        .find(|segment| {
            let lowered = segment.trim_start_matches('v');
            lowered.chars().next().is_some_and(|ch| ch.is_ascii_digit())
        })
        .unwrap_or(trimmed);

    let cleaned = candidate
        .trim()
        .trim_start_matches('v')
        .trim_matches(|ch: char| {
            !ch.is_ascii_alphanumeric() && ch != '.' && ch != '-' && ch != '+'
        });

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

fn hide_window(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}
