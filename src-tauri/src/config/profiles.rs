// Profile identity — every profile gets a stable `id`, generated once and
// never touched again. `name` (the on-disk `.json` filename stem under
// `sub_dir`) is free to change on rename without any caller having to hunt
// down every place that used to key off it; order is just the index's own
// `Vec` order. No prior on-disk format is read or migrated from — this is
// the only format `profile_index.json` has ever had.
//
// The index is reconciled against what's actually in `sub_dir` on every
// read (`with_index`): a file the user deleted/added outside fresh-box
// (Explorer, a script, ...) is picked up or dropped automatically instead
// of the index silently drifting out of sync with reality.

use crate::errors::CommandError;
use rand::RngExt as _;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

const PROFILE_INDEX_FILE: &str = "profile_index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileEntry {
    pub id: String,
    /// The on-disk filename stem (no `.json`) under `sub_dir` — the only
    /// thing renaming changes.
    pub name: String,
    /// `Some` for a subscription (fetched from a URL, re-fetchable);
    /// `None` for a locally imported file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<String>,
    /// Whether `commands::config::spawn_auto_update_scheduler`'s background
    /// loop should periodically re-fetch this subscription on its own.
    /// Meaningless (and never set) for a locally imported file — always
    /// `false` there.
    #[serde(default)]
    pub auto_update: bool,
    /// `None` means "use `DEFAULT_UPDATE_INTERVAL_MINUTES`" — see
    /// `interval_or_default`. Not read at all unless `auto_update` is
    /// `true`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub update_interval_minutes: Option<u32>,
}

/// Shortest interval a subscription can be auto-updated on — mirrors the
/// official desktop client's `MINIMUM_UPDATE_INTERVAL_MINUTES`
/// (`main/profiles.ts`), which exists for the same reason: without a
/// floor, a user setting an interval of e.g. 1 minute could hammer a
/// subscription provider's server.
pub const MINIMUM_UPDATE_INTERVAL_MINUTES: u32 = 15;

/// Used when `auto_update` is on but `update_interval_minutes` is unset.
pub const DEFAULT_UPDATE_INTERVAL_MINUTES: u32 = 60;

/// Resolve `update_interval_minutes` to an actual interval, applying the
/// floor above regardless of whether the stored value came from the
/// default or an explicit (possibly too-small) user setting.
pub fn interval_or_default(minutes: Option<u32>) -> u32 {
    minutes
        .unwrap_or(DEFAULT_UPDATE_INTERVAL_MINUTES)
        .max(MINIMUM_UPDATE_INTERVAL_MINUTES)
}

/// Whether `entry` is due for an auto-update check as of `now` — `true`
/// for a subscription that has never been fetched at all (so a freshly
/// auto-update-enabled subscription refreshes promptly rather than waiting
/// out a full interval first).
pub fn is_due(entry: &ProfileEntry, now: chrono::DateTime<chrono::Utc>) -> bool {
    if !entry.auto_update || entry.url.is_none() {
        return false;
    }
    let interval = interval_or_default(entry.update_interval_minutes);
    match entry
        .last_updated
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
    {
        Some(last) => {
            now.signed_duration_since(last.with_timezone(&chrono::Utc))
                >= chrono::Duration::minutes(interval as i64)
        }
        None => true,
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ProfileIndex {
    #[serde(default)]
    entries: Vec<ProfileEntry>,
}

fn generate_id() -> String {
    let value: u128 = rand::rng().random();
    format!("{value:032x}")
}

pub(crate) fn stem_from_filename(file_name: &str) -> &str {
    file_name.strip_suffix(".json").unwrap_or(file_name)
}

fn get_index_path() -> Result<PathBuf, CommandError> {
    Ok(super::paths::get_config_dir()?.join(PROFILE_INDEX_FILE))
}

fn save_index(index: &ProfileIndex) -> Result<(), CommandError> {
    super::io::write_json_file(&get_index_path()?, index)
}

fn list_disk_stems(sub_dir: &Path) -> Result<Vec<String>, CommandError> {
    let mut stems = Vec::new();
    for entry in
        fs::read_dir(sub_dir).map_err(|e| CommandError::resource_not_found("sub directory", e))?
    {
        let entry = entry.map_err(|e| CommandError::resource_not_found("directory entry", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json")
            && let Some(stem) = path.file_stem().and_then(|s| s.to_str())
        {
            stems.push(stem.to_string());
        }
    }
    stems.sort();
    Ok(stems)
}

/// Drop entries whose file no longer exists, and append an entry (fresh
/// id, no URL) for every on-disk `.json` file the index doesn't know about
/// yet. Returns whether anything changed.
fn reconcile_with_disk(index: &mut ProfileIndex, sub_dir: &Path) -> Result<bool, CommandError> {
    let on_disk = list_disk_stems(sub_dir)?;
    let on_disk_set: BTreeSet<&str> = on_disk.iter().map(|s| s.as_str()).collect();

    let before = index.entries.len();
    index.entries.retain(|e| on_disk_set.contains(e.name.as_str()));
    let mut changed = index.entries.len() != before;

    let known: BTreeSet<String> = index.entries.iter().map(|e| e.name.clone()).collect();
    for stem in &on_disk {
        if !known.contains(stem.as_str()) {
            index.entries.push(ProfileEntry {
                id: generate_id(),
                name: stem.clone(),
                url: None,
                last_updated: None,
                auto_update: false,
                update_interval_minutes: None,
            });
            changed = true;
        }
    }
    Ok(changed)
}

/// `profile_index.json` doesn't exist yet — a fresh install, with no prior
/// state to carry forward. Starts empty; the caller (`with_index`) always
/// runs `reconcile_with_disk` immediately after, which populates one fresh
/// entry (new id, no URL) per `.json` file already sitting in `sub_dir`.
fn load_index() -> Result<ProfileIndex, CommandError> {
    let path = get_index_path()?;
    if path.exists() {
        return super::io::read_json_file(&path);
    }
    Ok(ProfileIndex::default())
}

static PROFILES_LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();

/// Run `f` against the current profile index, serialized against every
/// other caller of `with_index` — the same coordination problem
/// `subscriptions.json` used to have (independent read-modify-write cycles
/// with no lock between them) solved the same way. `f` should do whatever
/// synchronous file I/O the mutation itself needs (writing/renaming/
/// removing the actual `.json` file) *and* update the index to match, all
/// within the same call — that's what makes the two consistent with each
/// other even if fresh-box crashes mid-operation next time (the disk state
/// reconciliation on the next `with_index` call self-heals the rest).
pub async fn with_index<F, T>(f: F) -> Result<T, CommandError>
where
    F: FnOnce(&mut IndexHandle) -> Result<T, CommandError>,
{
    let _guard = PROFILES_LOCK
        .get_or_init(|| tokio::sync::Mutex::new(()))
        .lock()
        .await;

    let sub_dir = super::paths::get_sub_dir()?;
    let mut index = load_index()?;
    reconcile_with_disk(&mut index, &sub_dir)?;

    let mut handle = IndexHandle { index };
    let result = f(&mut handle)?;
    save_index(&handle.index)?;
    Ok(result)
}

/// The mutable view `with_index` hands its closure — deliberately not the
/// raw `ProfileIndex`, so every mutation goes through a method here instead
/// of closures reaching into `entries` directly and re-deriving the same
/// lookup/id-generation logic slightly differently each time.
pub struct IndexHandle {
    index: ProfileIndex,
}

impl IndexHandle {
    pub fn entries(&self) -> Vec<ProfileEntry> {
        self.index.entries.clone()
    }

    pub fn find_by_id(&self, id: &str) -> Option<&ProfileEntry> {
        self.index.entries.iter().find(|e| e.id == id)
    }

    pub fn name_taken(&self, name: &str, excluding_id: &str) -> bool {
        self.index
            .entries
            .iter()
            .any(|e| e.id != excluding_id && e.name == name)
    }

    /// Insert a new entry for `name`, or update `url`/`last_updated` on the
    /// existing one if `name` is already tracked (an on-disk file being
    /// overwritten in place keeps its identity — only its content
    /// changed). Fields passed as `None` are left as they were.
    pub fn upsert_by_name(
        &mut self,
        name: &str,
        url: Option<String>,
        last_updated: Option<String>,
    ) -> ProfileEntry {
        if let Some(existing) = self.index.entries.iter_mut().find(|e| e.name == name) {
            if url.is_some() {
                existing.url = url;
            }
            if last_updated.is_some() {
                existing.last_updated = last_updated;
            }
            return existing.clone();
        }
        let entry = ProfileEntry {
            id: generate_id(),
            name: name.to_string(),
            url,
            last_updated,
            auto_update: false,
            update_interval_minutes: None,
        };
        self.index.entries.push(entry.clone());
        entry
    }

    pub fn remove_by_id(&mut self, id: &str) -> Option<ProfileEntry> {
        let pos = self.index.entries.iter().position(|e| e.id == id)?;
        Some(self.index.entries.remove(pos))
    }

    pub fn rename_by_id(&mut self, id: &str, new_name: String) {
        if let Some(entry) = self.index.entries.iter_mut().find(|e| e.id == id) {
            entry.name = new_name;
        }
    }

    pub fn set_last_updated_by_id(&mut self, id: &str, last_updated: String) {
        if let Some(entry) = self.index.entries.iter_mut().find(|e| e.id == id) {
            entry.last_updated = Some(last_updated);
        }
    }

    pub fn set_url_by_id(&mut self, id: &str, url: String) {
        if let Some(entry) = self.index.entries.iter_mut().find(|e| e.id == id) {
            entry.url = Some(url);
        }
    }

    pub fn set_auto_update_by_id(
        &mut self,
        id: &str,
        enabled: bool,
        interval_minutes: Option<u32>,
    ) {
        if let Some(entry) = self.index.entries.iter_mut().find(|e| e.id == id) {
            entry.auto_update = enabled;
            entry.update_interval_minutes = interval_minutes;
        }
    }
}
