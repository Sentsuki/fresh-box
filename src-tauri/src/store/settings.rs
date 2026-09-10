// 设置存储 —— 按「区」分行的键值表。
//
// 取代 `app_settings.json` + `backend_prefs.json` + `priority_config.json` +
// `config_override.json` 四个文件。
//
// 分区不是为了好看：`backend_prefs.json` 当初从 `app_settings.json` 里拆出来，
// 是因为后者任何一处解析失败都会把后端依赖的 `auto_close_connections` 一起
// 打回默认值（哪怕坏的是表格列宽这种无关字段）。
// 一区一行之后，这个问题变成 schema 的自然性质，不需要再靠「拆一个文件出来」
// 这种手工隔离。

use rusqlite::{OptionalExtension, params};
use serde::{Serialize, de::DeserializeOwned};

use crate::errors::CommandError;

use super::Store;

/// 前端设置的各个区。`scope` 固定为 `app`，`key` 是区名。
pub const SCOPE_APP: &str = "app";

/// 后端唯一关心的那一区 —— 窗口关闭行为、切换节点后是否自动断连接。
pub const KEY_BEHAVIOR: &str = "behavior";

/// 档案相关的设置区（`ProfilesSettings`），选中的档案 id 就在里面。
///
/// 和前端读的是**同一个键**：一度这里另开了一个 `selectedProfile` 键，而前端
/// 读的是 `profiles` 区里的字段，两边各写各的谁也看不见谁。
pub const KEY_PROFILES: &str = "profiles";

/// 上次生效的 Clash 模式（rule / global / direct）。
///
/// 由 `services::resident` 的 `SubscribeClashMode` 订阅写入，启动合成配置时
/// 回填成 `clash_api.default_mode` —— 用户选的模式因此能跨重启保留，而 daemon
/// 仍是运行期唯一的真相源（审计项 M-09）。
pub const KEY_CLASH_MODE: &str = "clashMode";

pub fn last_clash_mode(store: &Store) -> Option<String> {
    get_or_default::<Option<String>>(store, SCOPE_APP, KEY_CLASH_MODE)
        .ok()
        .flatten()
        .filter(|value| !value.is_empty())
}

pub fn set_last_clash_mode(store: &Store, mode: &str) -> Result<(), CommandError> {
    set(store, SCOPE_APP, KEY_CLASH_MODE, &Some(mode))
}

/// 读一个区，没有或解析失败就返回默认值。
///
/// 解析失败按「没有」处理而不是报错：一区设置坏掉不该让应用起不来，而它坏了
/// 也影响不到别的区。
pub fn get_or_default<T: DeserializeOwned + Default>(
    store: &Store,
    scope: &str,
    key: &str,
) -> Result<T, CommandError> {
    let raw: Option<String> = store.with(|connection| {
        connection
            .query_row(
                "SELECT value FROM settings WHERE scope = ?1 AND key = ?2",
                params![scope, key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| CommandError::io("read setting", e))
    })?;

    Ok(raw
        .and_then(|value| match serde_json::from_str::<T>(&value) {
            Ok(parsed) => Some(parsed),
            Err(e) => {
                tracing::warn!(error = ?e, scope, key, "setting failed to parse, using default");
                None
            }
        })
        .unwrap_or_default())
}

pub fn set<T: Serialize>(
    store: &Store,
    scope: &str,
    key: &str,
    value: &T,
) -> Result<(), CommandError> {
    let encoded = encode(value)?;
    store.with(|connection| write_one(connection, scope, key, &encoded))
}

/// 把一个值编码成存进 `settings.value` 的那串 JSON。
///
/// 单独抽出来是为了 `set_all`：那里要在**进事务之前**把所有区都编码好 ——
/// 编码是纯 CPU 且可能失败的，让它发生在事务里只会平白拉长持锁时间，而且
/// 一个区序列化失败就得回滚已经写进去的那几个。
pub fn encode<T: Serialize>(value: &T) -> Result<String, CommandError> {
    serde_json::to_string(value).map_err(|e| CommandError::json("serialize setting", e))
}

fn write_one(
    connection: &rusqlite::Connection,
    scope: &str,
    key: &str,
    encoded: &str,
) -> Result<(), CommandError> {
    connection
        .execute(
            "INSERT INTO settings (scope, key, value) VALUES (?1, ?2, ?3)
             ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value",
            params![scope, key, encoded],
        )
        .map_err(|e| CommandError::io("write setting", e))?;
    Ok(())
}

/// 一次事务写完多个区。
///
/// `save_app_settings` 一次要写 8 个区，以前是 8 条独立语句 = 8 次 WAL 提交，
/// 而且没有原子性：中途失败（或进程正好这时没了）会留下半份设置 —— 比如
/// 「关窗行为」那一区已经改了、别的还是旧的。前端每动一个开关就整包保存一次，
/// 所以这条路走得相当频繁（审计项 M-4）。
pub fn set_all(store: &Store, scope: &str, entries: &[(&str, String)]) -> Result<(), CommandError> {
    store.with(|connection| {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|e| CommandError::io("begin settings transaction", e))?;
        for (key, encoded) in entries {
            write_one(&transaction, scope, key, encoded)?;
        }
        transaction
            .commit()
            .map_err(|e| CommandError::io("commit settings transaction", e))
    })
}

/// 当前选中的配置档案 id（没选过则为 `None`）。
pub fn selected_profile(store: &Store) -> Result<Option<String>, CommandError> {
    let profiles: crate::config::app_settings::ProfilesSettings =
        get_or_default(store, SCOPE_APP, KEY_PROFILES)?;
    Ok(profiles
        .selected_profile_id
        .filter(|value| !value.is_empty()))
}

pub fn set_selected_profile(store: &Store, id: Option<&str>) -> Result<(), CommandError> {
    let mut profiles: crate::config::app_settings::ProfilesSettings =
        get_or_default(store, SCOPE_APP, KEY_PROFILES)?;
    profiles.selected_profile_id = id.map(str::to_string);
    set(store, SCOPE_APP, KEY_PROFILES, &profiles)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]
    struct Behavior {
        theme_mode: String,
        auto_close_connections: bool,
    }

    #[test]
    fn round_trips_a_section() {
        let store = Store::open_in_memory().expect("store");
        let value = Behavior {
            theme_mode: "dark".into(),
            auto_close_connections: true,
        };
        set(&store, SCOPE_APP, KEY_BEHAVIOR, &value).expect("write");
        let read: Behavior = get_or_default(&store, SCOPE_APP, KEY_BEHAVIOR).expect("read");
        assert_eq!(read, value);
    }

    #[test]
    fn a_missing_section_reads_as_default() {
        let store = Store::open_in_memory().expect("store");
        let read: Behavior = get_or_default(&store, SCOPE_APP, "nope").expect("read");
        assert_eq!(read, Behavior::default());
    }

    #[test]
    fn a_corrupt_section_cannot_take_down_its_neighbours() {
        // 这条守的正是 `backend_prefs.json` 当初拆分要解决的问题：以前
        // `app_settings.json` 里任何一处坏掉，后端依赖的行为设置就一起被打回
        // 默认值。现在坏的那一区自己回默认，别的区毫发无损。
        let store = Store::open_in_memory().expect("store");
        let good = Behavior {
            theme_mode: "dark".into(),
            auto_close_connections: true,
        };
        set(&store, SCOPE_APP, KEY_BEHAVIOR, &good).expect("write good section");
        store
            .with(|connection| {
                connection
                    .execute(
                        "INSERT INTO settings (scope, key, value) VALUES (?1, 'broken', '{not json')",
                        [SCOPE_APP],
                    )
                    .map_err(|e| CommandError::io("insert corrupt section", e))?;
                Ok(())
            })
            .expect("insert corrupt section");

        let broken: Behavior = get_or_default(&store, SCOPE_APP, "broken").expect("read");
        assert_eq!(broken, Behavior::default());
        let intact: Behavior = get_or_default(&store, SCOPE_APP, KEY_BEHAVIOR).expect("read");
        assert_eq!(
            intact, good,
            "a corrupt neighbour must not affect this section"
        );
    }

    #[test]
    fn set_all_writes_every_section_atomically() {
        // 审计项 M-4：一次事务，不是 N 条独立语句。原子性这一半没法在单进程
        // 里直接观测（没有可注入的中途失败点），能钉住的是「一次调用把每个
        // 区都写对了」，以及它和逐个 `set` 的结果一致。
        let store = Store::open_in_memory().expect("in-memory store");
        let entries = [
            (
                "a",
                encode(&Behavior {
                    auto_close_connections: true,
                    ..Default::default()
                })
                .expect("encode"),
            ),
            (
                "b",
                encode(&Behavior {
                    auto_close_connections: false,
                    ..Default::default()
                })
                .expect("encode"),
            ),
            (
                "c",
                encode(&Behavior {
                    auto_close_connections: true,
                    ..Default::default()
                })
                .expect("encode"),
            ),
        ];
        set_all(&store, SCOPE_APP, &entries).expect("set_all");

        assert!(
            get_or_default::<Behavior>(&store, SCOPE_APP, "a")
                .expect("read")
                .auto_close_connections
        );
        assert!(
            !get_or_default::<Behavior>(&store, SCOPE_APP, "b")
                .expect("read")
                .auto_close_connections
        );
        assert!(
            get_or_default::<Behavior>(&store, SCOPE_APP, "c")
                .expect("read")
                .auto_close_connections
        );
    }

    #[test]
    fn set_all_overwrites_in_place_rather_than_accumulating_rows() {
        // `ON CONFLICT ... DO UPDATE` 在事务里也要照常生效 —— 前端每动一个
        // 开关就整包保存一次，写重复了就会变成一张只涨不消的表。
        let store = Store::open_in_memory().expect("in-memory store");
        for value in [true, false, true] {
            let entries = [(
                "a",
                encode(&Behavior {
                    auto_close_connections: value,
                    ..Default::default()
                })
                .expect("encode"),
            )];
            set_all(&store, SCOPE_APP, &entries).expect("set_all");
        }

        let rows: i64 = store
            .with(|connection| {
                connection
                    .query_row(
                        "SELECT COUNT(*) FROM settings WHERE scope = ?1 AND key = 'a'",
                        [SCOPE_APP],
                        |row| row.get(0),
                    )
                    .map_err(|e| crate::errors::CommandError::io("count", e))
            })
            .expect("count");
        assert_eq!(rows, 1);
        assert!(
            get_or_default::<Behavior>(&store, SCOPE_APP, "a")
                .expect("read")
                .auto_close_connections
        );
    }

    /// 选中的档案 id 必须和前端读的是同一个键 —— 曾经不是（后端另开了一个
    /// `selectedProfile` 键，前端读 `profiles` 区），两边各写各的。
    #[test]
    fn selected_profile_lives_in_the_profiles_section() {
        let store = Store::open_in_memory().expect("store");
        set_selected_profile(&store, Some("abc")).unwrap();
        let section: crate::config::app_settings::ProfilesSettings =
            get_or_default(&store, SCOPE_APP, KEY_PROFILES).unwrap();
        assert_eq!(section.selected_profile_id.as_deref(), Some("abc"));
    }

    #[test]
    fn selected_profile_round_trips_and_clears() {
        let store = Store::open_in_memory().expect("store");
        assert_eq!(selected_profile(&store).unwrap(), None);
        set_selected_profile(&store, Some("abc")).unwrap();
        assert_eq!(selected_profile(&store).unwrap(), Some("abc".into()));
        set_selected_profile(&store, None).unwrap();
        assert_eq!(selected_profile(&store).unwrap(), None);
    }
}
