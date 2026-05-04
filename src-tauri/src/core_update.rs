use crate::config::{get_bin_dir, get_data_dir};
use crate::errors::CommandError;
use crate::singbox::SingboxState;
use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::State;

const GITHUB_RELEASE_API: &str = "https://api.github.com/repos/SagerNet/sing-box/releases/latest";
const WINDOWS_AMD64_ASSET_SUFFIX: &str = "windows-amd64.zip";

#[derive(Deserialize)]
struct LatestReleaseMetadata {
    tag: String,
    name: String,
    url: String,
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
}

#[tauri::command]
pub async fn get_singbox_core_status(
    state: State<'_, SingboxState>,
) -> Result<SingboxCoreStatus, CommandError> {
    let is_running = crate::singbox::is_singbox_running(state).await?;
    let current_version = get_installed_singbox_version()?;
    let latest_release = fetch_latest_release_metadata()?;
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
    state: State<'_, SingboxState>,
) -> Result<SingboxCoreUpdateResult, CommandError> {
    let previous_version = get_installed_singbox_version()?;
    let latest_release = fetch_latest_release_metadata()?;
    let latest_version =
        normalized_version(&latest_release.tag).unwrap_or(latest_release.tag.clone());
    let update_paths = get_update_paths(&latest_release.name)?;

    download_latest_core_archive(&latest_release, &update_paths.zip_path)?;

    if crate::singbox::is_singbox_running(state).await? {
        return Err(CommandError::InvalidState(format!(
            "The latest core package has been downloaded to {}. Please stop sing-box and retry to apply it.",
            update_paths.zip_path.display()
        )));
    }

    install_downloaded_core(&update_paths)?;

    let current_version = get_installed_singbox_version()?.ok_or_else(|| {
        CommandError::IoError("sing-box.exe is missing after the update completed.".to_string())
    })?;
    if current_version != latest_version {
        return Err(CommandError::IoError(format!(
            "Installed sing-box version {} does not match the latest release {}.",
            current_version, latest_version
        )));
    }

    Ok(SingboxCoreUpdateResult {
        previous_version,
        current_version,
        latest_version,
    })
}

struct CoreUpdatePaths {
    zip_path: std::path::PathBuf,
    extract_dir: std::path::PathBuf,
    bin_dir: std::path::PathBuf,
}

fn get_update_paths(asset_name: &str) -> Result<CoreUpdatePaths, CommandError> {
    let bin_dir = get_bin_dir()?;
    let update_dir = get_data_dir()?.join("core-update");
    std::fs::create_dir_all(&update_dir)?;
    std::fs::create_dir_all(&bin_dir)?;

    Ok(CoreUpdatePaths {
        zip_path: update_dir.join(asset_name),
        extract_dir: update_dir.join("extract"),
        bin_dir,
    })
}

fn download_latest_core_archive(
    release: &LatestReleaseMetadata,
    zip_path: &std::path::Path,
) -> Result<(), CommandError> {
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$downloadUrl = '{download_url}'
$zipPath = '{zip_path}'

if (Test-Path $zipPath) {{
  Remove-Item $zipPath -Force
}}

Invoke-WebRequest -Headers @{{ 'User-Agent' = 'fresh-box'; 'Accept' = 'application/octet-stream' }} -Uri $downloadUrl -OutFile $zipPath
"#,
        download_url = escape_powershell_literal(&release.url),
        zip_path = escape_powershell_literal(&zip_path.to_string_lossy()),
    );

    run_powershell_script(&script)?;
    Ok(())
}

fn install_downloaded_core(paths: &CoreUpdatePaths) -> Result<(), CommandError> {
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$zipPath = '{zip_path}'
$extractDir = '{extract_dir}'
$binDir = '{bin_dir}'

if (-not (Test-Path $zipPath)) {{
  throw 'The downloaded sing-box archive could not be found.'
}}

if (Test-Path $extractDir) {{
  Remove-Item $extractDir -Recurse -Force
}}

New-Item -Path $extractDir -ItemType Directory -Force | Out-Null
New-Item -Path $binDir -ItemType Directory -Force | Out-Null

Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$core = Get-ChildItem -Path $extractDir -Filter 'sing-box.exe' -Recurse | Select-Object -First 1
if (-not $core) {{
  throw 'sing-box.exe was not found in the downloaded archive.'
}}

Copy-Item -Path $core.FullName -Destination (Join-Path $binDir 'sing-box.exe') -Force

Remove-Item $zipPath -Force
Remove-Item $extractDir -Recurse -Force
"#,
        zip_path = escape_powershell_literal(&paths.zip_path.to_string_lossy()),
        extract_dir = escape_powershell_literal(&paths.extract_dir.to_string_lossy()),
        bin_dir = escape_powershell_literal(&paths.bin_dir.to_string_lossy()),
    );

    run_powershell_script(&script)?;
    Ok(())
}

fn fetch_latest_release_metadata() -> Result<LatestReleaseMetadata, CommandError> {
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$release = Invoke-RestMethod -Headers @{{ 'User-Agent' = 'fresh-box'; 'X-GitHub-Api-Version' = '2022-11-28' }} -Uri '{release_api}'
$asset = $release.assets | Where-Object {{ $_.name -like '*{asset_suffix}' }} | Select-Object -First 1
if (-not $asset) {{
  throw 'No Windows amd64 sing-box asset was found in the latest release.'
}}

[PSCustomObject]@{{
  tag = [string]$release.tag_name
  name = [string]$asset.name
  url = [string]$asset.browser_download_url
}} | ConvertTo-Json -Compress
"#,
        release_api = GITHUB_RELEASE_API,
        asset_suffix = WINDOWS_AMD64_ASSET_SUFFIX,
    );

    let response = run_powershell_script(&script)?;
    serde_json::from_str(response.trim()).map_err(CommandError::from)
}

fn get_installed_singbox_version() -> Result<Option<String>, CommandError> {
    let singbox_path = get_bin_dir()?.join("sing-box.exe");
    if !singbox_path.exists() {
        return Ok(None);
    }

    let mut command = Command::new(&singbox_path);
    hide_window(&mut command);

    let output = command.arg("version").output().map_err(|error| {
        CommandError::IoError(format!(
            "Failed to read the installed sing-box version: {}",
            error
        ))
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

        return Err(CommandError::IoError(format!(
            "Failed to read the installed sing-box version: {}",
            reason
        )));
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

fn escape_powershell_literal(value: &str) -> String {
    value.replace('\'', "''")
}

fn run_powershell_script(script: &str) -> Result<String, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell.exe");
        hide_window(&mut command);

        let output = command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ])
            .output()
            .map_err(|error| {
                CommandError::IoError(format!("Failed to start PowerShell: {}", error))
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

            return Err(CommandError::IoError(format!(
                "Failed to run the sing-box core command: {}",
                reason
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = script;
        Err(CommandError::InvalidState(
            "Updating the sing-box core is only supported on Windows.".to_string(),
        ))
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
