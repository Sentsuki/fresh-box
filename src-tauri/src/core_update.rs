use crate::config::{
    get_active_singbox_core_version, get_core_version_dir, get_core_versions_dir, get_data_dir,
    set_active_singbox_core_version,
};
use crate::errors::CommandError;
use crate::singbox::SingboxState;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
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
    versions_dir: PathBuf,
    target_version_dir: PathBuf,
    staged_version_dir: PathBuf,
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
    let update_paths = get_update_paths(&latest_release.archive_name, &latest_version)?;

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
        "Downloading sing-box package...",
        8,
        68,
    )
    .await?;

    emit_progress(&app, "extracting", 76, "Extracting sing-box package...");
    extract_package_files(&update_paths.zip_path, &update_paths.staged_version_dir)?;

    let restart_required = crate::singbox::is_singbox_running(state).await?;
    if restart_required && previous_version.as_deref() == Some(latest_version.as_str()) {
        return Err(CommandError::invalid_state(
            "update_singbox_core",
            format!(
                "sing-box {} is currently running. Stop sing-box before reinstalling the same core version.",
                latest_version
            ),
        ));
    }

    emit_progress(
        &app,
        "applying",
        90,
        if restart_required {
            "Switching fresh-box to the new sing-box version. Restart sing-box after the update finishes."
        } else {
            "Activating the updated sing-box package..."
        },
    );
    promote_staged_version(&update_paths)?;
    set_active_singbox_core_version(Some(latest_version.clone()))?;
    cleanup_download_artifacts(&update_paths)?;

    let current_version = get_installed_singbox_version()?.ok_or_else(|| {
        CommandError::io(
            "Updated sing-box version could not be read",
            "the active version directory does not contain sing-box.exe",
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
    let update_dir = get_data_dir()?.join("core-update");
    let versions_dir = get_core_versions_dir()?;

    if update_dir.exists() {
        for entry in fs::read_dir(&update_dir).map_err(|error| {
            CommandError::io(format!("failed to read {}", update_dir.display()), error)
        })? {
            let entry = entry.map_err(|error| {
                CommandError::io(
                    format!("failed to enumerate {}", update_dir.display()),
                    error,
                )
            })?;
            let path = entry.path();
            let file_type = entry.file_type().map_err(|error| {
                CommandError::io(format!("failed to inspect {}", path.display()), error)
            })?;

            if file_type.is_file() && path.extension().is_some_and(|ext| ext == "zip") {
                remove_file_if_exists(&path, "Failed to clean a temporary sing-box archive")?;
            }
        }
    }

    if versions_dir.exists() {
        for entry in fs::read_dir(&versions_dir).map_err(|error| {
            CommandError::io(format!("failed to read {}", versions_dir.display()), error)
        })? {
            let entry = entry.map_err(|error| {
                CommandError::io(
                    format!("failed to enumerate {}", versions_dir.display()),
                    error,
                )
            })?;
            let path = entry.path();
            let file_type = entry.file_type().map_err(|error| {
                CommandError::io(format!("failed to inspect {}", path.display()), error)
            })?;
            let file_name = entry.file_name();

            if file_type.is_dir() && file_name.to_string_lossy().ends_with(".new") {
                remove_dir_if_exists(
                    &path,
                    "Failed to clean a staged sing-box version directory on startup",
                )?;
            }
        }
    }

    Ok(())
}

fn get_update_paths(asset_name: &str, version: &str) -> Result<CoreUpdatePaths, CommandError> {
    let update_dir = get_data_dir()?.join("core-update");
    fs::create_dir_all(&update_dir).map_err(|error| {
        CommandError::io(format!("failed to create {}", update_dir.display()), error)
    })?;

    let versions_dir = get_core_versions_dir()?;
    let target_version_dir = get_core_version_dir(version)?;
    let staged_version_dir = versions_dir.join(format!("{}.new", version));

    Ok(CoreUpdatePaths {
        zip_path: update_dir.join(asset_name),
        versions_dir,
        target_version_dir,
        staged_version_dir,
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
                "Failed to prepare the download directory for the sing-box package",
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

fn extract_package_files(archive_path: &Path, staged_dir: &Path) -> Result<(), CommandError> {
    remove_dir_if_exists(
        staged_dir,
        "Failed to clear the staged sing-box version directory",
    )?;
    fs::create_dir_all(staged_dir).map_err(|error| {
        map_io_error(
            "Failed to create the staged sing-box version directory",
            staged_dir,
            error,
        )
    })?;

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

    let mut extracted_any = false;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| {
            CommandError::validation(format!(
                "Failed to read an entry from the sing-box archive: {}",
                error
            ))
        })?;

        if entry.is_dir() {
            continue;
        }

        let relative_path = archive_relative_path(entry.name())?.ok_or_else(|| {
            CommandError::validation(
                "The downloaded sing-box archive contains an invalid file path.",
            )
        })?;
        let staged_path = staged_dir.join(&relative_path);

        if let Some(parent) = staged_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                map_io_error(
                    "Failed to prepare the staged sing-box version directory",
                    parent,
                    error,
                )
            })?;
        }

        let mut staged_file = File::create(&staged_path).map_err(|error| {
            map_io_error(
                "Failed to create a staged sing-box version file",
                &staged_path,
                error,
            )
        })?;
        io::copy(&mut entry, &mut staged_file).map_err(|error| {
            map_io_error(
                "Failed to extract a file from the sing-box archive",
                &staged_path,
                error,
            )
        })?;
        staged_file.flush().map_err(|error| {
            map_io_error(
                "Failed to finalize a staged sing-box version file",
                &staged_path,
                error,
            )
        })?;
        extracted_any = true;
    }

    if !extracted_any {
        return Err(CommandError::validation(
            "The downloaded sing-box archive did not contain any files to install.",
        ));
    }

    let staged_executable = staged_dir.join(CORE_EXECUTABLE_NAME);
    if !staged_executable.exists() {
        return Err(CommandError::validation(
            "The downloaded sing-box package does not contain sing-box.exe.",
        ));
    }

    Ok(())
}

fn archive_relative_path(name: &str) -> Result<Option<PathBuf>, CommandError> {
    let normalized = name.replace('\\', "/");
    let mut components = Vec::<OsString>::new();

    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(part) => components.push(part.to_os_string()),
            Component::CurDir => {}
            Component::ParentDir => {
                return Err(CommandError::validation(
                    "The downloaded sing-box archive contains a parent-directory path.",
                ));
            }
            Component::RootDir | Component::Prefix(_) => {}
        }
    }

    if components.is_empty() {
        return Ok(None);
    }

    let relevant_components = if components.len() > 1 {
        &components[1..]
    } else {
        &components[..]
    };

    if relevant_components.is_empty() {
        return Ok(None);
    }

    let mut relative_path = PathBuf::new();
    for component in relevant_components {
        relative_path.push(component);
    }

    if relative_path.as_os_str().is_empty() {
        Ok(None)
    } else {
        Ok(Some(relative_path))
    }
}

fn promote_staged_version(paths: &CoreUpdatePaths) -> Result<(), CommandError> {
    if !paths.staged_version_dir.exists() {
        return Err(CommandError::resource_not_found(
            "staged sing-box version directory",
            paths.staged_version_dir.display(),
        ));
    }

    fs::create_dir_all(&paths.versions_dir).map_err(|error| {
        map_io_error(
            "Failed to prepare the sing-box versions directory",
            &paths.versions_dir,
            error,
        )
    })?;

    if paths.target_version_dir.exists() {
        remove_dir_if_exists(
            &paths.target_version_dir,
            "Failed to remove the existing sing-box version directory before reinstalling it",
        )?;
    }

    fs::rename(&paths.staged_version_dir, &paths.target_version_dir).map_err(|error| {
        map_io_error(
            "Failed to activate the staged sing-box version directory",
            &paths.staged_version_dir,
            error,
        )
    })
}

fn cleanup_download_artifacts(paths: &CoreUpdatePaths) -> Result<(), CommandError> {
    remove_file_if_exists(
        &paths.zip_path,
        "Failed to clean the downloaded sing-box archive",
    )?;
    remove_dir_if_exists(
        &paths.staged_version_dir,
        "Failed to clean the staged sing-box version directory",
    )?;
    Ok(())
}

fn remove_file_if_exists(path: &Path, context: &str) -> Result<(), CommandError> {
    if path.exists() {
        fs::remove_file(path).map_err(|error| map_io_error(context, path, error))?;
    }
    Ok(())
}

fn remove_dir_if_exists(path: &Path, context: &str) -> Result<(), CommandError> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| map_io_error(context, path, error))?;
    }
    Ok(())
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
    let Some(version) = get_active_singbox_core_version()? else {
        return Ok(None);
    };

    let singbox_path = get_core_version_dir(&version)?.join(CORE_EXECUTABLE_NAME);
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
