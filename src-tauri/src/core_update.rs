use crate::config::{
    get_active_singbox_core_executable, get_active_singbox_core_selection, get_core_channel_dir,
    get_core_version_dir, get_data_dir, normalize_core_channel, read_json_file,
    set_active_singbox_core_selection, write_json_file, CORE_CHANNEL_STABLE, CORE_CHANNEL_TESTING,
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
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

const GITHUB_RELEASES_API: &str =
    "https://api.github.com/repos/SagerNet/sing-box/releases?per_page=12";
const WINDOWS_AMD64_ASSET_SUFFIX: &str = "windows-amd64.zip";
const CORE_UPDATE_PROGRESS_EVENT: &str = "core-update-progress";
const CORE_EXECUTABLE_NAME: &str = "sing-box.exe";
const RELEASE_CACHE_FILE_NAME: &str = "github-releases-cache.json";
const RELEASE_CACHE_TTL_SECONDS: u64 = 60 * 60;

#[derive(Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    prerelease: bool,
    draft: bool,
    assets: Vec<ReleaseAsset>,
}

#[derive(Clone, Serialize, Deserialize)]
struct CoreReleaseMetadata {
    channel: String,
    version: String,
    archive_name: String,
    archive_url: String,
}

#[derive(Serialize, Deserialize)]
struct CoreReleaseCache {
    fetched_at_unix_seconds: u64,
    releases: Vec<CoreReleaseMetadata>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct CoreUpdateProgressEvent {
    stage: String,
    percent: u8,
    message: String,
}

#[derive(Serialize)]
pub struct SingboxCoreOption {
    pub channel: String,
    pub version: String,
    pub label: String,
    pub installed: bool,
    pub is_active: bool,
}

#[derive(Serialize)]
pub struct SingboxCoreStatus {
    pub installed: bool,
    pub current_channel: Option<String>,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub is_running: bool,
    pub available_options: Vec<SingboxCoreOption>,
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
    target_version_dir: PathBuf,
    staged_version_dir: PathBuf,
}

#[tauri::command]
pub async fn get_singbox_core_status(
    state: State<'_, SingboxState>,
    force_refresh: Option<bool>,
) -> Result<SingboxCoreStatus, CommandError> {
    cleanup_staged_core_update_files()?;

    let releases = fetch_available_core_releases(force_refresh.unwrap_or(false)).await?;
    let active_selection = get_active_singbox_core_selection()?;
    cleanup_unused_core_versions(active_selection.as_ref(), &releases)?;

    let is_running = crate::singbox::is_singbox_running(state).await?;
    let installed = get_active_singbox_core_executable().is_ok();
    let (current_channel, current_version) = active_selection
        .clone()
        .filter(|(channel, version)| core_version_installed(channel, version))
        .map_or((None, None), |(channel, version)| {
            (Some(channel), Some(version))
        });

    let available_options = releases
        .iter()
        .map(|release| {
            let installed = core_version_installed(&release.channel, &release.version);
            let is_active = current_channel.as_deref() == Some(release.channel.as_str())
                && current_version.as_deref() == Some(release.version.as_str());
            SingboxCoreOption {
                channel: release.channel.clone(),
                version: release.version.clone(),
                label: format!("{} · {}", channel_label(&release.channel), release.version),
                installed,
                is_active,
            }
        })
        .collect::<Vec<_>>();

    let latest_version = current_channel
        .as_deref()
        .and_then(|channel| latest_version_for_channel(&releases, channel))
        .or_else(|| latest_version_for_channel(&releases, CORE_CHANNEL_STABLE));

    let update_available = match (current_channel.as_deref(), current_version.as_deref()) {
        (Some(channel), Some(version)) => {
            latest_version_for_channel(&releases, channel).is_some_and(|latest| latest != version)
        }
        _ => false,
    };

    Ok(SingboxCoreStatus {
        installed,
        current_channel,
        current_version,
        latest_version,
        update_available,
        is_running,
        available_options,
    })
}

#[tauri::command]
pub async fn activate_singbox_core(channel: String, version: String) -> Result<(), CommandError> {
    let normalized_channel = normalize_core_channel(&channel)?;
    if !core_version_installed(normalized_channel, &version) {
        return Err(CommandError::resource_not_found(
            "sing-box core version",
            format!(
                "{} {} is not installed under {}",
                channel_label(normalized_channel),
                version,
                get_core_version_dir(normalized_channel, &version)?.display()
            ),
        ));
    }

    set_active_singbox_core_selection(
        Some(normalized_channel.to_string()),
        Some(version.to_string()),
    )
}

#[tauri::command]
pub async fn update_singbox_core(
    app: AppHandle,
    state: State<'_, SingboxState>,
    channel: String,
    version: String,
) -> Result<SingboxCoreUpdateResult, CommandError> {
    cleanup_staged_core_update_files()?;
    emit_progress(
        &app,
        "preparing",
        5,
        "Checking the requested sing-box release...",
    );

    let normalized_channel = normalize_core_channel(&channel)?;
    let releases = fetch_available_core_releases(false).await?;
    let previous_selection = get_active_singbox_core_selection()?;
    cleanup_unused_core_versions(previous_selection.as_ref(), &releases)?;

    let target_release = releases
        .iter()
        .find(|release| release.channel == normalized_channel && release.version == version)
        .ok_or_else(|| {
            CommandError::validation(format!(
                "{} {} is not one of the available sing-box releases exposed by fresh-box.",
                channel_label(normalized_channel),
                version
            ))
        })?;

    let previous_version = previous_selection
        .as_ref()
        .map(|(_, version)| version.clone());
    let restart_required = crate::singbox::is_singbox_running(state).await?;
    if restart_required
        && previous_selection
            .as_ref()
            .is_some_and(|(active_channel, active_version)| {
                active_channel == normalized_channel && active_version == &version
            })
    {
        return Err(CommandError::invalid_state(
            "update_singbox_core",
            format!(
                "{} {} is currently running. Stop sing-box before reinstalling the same core version.",
                channel_label(normalized_channel),
                version
            ),
        ));
    }

    let update_paths = get_update_paths(target_release)?;
    emit_progress(
        &app,
        "downloading",
        8,
        format!("Downloading {}...", target_release.archive_name),
    );
    download_file_with_progress(
        &app,
        &target_release.archive_url,
        &update_paths.zip_path,
        "Downloading sing-box package...",
        8,
        68,
    )
    .await?;

    emit_progress(
        &app,
        "extracting",
        76,
        format!(
            "Extracting {} {}...",
            channel_label(normalized_channel),
            version
        ),
    );
    extract_package_files(&update_paths.staged_version_dir, &update_paths.zip_path)?;

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
    set_active_singbox_core_selection(Some(normalized_channel.to_string()), Some(version.clone()))?;
    cleanup_unused_core_versions(
        Some(&(normalized_channel.to_string(), version.clone())),
        &releases,
    )?;
    cleanup_download_artifacts(&update_paths)?;

    let current_version = read_active_singbox_core_version()?.ok_or_else(|| {
        CommandError::io(
            "Updated sing-box version could not be read",
            "the active version directory does not contain sing-box.exe",
        )
    })?;
    if current_version != version {
        return Err(CommandError::validation(format!(
            "Installed sing-box version {} does not match the requested release {}.",
            current_version, version
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
        latest_version: target_release.version.clone(),
        restart_required,
    })
}

pub fn cleanup_staged_core_update_files_directly() -> Result<(), CommandError> {
    cleanup_staged_core_update_files()
}

fn cleanup_staged_core_update_files() -> Result<(), CommandError> {
    let update_dir = get_data_dir()?.join("core-update");
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

    for channel in [CORE_CHANNEL_STABLE, CORE_CHANNEL_TESTING] {
        let channel_dir = get_core_channel_dir(channel)?;
        if !channel_dir.exists() {
            continue;
        }

        for entry in fs::read_dir(&channel_dir).map_err(|error| {
            CommandError::io(format!("failed to read {}", channel_dir.display()), error)
        })? {
            let entry = entry.map_err(|error| {
                CommandError::io(
                    format!("failed to enumerate {}", channel_dir.display()),
                    error,
                )
            })?;
            let path = entry.path();
            let file_type = entry.file_type().map_err(|error| {
                CommandError::io(format!("failed to inspect {}", path.display()), error)
            })?;
            if file_type.is_dir() && entry.file_name().to_string_lossy().ends_with(".new") {
                remove_dir_if_exists(
                    &path,
                    "Failed to clean a staged sing-box version directory on startup",
                )?;
            }
        }
    }

    Ok(())
}

fn get_update_paths(release: &CoreReleaseMetadata) -> Result<CoreUpdatePaths, CommandError> {
    let update_dir = get_data_dir()?.join("core-update");
    fs::create_dir_all(&update_dir).map_err(|error| {
        CommandError::io(format!("failed to create {}", update_dir.display()), error)
    })?;

    Ok(CoreUpdatePaths {
        zip_path: update_dir.join(&release.archive_name),
        target_version_dir: get_core_version_dir(&release.channel, &release.version)?,
        staged_version_dir: get_core_channel_dir(&release.channel)?
            .join(format!("{}.new", release.version)),
    })
}

async fn fetch_available_core_releases(
    force_refresh: bool,
) -> Result<Vec<CoreReleaseMetadata>, CommandError> {
    if !force_refresh {
        if let Some(cache) = load_cached_core_releases()? {
            if is_release_cache_fresh(&cache)? {
                return Ok(cache.releases);
            }
        }
    }

    match fetch_available_core_releases_from_github().await {
        Ok(releases) => {
            store_cached_core_releases(&releases)?;
            Ok(releases)
        }
        Err(error) => {
            if let Some(cache) = load_cached_core_releases()? {
                eprintln!(
                    "Failed to refresh sing-box release metadata from GitHub, using cached data: {}",
                    error
                );
                Ok(cache.releases)
            } else {
                Err(error)
            }
        }
    }
}

async fn fetch_available_core_releases_from_github(
) -> Result<Vec<CoreReleaseMetadata>, CommandError> {
    let releases = github_client()?
        .get(GITHUB_RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| map_network_error("Failed to reach GitHub", error))?
        .error_for_status()
        .map_err(|error| map_network_error("GitHub rejected the release metadata request", error))?
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| {
            map_network_error(
                "Failed to parse the available sing-box release metadata",
                error,
            )
        })?;

    let stable_releases = releases
        .iter()
        .filter(|release| !release.draft && !release.prerelease)
        .filter_map(|release| release_to_core_metadata(release, CORE_CHANNEL_STABLE))
        .take(3)
        .collect::<Vec<_>>();

    let testing_releases = releases
        .iter()
        .filter(|release| !release.draft && release.prerelease)
        .filter_map(|release| release_to_core_metadata(release, CORE_CHANNEL_TESTING))
        .take(3)
        .collect::<Vec<_>>();

    let mut result = stable_releases;
    result.extend(testing_releases);

    if result.is_empty() {
        return Err(CommandError::validation(
            "No suitable sing-box releases were found on GitHub.",
        ));
    }

    Ok(result)
}

fn release_to_core_metadata(
    release: &GithubRelease,
    channel: &'static str,
) -> Option<CoreReleaseMetadata> {
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name.ends_with(WINDOWS_AMD64_ASSET_SUFFIX))?;

    let version = normalized_version(&release.tag_name)?;

    Some(CoreReleaseMetadata {
        channel: channel.to_string(),
        version,
        archive_name: asset.name.clone(),
        archive_url: asset.browser_download_url.clone(),
    })
}

fn latest_version_for_channel(releases: &[CoreReleaseMetadata], channel: &str) -> Option<String> {
    releases
        .iter()
        .find(|release| release.channel == channel)
        .map(|release| release.version.clone())
}

fn get_release_cache_path() -> Result<PathBuf, CommandError> {
    let cache_dir = get_data_dir()?.join("core-update");
    fs::create_dir_all(&cache_dir).map_err(|error| {
        CommandError::io(format!("failed to create {}", cache_dir.display()), error)
    })?;
    Ok(cache_dir.join(RELEASE_CACHE_FILE_NAME))
}

fn load_cached_core_releases() -> Result<Option<CoreReleaseCache>, CommandError> {
    let cache_path = get_release_cache_path()?;
    if !cache_path.exists() {
        return Ok(None);
    }

    match read_json_file::<CoreReleaseCache>(&cache_path) {
        Ok(cache) => Ok(Some(cache)),
        Err(error) => {
            eprintln!(
                "Ignoring invalid sing-box release cache at {}: {}",
                cache_path.display(),
                error
            );
            Ok(None)
        }
    }
}

fn store_cached_core_releases(releases: &[CoreReleaseMetadata]) -> Result<(), CommandError> {
    let cache = CoreReleaseCache {
        fetched_at_unix_seconds: current_unix_timestamp_seconds()?,
        releases: releases.to_vec(),
    };
    write_json_file(&get_release_cache_path()?, &cache)
}

fn is_release_cache_fresh(cache: &CoreReleaseCache) -> Result<bool, CommandError> {
    let now = current_unix_timestamp_seconds()?;
    Ok(now.saturating_sub(cache.fetched_at_unix_seconds) < RELEASE_CACHE_TTL_SECONDS)
}

fn current_unix_timestamp_seconds() -> Result<u64, CommandError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| CommandError::invalid_state("system_clock", error))
}

fn cleanup_unused_core_versions(
    active_selection: Option<&(String, String)>,
    releases: &[CoreReleaseMetadata],
) -> Result<(), CommandError> {
    let mut stable_keep = releases
        .iter()
        .filter(|release| release.channel == CORE_CHANNEL_STABLE)
        .map(|release| release.version.clone())
        .collect::<Vec<_>>();
    let mut testing_keep = releases
        .iter()
        .filter(|release| release.channel == CORE_CHANNEL_TESTING)
        .map(|release| release.version.clone())
        .collect::<Vec<_>>();

    if let Some((channel, version)) = active_selection {
        match channel.as_str() {
            CORE_CHANNEL_STABLE if !stable_keep.iter().any(|item| item == version) => {
                stable_keep.push(version.clone());
            }
            CORE_CHANNEL_TESTING if !testing_keep.iter().any(|item| item == version) => {
                testing_keep.push(version.clone());
            }
            _ => {}
        }
    }

    prune_channel_versions(CORE_CHANNEL_STABLE, &stable_keep)?;
    prune_channel_versions(CORE_CHANNEL_TESTING, &testing_keep)?;
    Ok(())
}

fn prune_channel_versions(channel: &str, keep_versions: &[String]) -> Result<(), CommandError> {
    let channel_dir = get_core_channel_dir(channel)?;
    if !channel_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(&channel_dir).map_err(|error| {
        CommandError::io(format!("failed to read {}", channel_dir.display()), error)
    })? {
        let entry = entry.map_err(|error| {
            CommandError::io(
                format!("failed to enumerate {}", channel_dir.display()),
                error,
            )
        })?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| {
            CommandError::io(format!("failed to inspect {}", path.display()), error)
        })?;
        if !file_type.is_dir() {
            continue;
        }

        let version = entry.file_name().to_string_lossy().to_string();
        if version.ends_with(".new") {
            continue;
        }

        if keep_versions.iter().any(|item| item == &version) {
            continue;
        }

        remove_dir_if_exists(
            &path,
            "Failed to clean an outdated sing-box version directory",
        )?;
    }

    Ok(())
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

fn extract_package_files(staged_dir: &Path, archive_path: &Path) -> Result<(), CommandError> {
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

    if !staged_dir.join(CORE_EXECUTABLE_NAME).exists() {
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

fn core_version_installed(channel: &str, version: &str) -> bool {
    get_core_version_dir(channel, version)
        .map(|dir| dir.join(CORE_EXECUTABLE_NAME).exists())
        .unwrap_or(false)
}

fn read_active_singbox_core_version() -> Result<Option<String>, CommandError> {
    let executable_path = match get_active_singbox_core_executable() {
        Ok(path) => path,
        Err(CommandError::ResourceNotFound(_)) => return Ok(None),
        Err(error) => return Err(error),
    };

    let mut command = Command::new(&executable_path);
    hide_window(&mut command);

    let output = command.arg("version").output().map_err(|error| {
        map_io_error(
            "Failed to read the installed sing-box version",
            &executable_path,
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
                executable_path.display()
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

fn channel_label(channel: &str) -> &'static str {
    match channel {
        CORE_CHANNEL_STABLE => "Stable",
        CORE_CHANNEL_TESTING => "Testing",
        _ => "Unknown",
    }
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

fn hide_window(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}
