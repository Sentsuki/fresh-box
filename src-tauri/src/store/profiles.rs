// 配置档案的存储 —— 元数据在 SQLite，内容在 `profiles\<uuid>.json`。
//
// 取代了 `config/profiles.rs` 整个模块（索引文件 + 全局互斥 + 磁盘对账，约
// 290 行）。那套自愈逻辑存在的理由是「索引和磁盘可能对不上」，而对不上的根源
// 是它们本来就是两份互相独立的真相。现在只有一份：数据库说有哪些档案，内容
// 文件按 id 找得到就行。

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use crate::errors::CommandError;

use super::Store;

/// 自动更新的最短间隔 —— 对齐官方客户端的 `MINIMUM_UPDATE_INTERVAL_MINUTES`
/// （`main/profiles.ts`），理由相同：没有下限的话，用户填个 1 分钟就会把订阅
/// 提供方的服务器打爆。
pub const MINIMUM_UPDATE_INTERVAL_MINUTES: u32 = 15;

/// `interval_min` 为空时用的默认值。
pub const DEFAULT_UPDATE_INTERVAL_MINUTES: u32 = 60;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    /// 纯显示名。数据库的 UNIQUE 约束保证它唯一 —— 这就是 H-03 的修复。
    pub name: String,
    /// `Some` = 订阅（可重新拉取）；`None` = 本地导入的文件。
    pub url: Option<String>,
    pub last_updated: Option<String>,
    pub auto_update: bool,
    pub update_interval_minutes: Option<u32>,
}

fn row_to_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<Profile> {
    Ok(Profile {
        id: row.get("id")?,
        name: row.get("name")?,
        url: row.get("url")?,
        last_updated: row.get("last_updated")?,
        auto_update: row.get::<_, i64>("auto_update")? != 0,
        update_interval_minutes: row.get::<_, Option<i64>>("interval_min")?.map(|v| v as u32),
    })
}

/// 把存下来的间隔解析成实际值，无论它来自默认还是用户填的（可能过小）都套上
/// 下限。
pub fn interval_or_default(minutes: Option<u32>) -> u32 {
    minutes
        .unwrap_or(DEFAULT_UPDATE_INTERVAL_MINUTES)
        .max(MINIMUM_UPDATE_INTERVAL_MINUTES)
}

/// `entry` 到 `now` 为止是否该自动更新了。
///
/// 从没拉取过的订阅一律算「到期」，这样刚打开自动更新的订阅会立刻刷一次，而
/// 不是先干等一个完整周期。
pub fn is_due(profile: &Profile, now: chrono::DateTime<chrono::Utc>) -> bool {
    if !profile.auto_update || profile.url.is_none() {
        return false;
    }
    let interval = interval_or_default(profile.update_interval_minutes);
    match profile
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

/// 配置内容文件的路径。文件名是 id，与显示名无关。
pub fn content_path(id: &str) -> Result<std::path::PathBuf, CommandError> {
    Ok(super::profiles_dir()?.join(format!("{id}.json")))
}

pub fn list(store: &Store) -> Result<Vec<Profile>, CommandError> {
    store.with(|connection| {
        let mut statement = connection
            .prepare("SELECT * FROM profiles ORDER BY sort_order, created_at")
            .map_err(|e| CommandError::io("prepare profile list", e))?;
        let rows = statement
            .query_map([], row_to_profile)
            .map_err(|e| CommandError::io("query profiles", e))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| CommandError::io("read profiles", e))
    })
}

pub fn find(store: &Store, id: &str) -> Result<Profile, CommandError> {
    store.with(|connection| {
        connection
            .query_row("SELECT * FROM profiles WHERE id = ?1", [id], row_to_profile)
            .optional()
            .map_err(|e| CommandError::io("query profile", e))?
            .ok_or_else(|| {
                CommandError::resource_not_found("profile", format!("no profile with id '{id}'"))
            })
    })
}

/// 找一个还没被占用的显示名：`sub`、`sub (1)`、`sub (2)`……
///
/// 对齐官方客户端的 `uniqueName()`。有了这个，两个末段同名的订阅可以共存 ——
/// 而不是像以前那样后者静默覆盖前者。
fn unique_name(connection: &Connection, desired: &str) -> Result<String, CommandError> {
    let taken = |name: &str| -> Result<bool, CommandError> {
        connection
            .query_row("SELECT 1 FROM profiles WHERE name = ?1", [name], |_| Ok(()))
            .optional()
            .map(|found| found.is_some())
            .map_err(|e| CommandError::io("check name availability", e))
    };

    if !taken(desired)? {
        return Ok(desired.to_string());
    }
    for suffix in 1..1000 {
        let candidate = format!("{desired} ({suffix})");
        if !taken(&candidate)? {
            return Ok(candidate);
        }
    }
    Err(CommandError::invalid_state(
        "unique_name",
        format!("could not find a free display name based on '{desired}'"),
    ))
}

fn generate_id() -> String {
    use rand::RngExt as _;
    let value: u128 = rand::rng().random();
    format!("{value:032x}")
}

/// 新建一个档案：分配 id、定一个不冲突的显示名、写内容文件、插一行。
///
/// 内容写在事务**内**：写文件失败就整体回滚，不会留下一行指向不存在文件的
/// 记录。反过来（先插行再写文件）做不到这一点。
pub fn create(
    store: &Store,
    desired_name: &str,
    url: Option<String>,
    content: &str,
) -> Result<Profile, CommandError> {
    let now = chrono::Utc::now().to_rfc3339();
    store.with(|connection| {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|e| CommandError::io("begin transaction", e))?;

        let id = generate_id();
        let name = unique_name(&transaction, desired_name)?;
        let sort_order: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM profiles",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CommandError::io("compute sort order", e))?;

        transaction
            .execute(
                "INSERT INTO profiles (id, name, url, last_updated, auto_update, interval_min, created_at, sort_order)
                 VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5, ?6)",
                params![id, name, url, if url.is_some() { Some(&now) } else { None }, now, sort_order],
            )
            .map_err(|e| CommandError::io("insert profile", e))?;

        crate::config::io::atomic_write(&content_path(&id)?, content.as_bytes())?;

        transaction
            .commit()
            .map_err(|e| CommandError::io("commit profile", e))?;

        Ok(Profile {
            id,
            name,
            url,
            last_updated: Some(now),
            auto_update: false,
            update_interval_minutes: None,
        })
    })
}

/// 覆盖一个已有档案的内容，并刷新 `last_updated`（重新拉取订阅时用）。
pub fn replace_content(store: &Store, id: &str, content: &str) -> Result<(), CommandError> {
    let now = chrono::Utc::now().to_rfc3339();
    store.with(|connection| {
        let affected = connection
            .execute(
                "UPDATE profiles SET last_updated = ?2 WHERE id = ?1",
                params![id, now],
            )
            .map_err(|e| CommandError::io("update profile timestamp", e))?;
        if affected == 0 {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("no profile with id '{id}'"),
            ));
        }
        crate::config::io::atomic_write(&content_path(id)?, content.as_bytes())
    })
}

pub fn read_content(store: &Store, id: &str) -> Result<String, CommandError> {
    // 先确认档案存在，这样「没有这个档案」和「内容文件丢了」能给出不同的报错。
    find(store, id)?;
    let path = content_path(id)?;
    std::fs::read_to_string(&path).map_err(|e| {
        CommandError::resource_not_found("profile content", format!("{}: {e}", path.display()))
    })
}

pub fn rename(store: &Store, id: &str, new_name: &str) -> Result<(), CommandError> {
    store.with(|connection| {
        // UNIQUE 冲突这里会直接报出来 —— 不需要自己先查一遍再插，那中间还有
        // 竞态窗口。
        let affected = connection
            .execute(
                "UPDATE profiles SET name = ?2 WHERE id = ?1",
                params![id, new_name],
            )
            .map_err(|e| {
                if format!("{e}").contains("UNIQUE") {
                    CommandError::validation(format!("A profile named '{new_name}' already exists"))
                } else {
                    CommandError::io("rename profile", e)
                }
            })?;
        if affected == 0 {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("no profile with id '{id}'"),
            ));
        }
        Ok(())
    })
}

pub fn delete(store: &Store, id: &str) -> Result<(), CommandError> {
    store.with(|connection| {
        let affected = connection
            .execute("DELETE FROM profiles WHERE id = ?1", [id])
            .map_err(|e| CommandError::io("delete profile", e))?;
        if affected == 0 {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("no profile with id '{id}'"),
            ));
        }
        // 内容文件删失败不回滚：数据库里已经没有这一行了，留一个没人引用的
        // 文件是无害的，而为它把删除操作整个失败掉才是坏体验。
        if let Ok(path) = content_path(id)
            && path.exists()
            && let Err(e) = std::fs::remove_file(&path)
        {
            tracing::warn!(error = ?e, id, "failed to remove profile content file");
        }
        Ok(())
    })
}

pub fn set_url(store: &Store, id: &str, url: &str) -> Result<(), CommandError> {
    store.with(|connection| {
        let affected = connection
            .execute(
                "UPDATE profiles SET url = ?2 WHERE id = ?1",
                params![id, url],
            )
            .map_err(|e| CommandError::io("update subscription url", e))?;
        if affected == 0 {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("no profile with id '{id}'"),
            ));
        }
        Ok(())
    })
}

pub fn set_auto_update(
    store: &Store,
    id: &str,
    enabled: bool,
    interval_minutes: Option<u32>,
) -> Result<(), CommandError> {
    store.with(|connection| {
        let affected = connection
            .execute(
                "UPDATE profiles SET auto_update = ?2, interval_min = ?3 WHERE id = ?1",
                params![id, enabled as i64, interval_minutes.map(|v| v as i64)],
            )
            .map_err(|e| CommandError::io("update auto-update settings", e))?;
        if affected == 0 {
            return Err(CommandError::resource_not_found(
                "profile",
                format!("no profile with id '{id}'"),
            ));
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utc(s: &str) -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::parse_from_rfc3339(s)
            .unwrap()
            .with_timezone(&chrono::Utc)
    }

    fn profile(auto_update: bool, last_updated: Option<&str>, interval: Option<u32>) -> Profile {
        Profile {
            id: "id".into(),
            name: "name".into(),
            url: Some("https://example.invalid/sub".into()),
            last_updated: last_updated.map(str::to_string),
            auto_update,
            update_interval_minutes: interval,
        }
    }

    #[test]
    fn interval_never_goes_below_the_floor() {
        assert_eq!(interval_or_default(None), DEFAULT_UPDATE_INTERVAL_MINUTES);
        assert_eq!(
            interval_or_default(Some(1)),
            MINIMUM_UPDATE_INTERVAL_MINUTES
        );
        assert_eq!(interval_or_default(Some(120)), 120);
    }

    #[test]
    fn a_never_fetched_subscription_is_due_immediately() {
        assert!(is_due(
            &profile(true, None, None),
            utc("2026-01-01T00:00:00Z")
        ));
    }

    #[test]
    fn a_local_file_is_never_due() {
        let mut local = profile(true, None, None);
        local.url = None;
        assert!(!is_due(&local, utc("2026-01-01T00:00:00Z")));
    }

    #[test]
    fn due_only_after_the_interval_has_elapsed() {
        let entry = profile(true, Some("2026-01-01T00:00:00Z"), Some(60));
        assert!(!is_due(&entry, utc("2026-01-01T00:59:00Z")));
        assert!(is_due(&entry, utc("2026-01-01T01:00:00Z")));
    }

    #[test]
    fn auto_update_off_is_never_due() {
        assert!(!is_due(
            &profile(false, None, None),
            utc("2026-01-01T00:00:00Z")
        ));
    }

    #[test]
    fn unique_name_appends_a_suffix_instead_of_colliding() {
        let store = Store::open_in_memory().expect("in-memory store");
        store
            .with(|connection| {
                let insert = "INSERT INTO profiles (id, name, url, created_at, sort_order)
                              VALUES (?1, ?2, NULL, '2026-01-01T00:00:00Z', 0)";
                connection.execute(insert, ["a", "sub"]).unwrap();

                // 这正是以前会静默覆盖的场景：两个订阅 URL 末段都是 `sub`。
                assert_eq!(unique_name(connection, "sub")?, "sub (1)");
                connection.execute(insert, ["b", "sub (1)"]).unwrap();
                assert_eq!(unique_name(connection, "sub")?, "sub (2)");
                // 没被占用的名字原样返回。
                assert_eq!(unique_name(connection, "other")?, "other");
                Ok(())
            })
            .expect("unique_name");
    }
}
