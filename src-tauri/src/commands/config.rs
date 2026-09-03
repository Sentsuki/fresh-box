use crate::config::AppSettings;
use crate::errors::CommandError;
use futures_util::StreamExt;
use std::fs;
use std::sync::OnceLock;

// ── Shared HTTP client for subscription fetching ───────────────────────────

static SUBSCRIPTION_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn subscription_client() -> Result<&'static reqwest::Client, CommandError> {
    Ok(SUBSCRIPTION_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("fresh-box")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to initialize the subscription HTTP client")
    }))
}

/// Mirrors the official desktop client's `MAXIMUM_REMOTE_PROFILE_BYTES`
/// (`src/main/profiles.ts`) — caps how much a subscription response can
/// grow fresh-box's in-memory buffer / on-disk config file by, so a
/// malicious or compromised subscription server can't exhaust memory or
/// fill the disk with an unbounded response.
const MAX_SUBSCRIPTION_BYTES: usize = 16 * 1024 * 1024;

/// Read `response`'s body as UTF-8 text, rejecting it once it (or its
/// declared `Content-Length`) exceeds `max_bytes`. Reads incrementally via
/// `bytes_stream()` rather than `.text()` so an unbounded/chunked response
/// without a `Content-Length` header still can't be fully buffered before
/// we notice it's too large.
async fn read_limited_response(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<String, CommandError> {
    if let Some(len) = response.content_length()
        && len > max_bytes as u64
    {
        return Err(CommandError::validation(format!(
            "Subscription response is too large ({len} bytes, limit is {max_bytes})"
        )));
    }

    let mut stream = response.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            CommandError::network(format!("Failed to read subscription content: {}", e))
        })?;
        buf.extend_from_slice(&chunk);
        if buf.len() > max_bytes {
            return Err(CommandError::validation(format!(
                "Subscription response is too large (limit is {max_bytes} bytes)"
            )));
        }
    }

    String::from_utf8(buf).map_err(|e| {
        CommandError::validation(format!("Subscription response is not valid UTF-8: {e}"))
    })
}

/// Reject path-separator and Windows-reserved characters from a single
/// filename component, and strip leading dots so the result can never
/// collapse to `.`/`..` or a hidden file once `.json` is appended. Applied
/// to filenames derived from untrusted input (subscription URLs) so they
/// can never be read as a relative/absolute path escape when joined onto
/// `sub_dir` — see `extract_file_name_from_url`.
fn sanitize_filename_component(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim_start_matches('.').trim();
    if trimmed.is_empty() {
        "subscription".to_string()
    } else {
        trimmed.chars().take(150).collect()
    }
}

// ── Safe path resolution ──────────────────────────────────────────────────

/// Resolve `file_name` relative to `base_dir` and verify the result stays
/// inside `base_dir`.  Returns an error if the resolved path escapes the
/// base directory (path traversal attempt).
fn resolve_safe_path(
    base_dir: &std::path::Path,
    file_name: &str,
) -> Result<std::path::PathBuf, CommandError> {
    let full = base_dir.join(file_name);
    // Canonicalize the base dir so we can compare prefixes reliably.
    // The file doesn't need to exist yet, so we canonicalize the base only.
    let canonical_base = base_dir
        .canonicalize()
        .map_err(|e| CommandError::resource_not_found("config directory", e))?;
    // On Windows, canonicalize() returns a verbatim UNC path (\\?\C:\...)
    // while normalize_path() produces a regular path (C:\...).
    // Strip the verbatim prefix so both sides use the same format.
    let canonical_base = strip_verbatim_prefix(&canonical_base);
    // Normalize the target path without requiring it to exist.
    let normalized = normalize_path(&full);
    if !normalized.starts_with(&canonical_base) {
        return Err(CommandError::validation(format!(
            "Path '{}' escapes the config directory",
            file_name
        )));
    }
    Ok(full)
}

/// Lexically normalize a path (resolve `.` and `..`) without hitting the
/// filesystem.  This is sufficient for traversal detection after we have
/// already canonicalized the base directory.
fn normalize_path(path: &std::path::Path) -> std::path::PathBuf {
    use std::path::Component;
    let mut out = std::path::PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            c => out.push(c),
        }
    }
    out
}

/// On Windows, `Path::canonicalize` returns a verbatim UNC path prefixed with
/// `\\?\` (e.g. `\\?\C:\Users\...`).  Strip that prefix so the result can be
/// compared with paths produced by `normalize_path`, which never adds it.
fn strip_verbatim_prefix(path: &std::path::Path) -> std::path::PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        std::path::PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

/// Open `path` (a local file path, directory, or URL) with the OS default
/// handler — equivalent of double-clicking it in Explorer.
///
/// Calls `ShellExecuteW` directly instead of shelling out to
/// `cmd /C start "" <path>`: cmd.exe re-parses whatever command line it's
/// given, and characters like `&`, `|`, `^` are still meaningful to it even
/// when the argument that contains them was passed through argv (this is
/// the general class of issue behind advisories like CVE-2024-24576).
/// `ShellExecuteW` hands `path` straight to the shell as a single value —
/// no command-line grammar is involved, so it can't be reinterpreted this
/// way regardless of what `path` contains.
fn open_with_system(path: &str) -> Result<(), CommandError> {
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::{HSTRING, w};

    let target = HSTRING::from(path);
    // SAFETY: every argument is either `None`/a `'static` wide-string
    // literal or an owned `HSTRING` kept alive for the duration of this
    // call; `ShellExecuteW` does not retain any of them afterward.
    let result = unsafe { ShellExecuteW(None, w!("open"), &target, None, None, SW_SHOWNORMAL) };

    // Per the Win32 docs, ShellExecuteW returns a value > 32 on success and
    // an error code (castable from HINSTANCE) otherwise.
    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err(CommandError::resource_not_found(
            "path",
            format!(
                "failed to open '{path}' (ShellExecuteW error code {})",
                result.0 as isize
            ),
        ))
    }
}

#[tauri::command]
pub async fn open_app_directory() -> Result<(), CommandError> {
    let app_data_root = crate::config::get_app_data_root()?;
    open_with_system(&app_data_root.to_string_lossy())
}

#[tauri::command]
pub async fn load_app_settings() -> Result<AppSettings, CommandError> {
    crate::config::app_settings::load_app_settings_file()
}

#[tauri::command]
pub async fn save_app_settings(
    backend_prefs: tauri::State<'_, crate::config::app_settings::BackendPrefsState>,
    settings: AppSettings,
) -> Result<(), CommandError> {
    // Update the in-memory cache the backend's own control-flow decisions
    // read from *before* persisting to disk, not after — so a
    // `CloseRequested`/proxy-switch handler that runs the instant this call
    // returns can never observe a stale value (see `BackendPrefsState`'s
    // doc comment).
    backend_prefs.set(settings.settings.clone());
    crate::config::app_settings::save_app_settings_file(&settings)
}

// ── Profile listing (view model) ────────────────────────────────────────

/// `ProfileEntry` plus the resolved on-disk path — the identity fields
/// (`id`/`name`) live in `config::profiles::ProfileEntry`; `path` is a
/// presentation-layer detail (it depends on `sub_dir`, which the storage
/// layer itself doesn't need to know about) computed here instead.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntryView {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<String>,
    pub auto_update: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_interval_minutes: Option<u32>,
}

fn to_views(
    entries: &[crate::config::profiles::ProfileEntry],
) -> Result<Vec<ProfileEntryView>, CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
    Ok(entries
        .iter()
        .map(|e| ProfileEntryView {
            id: e.id.clone(),
            name: e.name.clone(),
            path: sub_dir
                .join(format!("{}.json", e.name))
                .to_string_lossy()
                .into_owned(),
            url: e.url.clone(),
            last_updated: e.last_updated.clone(),
            auto_update: e.auto_update,
            update_interval_minutes: e.update_interval_minutes,
        })
        .collect())
}

#[tauri::command]
pub async fn list_profiles() -> Result<Vec<ProfileEntryView>, CommandError> {
    let entries = crate::config::profiles::with_index(|index| Ok(index.entries())).await?;
    to_views(&entries)
}

/// Result returned by every command that adds/imports/refreshes a single
/// profile — `entry` is that one profile (so the caller doesn't have to
/// search `profiles` for it), `profiles` is the full updated list, letting
/// the frontend refresh its state in one IPC round-trip instead of a
/// mutate-then-refetch pair.
#[derive(serde::Serialize)]
pub struct ProfileOperationResult {
    pub entry: ProfileEntryView,
    pub profiles: Vec<ProfileEntryView>,
}

fn find_view(views: Vec<ProfileEntryView>, predicate: impl Fn(&ProfileEntryView) -> bool) -> Result<(ProfileEntryView, Vec<ProfileEntryView>), CommandError> {
    let entry = views
        .iter()
        .find(|v| predicate(v))
        .cloned()
        .ok_or_else(|| CommandError::invalid_state("profiles", "profile entry missing after write"))?;
    Ok((entry, views))
}

// ── Import / fetch ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn copy_config_to_bin(config_path: String) -> Result<ProfileOperationResult, CommandError> {
    let sub_dir = crate::config::paths::get_sub_dir()?;
    let source_config_path = std::path::Path::new(&config_path);

    if !source_config_path.exists() {
        return Err(CommandError::resource_not_found(
            "source config file",
            config_path,
        ));
    }

    let config_file = source_config_path
        .file_name()
        .ok_or_else(|| CommandError::invalid_state("copy config", "invalid config file path"))?;
    let target_config_path = sub_dir.join(config_file);
    let stem = target_config_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let source_content = fs::read(&config_path)
        .map_err(|e| CommandError::resource_not_found("source config file", e))?;

    if target_config_path.exists() {
        let target_content = fs::read(&target_config_path)
            .map_err(|e| CommandError::resource_not_found("target config file", e))?;
        if source_content == target_content {
            let entries = crate::config::profiles::with_index(|index| Ok(index.entries())).await?;
            let (entry, profiles) = find_view(to_views(&entries)?, |v| v.name == stem)?;
            return Ok(ProfileOperationResult { entry, profiles });
        }
    }

    // Unlike the subscription-fetch commands, a locally imported file never
    // went through `check_config` before — an invalid file just silently
    // sat in the list until the user tried to start it. Validate it here
    // too, same as every other path that writes into `sub_dir`.
    let source_text = String::from_utf8(source_content.clone())
        .map_err(|e| CommandError::validation(format!("Config file is not valid UTF-8: {e}")))?;
    crate::daemon::validate::check_config(&source_text).await?;

    let stem_for_index = stem.clone();
    let entries = crate::config::profiles::with_index(move |index| {
        crate::config::io::atomic_write(&target_config_path, &source_content)?;
        index.upsert_by_name(&stem_for_index, None, None);
        Ok(index.entries())
    })
    .await?;

    let (entry, profiles) = find_view(to_views(&entries)?, |v| v.name == stem)?;
    Ok(ProfileOperationResult { entry, profiles })
}

/// Atomically fetch a subscription URL, save the config file, and record it
/// in the profile index.
#[tauri::command]
pub async fn add_subscription(url: String) -> Result<ProfileOperationResult, CommandError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(CommandError::validation(
            "Subscription URL must start with http:// or https://",
        ));
    }

    let client = subscription_client()?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| CommandError::network(format!("Failed to fetch subscription: {}", e)))?;

    if !response.status().is_success() {
        return Err(CommandError::network(format!(
            "HTTP error {}",
            response.status()
        )));
    }

    let content = read_limited_response(response, MAX_SUBSCRIPTION_BYTES).await?;
    crate::daemon::validate::check_config(&content).await?;

    let file_name = extract_file_name_from_url(&url);
    let stem = crate::config::profiles::stem_from_filename(&file_name).to_string();

    let sub_dir = crate::config::paths::get_sub_dir()?;
    // `file_name` is sanitized by `extract_file_name_from_url`, but resolve
    // it through the same traversal guard as the rest of the config
    // commands anyway rather than relying solely on that sanitization.
    let target_path = resolve_safe_path(&sub_dir, &file_name)?;

    let stem_for_index = stem.clone();
    let now = chrono::Utc::now().to_rfc3339();
    let entries = crate::config::profiles::with_index(move |index| {
        crate::config::io::atomic_write(&target_path, content.as_bytes())?;
        index.upsert_by_name(&stem_for_index, Some(url), Some(now));
        Ok(index.entries())
    })
    .await?;

    let (entry, profiles) = find_view(to_views(&entries)?, |v| v.name == stem)?;
    Ok(ProfileOperationResult { entry, profiles })
}

/// Atomically re-fetch an existing subscription (looked up by `id`) and
/// overwrite its config file.
#[tauri::command]
pub async fn update_subscription(id: String) -> Result<ProfileOperationResult, CommandError> {
    let entries = refresh_subscription_by_id(&id).await?;
    let (entry, profiles) = find_view(to_views(&entries)?, |v| v.id == id)?;
    Ok(ProfileOperationResult { entry, profiles })
}

/// The actual fetch → validate → write → record `lastUpdated` sequence,
/// shared by the `update_subscription` command (user-triggered) and
/// `spawn_auto_update_scheduler`'s background loop (due-triggered) — the
/// two used to duplicate this in full.
async fn refresh_subscription_by_id(
    id: &str,
) -> Result<Vec<crate::config::profiles::ProfileEntry>, CommandError> {
    let (stem, url) = {
        let entries = crate::config::profiles::with_index(|index| Ok(index.entries())).await?;
        let entry = entries.iter().find(|e| e.id == id).ok_or_else(|| {
            CommandError::resource_not_found("profile", format!("No profile found for id '{id}'"))
        })?;
        let url = entry.url.clone().ok_or_else(|| {
            CommandError::resource_not_found(
                "subscription",
                format!("No URL found for '{}'", entry.name),
            )
        })?;
        (entry.name.clone(), url)
    };

    let client = subscription_client()?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| CommandError::network(format!("Failed to fetch subscription: {}", e)))?;

    if !response.status().is_success() {
        return Err(CommandError::network(format!(
            "HTTP error {}",
            response.status()
        )));
    }

    let content = read_limited_response(response, MAX_SUBSCRIPTION_BYTES).await?;
    crate::daemon::validate::check_config(&content).await?;

    let sub_dir = crate::config::paths::get_sub_dir()?;
    let target_path = resolve_safe_path(&sub_dir, &format!("{}.json", stem))?;

    let id_for_index = id.to_string();
    let now = chrono::Utc::now().to_rfc3339();
    crate::config::profiles::with_index(move |index| {
        crate::config::io::atomic_write(&target_path, content.as_bytes())?;
        index.set_last_updated_by_id(&id_for_index, now);
        Ok(index.entries())
    })
    .await
}

/// Enable/disable auto-update for a subscription, and set its interval
/// (`None` = use the default — see `config::profiles::interval_or_default`).
/// Meaningless for a locally imported file (no `url`), but not rejected as
/// an error for one — the scheduler simply never finds it due, since
/// `is_due` requires a `url`.
#[tauri::command]
pub async fn set_subscription_auto_update(
    id: String,
    enabled: bool,
    interval_minutes: Option<u32>,
) -> Result<Vec<ProfileEntryView>, CommandError> {
    let id_for_index = id.clone();
    let entries = crate::config::profiles::with_index(move |index| {
        if index.find_by_id(&id_for_index).is_none() {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("No profile found for id '{id_for_index}'"),
            ));
        }
        index.set_auto_update_by_id(&id_for_index, enabled, interval_minutes);
        Ok(index.entries())
    })
    .await?;

    to_views(&entries)
}

/// How often the background loop checks for due subscriptions — much
/// finer-grained than any individual subscription's own update interval
/// (which is never shorter than `MINIMUM_UPDATE_INTERVAL_MINUTES`); this
/// just needs to be short enough that a subscription becoming due doesn't
/// sit unnoticed for long.
const AUTO_UPDATE_CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

/// Start the background auto-update loop. Call once, at app startup (see
/// `main.rs`'s `setup()`) — runs for the process's lifetime, periodically
/// refreshing whichever subscriptions are both `auto_update`-enabled and
/// past their interval since `last_updated`. Mirrors the official desktop
/// client's `reconfigureAutoUpdate`/`runDueProfileUpdates` (`main/profiles.ts`),
/// simplified to a periodic sweep rather than a per-profile timer — with
/// at most a handful of profiles this is negligible overhead and avoids
/// having to reschedule a timer every time a profile's settings change.
///
/// A single subscription failing to refresh (network error, the fetched
/// content failing `check_config`, ...) is logged and skipped — it does
/// not stop the rest of the sweep, and is simply retried on the next due
/// check.
pub fn spawn_auto_update_scheduler(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(AUTO_UPDATE_CHECK_INTERVAL).await;

            let entries =
                match crate::config::profiles::with_index(|index| Ok(index.entries())).await {
                    Ok(entries) => entries,
                    Err(e) => {
                        eprintln!("auto-update: failed to read profile index: {:?}", e);
                        continue;
                    }
                };

            let now = chrono::Utc::now();
            let due: Vec<String> = entries
                .iter()
                .filter(|e| crate::config::profiles::is_due(e, now))
                .map(|e| e.id.clone())
                .collect();
            if due.is_empty() {
                continue;
            }

            let mut any_succeeded = false;
            for id in due {
                match refresh_subscription_by_id(&id).await {
                    Ok(_) => any_succeeded = true,
                    Err(e) => {
                        eprintln!("auto-update: failed to refresh subscription '{id}': {:?}", e)
                    }
                }
            }

            if any_succeeded {
                use tauri::Emitter;
                let _ = app.emit("profiles-auto-updated", ());
            }
        }
    });
}

/// Update a subscription's URL (without re-fetching it) — used when the
/// user edits the URL directly rather than through re-adding it.
#[tauri::command]
pub async fn edit_subscription_url(
    id: String,
    url: String,
) -> Result<Vec<ProfileEntryView>, CommandError> {
    let trimmed = url.trim().to_string();
    if trimmed.is_empty() {
        return Err(CommandError::validation("Subscription URL cannot be empty"));
    }

    let id_for_index = id.clone();
    let entries = crate::config::profiles::with_index(move |index| {
        if index.find_by_id(&id_for_index).is_none() {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("No profile found for id '{id_for_index}'"),
            ));
        }
        index.set_url_by_id(&id_for_index, trimmed);
        Ok(index.entries())
    })
    .await?;

    to_views(&entries)
}

// ── Rename / delete / open ──────────────────────────────────────────────

#[tauri::command]
pub async fn rename_profile(
    id: String,
    new_name: String,
) -> Result<Vec<ProfileEntryView>, CommandError> {
    let trimmed = new_name.trim().to_string();
    if trimmed.is_empty() {
        return Err(CommandError::validation("New name cannot be empty"));
    }

    let sub_dir = crate::config::paths::get_sub_dir()?;
    let new_full_path = resolve_safe_path(&sub_dir, &format!("{trimmed}.json"))?;

    let id_for_index = id.clone();
    let entries = crate::config::profiles::with_index(move |index| {
        let Some(current) = index.find_by_id(&id_for_index).cloned() else {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("No profile found for id '{id_for_index}'"),
            ));
        };
        if current.name == trimmed {
            return Ok(index.entries());
        }
        if index.name_taken(&trimmed, &id_for_index) {
            return Err(CommandError::invalid_state(
                "rename profile",
                format!(
                    "a config file already exists at {}",
                    new_full_path.display()
                ),
            ));
        }

        let old_full_path = sub_dir.join(format!("{}.json", current.name));
        if !old_full_path.exists() {
            return Err(CommandError::resource_not_found(
                "source config file",
                old_full_path.display(),
            ));
        }
        if new_full_path.exists() {
            return Err(CommandError::invalid_state(
                "rename profile",
                format!(
                    "a config file already exists at {}",
                    new_full_path.display()
                ),
            ));
        }

        fs::rename(&old_full_path, &new_full_path)
            .map_err(|e| CommandError::resource_not_found("renamed config file", e))?;
        index.rename_by_id(&id_for_index, trimmed.clone());
        Ok(index.entries())
    })
    .await?;

    to_views(&entries)
}

#[tauri::command]
pub async fn delete_profile(id: String) -> Result<Vec<ProfileEntryView>, CommandError> {
    let id_for_index = id.clone();
    let entries = crate::config::profiles::with_index(move |index| {
        let Some(entry) = index.remove_by_id(&id_for_index) else {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("No profile found for id '{id_for_index}'"),
            ));
        };
        let sub_dir = crate::config::paths::get_sub_dir()?;
        let full_path = sub_dir.join(format!("{}.json", entry.name));
        if full_path.exists() {
            fs::remove_file(&full_path)
                .map_err(|e| CommandError::resource_not_found("config file", e))?;
        }
        Ok(index.entries())
    })
    .await?;

    to_views(&entries)
}

#[tauri::command]
pub async fn open_config_file(id: String) -> Result<(), CommandError> {
    let entries = crate::config::profiles::with_index(|index| Ok(index.entries())).await?;
    let entry = entries.iter().find(|e| e.id == id).ok_or_else(|| {
        CommandError::resource_not_found("profile", format!("No profile found for id '{id}'"))
    })?;

    let sub_dir = crate::config::paths::get_sub_dir()?;
    let full_path = sub_dir.join(format!("{}.json", entry.name));
    if !full_path.exists() {
        return Err(CommandError::resource_not_found(
            "config file",
            full_path.display(),
        ));
    }

    open_with_system(&full_path.to_string_lossy())
}

/// Derive a filename for a subscription from its URL, purely for display /
/// on-disk naming — never trusted as a path. Splits on both `/` and `\`
/// (a URL's *string form* can carry a literal backslash even though the
/// WHATWG URL parser normalizes it away before the request is ever sent —
/// see `resolve_safe_path`'s callers, which don't rely on this function
/// alone) and sanitizes the remaining component so it can never contain a
/// path separator or `..`.
fn extract_file_name_from_url(url: &str) -> String {
    let path_part = url.split(['?', '#']).next().unwrap_or(url);
    let raw_name = path_part
        .split(['/', '\\'])
        .next_back()
        .unwrap_or("subscription");
    let stem = raw_name.strip_suffix(".json").unwrap_or(raw_name);
    format!("{}.json", sanitize_filename_component(stem))
}
