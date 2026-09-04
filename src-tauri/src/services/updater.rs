// updater.rs — checks GitHub Releases for a fresh-box build newer than the
// one currently running. Detection only, and nothing more: nothing here
// ever downloads an installer, replaces the running exe, or runs anything
// elevated on its own. The frontend surfaces what this finds (an
// `update-available` event at startup, plus an on-demand check from
// Settings) and the user decides whether to act on it — clicking through to
// the release page opens it in their normal browser
// (`commands::app::open_external_url`), same as if they'd checked by hand.
// A full self-update pipeline (silent download, signature verification,
// swap-and-relaunch) is a substantially bigger, riskier feature this
// deliberately doesn't attempt.

use std::sync::OnceLock;

use crate::errors::CommandError;

const GITHUB_REPO: &str = "Sentsuki/fresh-box";

static UPDATE_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn update_client() -> &'static reqwest::Client {
    UPDATE_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            // GitHub's REST API rejects requests with no User-Agent at all.
            .user_agent("fresh-box-update-check")
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("Failed to initialize the update-check HTTP client")
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_notes: Option<String>,
}

impl UpdateInfo {
    fn none(current_version: &str) -> Self {
        Self {
            current_version: current_version.to_string(),
            available: false,
            latest_version: None,
            release_url: None,
            release_notes: None,
        }
    }
}

#[derive(serde::Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// Parses a `1.14.0`/`v1.14.0`-style version string into `(major, minor,
/// patch)` for comparison — no external semver dependency, since this is
/// the only place fresh-box needs one and its own version scheme (and the
/// tags it's released under) has never used anything more elaborate than
/// three dot-separated numbers. A pre-release/build suffix (`-beta.1`,
/// `+abc`) is dropped before parsing the numeric core; anything else that
/// doesn't parse cleanly returns `None` rather than a guess.
fn parse_version(raw: &str) -> Option<(u64, u64, u64)> {
    let trimmed = raw.trim().trim_start_matches(['v', 'V']);
    let core = trimmed.split(['-', '+']).next().unwrap_or(trimmed);
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

/// Fetches the repo's latest published (non-draft, non-prerelease) GitHub
/// release and compares its tag against `current_version`.
///
/// Only fails for the check itself being impossible (network error,
/// non-2xx response, unparseable JSON) — a release that exists but can't be
/// confirmed *newer* (no releases published yet, the tag doesn't parse as a
/// version, it parses but isn't greater) comes back as
/// `UpdateInfo { available: false, .. }` rather than an error, since
/// "couldn't determine whether there's an update" isn't something worth
/// interrupting the user over, especially from the silent startup check in
/// `main.rs`'s `setup()`.
pub async fn check_for_update(current_version: &str) -> Result<UpdateInfo, CommandError> {
    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    let response = update_client()
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| CommandError::network(format!("Failed to check for updates: {e}")))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        // No releases published on the repo at all yet.
        return Ok(UpdateInfo::none(current_version));
    }
    if !response.status().is_success() {
        return Err(CommandError::network(format!(
            "GitHub returned HTTP {} while checking for updates",
            response.status()
        )));
    }

    let release: GithubRelease = response
        .json()
        .await
        .map_err(|e| CommandError::network(format!("Failed to parse release info: {e}")))?;

    if release.draft || release.prerelease {
        return Ok(UpdateInfo::none(current_version));
    }

    let Some(latest) = parse_version(&release.tag_name) else {
        tracing::warn!(
            tag = %release.tag_name,
            "update check: couldn't parse release tag as a version"
        );
        return Ok(UpdateInfo::none(current_version));
    };
    let Some(current) = parse_version(current_version) else {
        tracing::warn!(%current_version, "update check: couldn't parse the app's own version");
        return Ok(UpdateInfo::none(current_version));
    };

    if latest <= current {
        return Ok(UpdateInfo::none(current_version));
    }

    Ok(UpdateInfo {
        current_version: current_version.to_string(),
        available: true,
        latest_version: Some(release.tag_name.trim_start_matches(['v', 'V']).to_string()),
        release_url: Some(release.html_url),
        release_notes: release.body,
    })
}
