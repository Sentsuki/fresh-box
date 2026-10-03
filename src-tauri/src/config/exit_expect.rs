// 期望出口：每个档案里「这个组平时应该停在哪个节点」。
//
// 用途很窄：临时把某个组切到别的节点之后忘了切回来 —— `services::exit_reminder`
// 定时对一遍，偏离太久就发系统通知。只比较组自己的 `selected`，不跟嵌套组往下
// 走：要防的就是「我手动改过的那一下」，而手动能改的只有 selectable 组的那一层。
//
// 按档案分开存（`settings` 表，scope = `exitExpect`，key = 档案 id），因为组名和
// 节点名只在那一份配置里有意义；删档案时一并删掉（`store::profiles::delete`）。

use std::collections::BTreeMap;

use crate::errors::CommandError;
use crate::store::{Store, settings};

/// 组 tag → 期望节点 tag。每组至多一个。
pub type ExitExpect = BTreeMap<String, String>;

pub fn load(store: &Store, profile_id: &str) -> Result<ExitExpect, CommandError> {
    settings::get_or_default(store, settings::SCOPE_EXIT_EXPECT, profile_id)
}

/// 设定（`Some`）或取消（`None`）一个组的期望节点，返回改完之后的整张表 ——
/// 前端拿它直接替换本地那份，不用再读一次。
pub fn set(
    store: &Store,
    profile_id: &str,
    group: &str,
    node: Option<&str>,
) -> Result<ExitExpect, CommandError> {
    let mut expect = load(store, profile_id)?;
    match node {
        Some(node) => {
            expect.insert(group.to_string(), node.to_string());
        }
        None => {
            expect.remove(group);
        }
    }
    settings::set(store, settings::SCOPE_EXIT_EXPECT, profile_id, &expect)?;
    Ok(expect)
}

/// 当前选中档案的那张表 —— 正在跑的实例就是用它启动的。没选档案、或者读失败，
/// 都当成「没有期望」：提醒是锦上添花，不该因为它报错。
pub fn load_for_selected(store: &Store) -> ExitExpect {
    settings::selected_profile(store)
        .ok()
        .flatten()
        .and_then(|id| load(store, &id).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pinning_replaces_and_unpinning_removes() {
        let store = Store::open_in_memory().expect("store");
        assert!(load(&store, "p").unwrap().is_empty());

        set(&store, "p", "test", Some("TW")).unwrap();
        // 每组只有一个期望节点 —— 钉另一个就是换掉。
        let expect = set(&store, "p", "test", Some("HK")).unwrap();
        assert_eq!(expect.get("test").map(String::as_str), Some("HK"));
        assert_eq!(load(&store, "p").unwrap(), expect);

        let expect = set(&store, "p", "test", None).unwrap();
        assert!(expect.is_empty());
    }

    #[test]
    fn profiles_do_not_see_each_others_expectations() {
        let store = Store::open_in_memory().expect("store");
        set(&store, "a", "test", Some("TW")).unwrap();
        assert!(load(&store, "b").unwrap().is_empty());
    }

    #[test]
    fn the_selected_profile_decides_which_table_the_reminder_reads() {
        let store = Store::open_in_memory().expect("store");
        set(&store, "a", "test", Some("TW")).unwrap();
        assert!(load_for_selected(&store).is_empty(), "nothing selected yet");

        settings::set_selected_profile(&store, Some("a")).unwrap();
        assert_eq!(
            load_for_selected(&store).get("test").map(String::as_str),
            Some("TW")
        );
    }

    #[test]
    fn deleting_a_profile_takes_its_expectations_with_it() {
        let store = Store::open_in_memory().expect("store");
        let profile = crate::store::profiles::create(&store, "exit-expect", None, "{}")
            .expect("create profile");
        set(&store, &profile.id, "test", Some("TW")).unwrap();

        crate::store::profiles::delete(&store, &profile.id).expect("delete profile");

        let rows: i64 = store
            .with(|connection| {
                connection
                    .query_row(
                        "SELECT COUNT(*) FROM settings WHERE scope = ?1",
                        [settings::SCOPE_EXIT_EXPECT],
                        |row| row.get(0),
                    )
                    .map_err(|e| CommandError::io("count", e))
            })
            .unwrap();
        assert_eq!(rows, 0);
    }
}
