// 数据库 schema 与迁移。
//
// 部署场景是全新安装，不读也不迁任何旧布局（`profile_index.json`、
// `app_settings.json`、`backend_prefs.json`、`priority_config.json`、
// `config_override.json` 全部作废）。`meta.schema_version` 管的是**今后**
// SQLite 自身的演进，和那些已经不存在的 JSON 格式无关。

use rusqlite::Connection;

use crate::errors::CommandError;

/// 当前 schema 版本。加一次迁移就 +1，并在 `migrate` 里补一段。
const SCHEMA_VERSION: i64 = 1;

pub fn migrate(connection: &Connection) -> Result<(), CommandError> {
    // WAL：崩溃/断电后数据库自愈，而且读写不互相阻塞。这台机器上写入量极小，
    // 但「杀进程后重启不损坏」是这次换底的验收标准之一。
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| CommandError::io("enable WAL", e))?;
    connection
        .pragma_update(None, "foreign_keys", true)
        .map_err(|e| CommandError::io("enable foreign keys", e))?;

    let version: i64 = connection
        .query_row(
            "SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'schema_version'), 0)",
            [],
            |row| row.get(0),
        )
        // meta 表还不存在时上面这句会失败 —— 那就是「全新的库」。
        .unwrap_or(0);

    if version >= SCHEMA_VERSION {
        return Ok(());
    }

    connection
        .execute_batch(
            r#"
            BEGIN;

            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- 身份模型是这次换底的重点（审计项 H-03）。以前「用户可见名 =
            -- 磁盘文件名 = 主键」三件事是同一个，于是两个末段同名的订阅
            -- （都叫 /sub、/config.json）后加的会静默覆盖先加的、连索引里的
            -- URL 一起改掉，用户完全无从察觉。
            --
            -- 现在拆成三件：
            --   id    UUID，同时是 profiles/<id>.json 的文件名
            --   name  纯显示名，UNIQUE 由数据库保证唯一
            --   url   订阅地址，和上面两个都无关
            --
            -- 关键在于 UNIQUE 是一条 **schema 约束**，不是「代码里记得检查」。
            CREATE TABLE IF NOT EXISTS profiles (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL UNIQUE,
                url          TEXT,
                last_updated TEXT,
                auto_update  INTEGER NOT NULL DEFAULT 0,
                interval_min INTEGER,
                created_at   TEXT NOT NULL,
                sort_order   INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS profiles_sort_order ON profiles (sort_order);

            -- 设置按「区」分行存放，而不是整块 JSON 一把梭。
            --
            -- 这结构性地解决了 `backend_prefs.json` 当初拆出来要解决的问题：
            -- 那时是因为 `app_settings.json` 里任何一处解析失败，都会把后端
            -- 依赖的 close_behavior / auto_close_connections 一起打回默认值。
            -- 现在一个区坏了碰不到别的区，后端也只读它要的那一区。
            CREATE TABLE IF NOT EXISTS settings (
                scope TEXT NOT NULL,
                key   TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (scope, key)
            );

            COMMIT;
            "#,
        )
        .map_err(|e| CommandError::io("create schema", e))?;

    connection
        .execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [SCHEMA_VERSION.to_string()],
        )
        .map_err(|e| CommandError::io("record schema version", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrating_an_empty_database_is_idempotent() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        migrate(&connection).expect("first migration");
        migrate(&connection).expect("second migration must be a no-op");

        let version: i64 = connection
            .query_row(
                "SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .expect("schema_version is recorded");
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn duplicate_display_names_are_rejected_by_the_schema() {
        // 这条守的是 H-03 的根因。它变红说明有人把 UNIQUE 拿掉了，于是
        // 「同名订阅静默覆盖」又变成可能。
        let connection = Connection::open_in_memory().expect("in-memory database");
        migrate(&connection).expect("migration");

        let insert = "INSERT INTO profiles (id, name, url, created_at, sort_order)
                      VALUES (?1, ?2, NULL, '2026-01-01T00:00:00Z', 0)";
        connection.execute(insert, ["id-a", "sub"]).expect("first insert");
        let error = connection
            .execute(insert, ["id-b", "sub"])
            .expect_err("a second profile with the same display name must be rejected");
        assert!(
            format!("{error}").contains("UNIQUE"),
            "expected a UNIQUE violation, got: {error}"
        );
    }

    #[test]
    fn same_name_is_free_once_the_first_profile_is_renamed() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        migrate(&connection).expect("migration");
        let insert = "INSERT INTO profiles (id, name, url, created_at, sort_order)
                      VALUES (?1, ?2, NULL, '2026-01-01T00:00:00Z', 0)";
        connection.execute(insert, ["id-a", "sub"]).expect("first insert");
        connection
            .execute("UPDATE profiles SET name = 'sub (1)' WHERE id = 'id-a'", [])
            .expect("rename");
        connection
            .execute(insert, ["id-b", "sub"])
            .expect("the freed name is usable again");
    }
}
