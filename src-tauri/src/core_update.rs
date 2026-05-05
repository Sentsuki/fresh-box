use crate::config::{get_bin_dir, get_data_dir};
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
    bin_dir: PathBuf,
    staged_dir: PathBuf,
    backup_dir: PathBuf,
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
        "Downloading sing-box package...",
        8,
        68,
    )
    .await?;

    emit_progress(&app, "extracting", 76, "Extracting sing-box package...");
    extract_package_files(&update_paths.zip_path, &update_paths.staged_dir)?;

    let restart_required = crate::singbox::is_singbox_running(state).await?;
    emit_progress(
        &app,
        "applying",
        90,
        if restart_required {
            "Replacing sing-box files. Restart sing-box after the update finishes."
        } else {
            "Applying the updated sing-box package..."
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

    recover_staged_files(&paths)?;
    recover_backup_files(&paths)?;
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

    Ok(CoreUpdatePaths {
        zip_path: update_dir.join(asset_name),
        staged_dir: update_dir.join("package.new"),
        backup_dir: update_dir.join("package.old"),
        bin_dir,
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
        "Failed to clear the staged sing-box package directory",
    )?;
    fs::create_dir_all(staged_dir).map_err(|error| {
        map_io_error(
            "Failed to create the staged sing-box package directory",
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
                    "Failed to prepare the staged sing-box package directory",
                    parent,
                    error,
                )
            })?;
        }

        let mut staged_file = File::create(&staged_path).map_err(|error| {
            map_io_error(
                "Failed to create a staged sing-box package file",
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
                "Failed to finalize a staged sing-box package file",
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

fn apply_staged_core_update(
    paths: &CoreUpdatePaths,
    restart_required: bool,
) -> Result<(), CommandError> {
    let relative_files = collect_relative_files(&paths.staged_dir)?;
    if relative_files.is_empty() {
        return Err(CommandError::validation(
            "No staged sing-box package files were found to apply.",
        ));
    }

    remove_dir_if_exists(
        &paths.backup_dir,
        "Failed to clear the previous sing-box package backup",
    )?;

    let mut backed_up = Vec::<PathBuf>::new();
    let mut installed = Vec::<PathBuf>::new();

    for relative_path in &relative_files {
        let staged_path = paths.staged_dir.join(relative_path);
        let target_path = paths.bin_dir.join(relative_path);
        let backup_path = paths.backup_dir.join(relative_path);

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                map_io_error(
                    "Failed to prepare the target directory for a sing-box package file",
                    parent,
                    error,
                )
            })?;
        }

        if target_path.exists() {
            if let Some(parent) = backup_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    map_io_error(
                        "Failed to prepare the backup directory for a sing-box package file",
                        parent,
                        error,
                    )
                })?;
            }

            rename_file(
                &target_path,
                &backup_path,
                "Failed to move an existing sing-box package file out of the way",
            )?;
            backed_up.push(relative_path.clone());
        }

        if let Err(error) = rename_file(
            &staged_path,
            &target_path,
            "Failed to place a new sing-box package file",
        ) {
            rollback_package_apply(paths, &installed, &backed_up);
            return Err(error);
        }

        installed.push(relative_path.clone());
    }

    remove_dir_if_exists(
        &paths.staged_dir,
        "Failed to clear the staged sing-box package directory after the update",
    )?;

    if !restart_required {
        remove_dir_if_exists(
            &paths.backup_dir,
            "Failed to clear the previous sing-box package backup after the update",
        )?;
    }

    Ok(())
}

fn rollback_package_apply(paths: &CoreUpdatePaths, installed: &[PathBuf], backed_up: &[PathBuf]) {
    for relative_path in installed.iter().rev() {
        let staged_path = paths.staged_dir.join(relative_path);
        let target_path = paths.bin_dir.join(relative_path);

        if target_path.exists() {
            if let Some(parent) = staged_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::rename(&target_path, &staged_path);
        }
    }

    for relative_path in backed_up.iter().rev() {
        let backup_path = paths.backup_dir.join(relative_path);
        let target_path = paths.bin_dir.join(relative_path);

        if backup_path.exists() {
            if let Some(parent) = target_path.parent() {
                let _ = fs::create_dir_all(parent);
            }

            if target_path.exists() {
                let _ = fs::remove_file(&target_path);
            }

            let _ = fs::rename(&backup_path, &target_path);
        }
    }
}

fn recover_staged_files(paths: &CoreUpdatePaths) -> Result<(), CommandError> {
    let relative_files = collect_relative_files(&paths.staged_dir)?;

    for relative_path in relative_files {
        let staged_path = paths.staged_dir.join(&relative_path);
        let target_path = paths.bin_dir.join(&relative_path);

        if target_path.exists() {
            remove_file_if_exists(
                &staged_path,
                "Failed to clean a staged sing-box package file on startup",
            )?;
            continue;
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                map_io_error(
                    "Failed to prepare the target directory while recovering a staged sing-box package file",
                    parent,
                    error,
                )
            })?;
        }

        rename_file(
            &staged_path,
            &target_path,
            "Failed to recover a staged sing-box package file on startup",
        )?;
    }

    remove_dir_if_exists(
        &paths.staged_dir,
        "Failed to clean the staged sing-box package directory on startup",
    )?;

    Ok(())
}

fn recover_backup_files(paths: &CoreUpdatePaths) -> Result<(), CommandError> {
    let relative_files = collect_relative_files(&paths.backup_dir)?;

    for relative_path in relative_files {
        let backup_path = paths.backup_dir.join(&relative_path);
        let target_path = paths.bin_dir.join(&relative_path);

        if target_path.exists() {
            remove_file_if_exists(
                &backup_path,
                "Failed to clean a previous sing-box package file on startup",
            )?;
            continue;
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                map_io_error(
                    "Failed to prepare the target directory while recovering a previous sing-box package file",
                    parent,
                    error,
                )
            })?;
        }

        rename_file(
            &backup_path,
            &target_path,
            "Failed to recover a previous sing-box package file on startup",
        )?;
    }

    remove_dir_if_exists(
        &paths.backup_dir,
        "Failed to clean the previous sing-box package backup directory on startup",
    )?;

    Ok(())
}

fn collect_relative_files(root: &Path) -> Result<Vec<PathBuf>, CommandError> {
    let mut files = Vec::new();
    collect_relative_files_recursive(root, root, &mut files)?;
    Ok(files)
}

fn collect_relative_files_recursive(
    root: &Path,
    current: &Path,
    files: &mut Vec<PathBuf>,
) -> Result<(), CommandError> {
    if !current.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(current).map_err(|error| {
        map_io_error(
            "Failed to read a sing-box package directory",
            current,
            error,
        )
    })? {
        let entry = entry.map_err(|error| {
            map_io_error(
                "Failed to enumerate a sing-box package directory entry",
                current,
                error,
            )
        })?;
        let path = entry.path();
        let entry_type = entry.file_type().map_err(|error| {
            map_io_error(
                "Failed to determine a sing-box package entry type",
                &path,
                error,
            )
        })?;

        if entry_type.is_dir() {
            collect_relative_files_recursive(root, &path, files)?;
        } else if entry_type.is_file() {
            let relative_path = path.strip_prefix(root).map_err(|error| {
                CommandError::invalid_state(
                    "collect_relative_files",
                    format!("failed to compute relative path: {}", error),
                )
            })?;
            files.push(relative_path.to_path_buf());
        }
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

fn remove_dir_if_exists(path: &Path, context: &str) -> Result<(), CommandError> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| map_io_error(context, path, error))?;
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
