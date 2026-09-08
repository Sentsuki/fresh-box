// 阶段 4 的验收：对着**磁盘上真实的**数据库文件跑，而不是内存库。
//
// 三条标准来自重构方案 08 节：
//   1. 两个末段同名的订阅可以共存
//   2. 空库首启无报错
//   3. 杀进程后重启数据库无损坏（WAL 生效）
//
// 第 3 条这里模拟成「写完不 close 直接丢弃连接、重开」——真正拔电源没法在
// 单元测试里做，但 WAL 是否真的开着、重开后数据是否还在，这条能验。

use std::path::PathBuf;

use rusqlite::Connection;

fn temp_db() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("fresh-box-store-test-{nanos}.db"))
}

fn open(path: &PathBuf) -> Connection {
    let connection = Connection::open(path).expect("open database");
    fresh_box_lib::store::schema::migrate(&connection).expect("migrate");
    connection
}

#[test]
fn an_empty_database_opens_clean_and_is_in_wal_mode() {
    let path = temp_db();
    let connection = open(&path);

    let mode: String = connection
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .expect("read journal_mode");
    assert_eq!(mode.to_lowercase(), "wal", "WAL must be on for crash safety");

    let profiles: i64 = connection
        .query_row("SELECT COUNT(*) FROM profiles", [], |row| row.get(0))
        .expect("count profiles");
    assert_eq!(profiles, 0, "a fresh install starts with an empty database");

    drop(connection);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn two_subscriptions_with_the_same_url_tail_coexist() {
    // H-03 的正面验收：以前 https://a/sub 和 https://b/sub 会写到同一个
    // `sub.json`，后者静默覆盖前者、还把索引里的 URL 一起改掉。
    let path = temp_db();
    let connection = open(&path);

    let insert = "INSERT INTO profiles (id, name, url, created_at, sort_order)
                  VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z', ?4)";
    connection
        .execute(insert, rusqlite::params!["id-a", "sub", "https://a.example/sub", 0])
        .expect("first subscription");
    // 第二个用去重后的显示名 —— `store::profiles::unique_name` 干的事。
    connection
        .execute(insert, rusqlite::params!["id-b", "sub (1)", "https://b.example/sub", 1])
        .expect("second subscription with the same URL tail");

    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM profiles", [], |row| row.get(0))
        .expect("count");
    assert_eq!(count, 2, "both subscriptions must survive");

    let urls: Vec<String> = {
        let mut statement = connection
            .prepare("SELECT url FROM profiles ORDER BY sort_order")
            .unwrap();
        let rows = statement.query_map([], |row| row.get::<_, String>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    };
    assert_eq!(
        urls,
        vec!["https://a.example/sub", "https://b.example/sub"],
        "neither URL may be overwritten by the other"
    );

    drop(connection);
    let _ = std::fs::remove_file(&path);
}

#[test]
fn data_survives_dropping_the_connection_without_a_clean_close() {
    let path = temp_db();
    {
        let connection = open(&path);
        connection
            .execute(
                "INSERT INTO settings (scope, key, value) VALUES ('app', 'behavior', '{\"a\":1}')",
                [],
            )
            .expect("write a setting");
        // 不 close，直接丢弃 —— 模拟进程被杀。
        std::mem::forget(connection);
    }

    let reopened = open(&path);
    let value: String = reopened
        .query_row(
            "SELECT value FROM settings WHERE scope = 'app' AND key = 'behavior'",
            [],
            |row| row.get(0),
        )
        .expect("the setting written before the abrupt drop is still there");
    assert_eq!(value, "{\"a\":1}");

    drop(reopened);
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
}
