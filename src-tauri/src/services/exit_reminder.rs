// exit_reminder.rs — 组偏离期望出口太久时发系统通知。
//
// 场景：临时把某个组切到别的节点，之后忘了切回来。所以**不在切换那一刻提醒**
// （那一下是用户故意的），而是偏离满 N 分钟才提醒，之后每 N 分钟再提醒一次，
// 直到切回来。N 来自 `AppDisplaySettings::exit_reminder_minutes`，`0` = 关闭。
//
// 住在 Rust 而不是前端，理由和 `resident::spawn_notifier` 一样：关窗会销毁
// webview，而「忘了切回来」恰恰最常发生在窗口已经关掉之后。
//
// 只按分钟级的定时器对一遍，不订阅变化：提醒粒度本来就是分钟，切过去又在一
// 分钟内切回来的那种根本不该被记下。数据也全是现成的 —— 组的当前选择来自
// `ResidentState`（托盘用的那份，已经只含 selectable 组），期望值来自
// `config::exit_expect`。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::config::app_settings::BackendPrefsState;
use crate::config::exit_expect::{self, ExitExpect};
use crate::services::resident::{ResidentState, TrayGroup};
use crate::store::Store;

/// 对表的间隔。提醒间隔最短也是十几分钟，一分钟的误差无所谓。
const CHECK_INTERVAL: Duration = Duration::from_secs(60);

/// 一次该提醒的偏离。
#[derive(Debug, Clone, PartialEq)]
pub struct Drift {
    pub group: String,
    pub current: String,
    pub expected: String,
}

/// 每个正在偏离的组从什么时候开始算 —— 偏离开始的时刻，或上一次提醒的时刻。
/// 组一旦回到期望节点（或规则没了、组没了）就移出，下次偏离重新计时。
#[derive(Default)]
pub struct Tracker {
    anchors: HashMap<String, Instant>,
}

impl Tracker {
    /// 对一遍，返回这一轮该提醒的组。
    ///
    /// 这几种情况一律**不算偏离**，也就不计时：
    /// * 组不在当前配置里（换了档案、订阅更新后组改了名）
    /// * 期望节点已经不在组里 —— 切不回去的东西提醒了也没用，前端会把它标成
    ///   「not in group」让用户自己清掉
    pub fn poll(
        &mut self,
        groups: &[TrayGroup],
        expect: &ExitExpect,
        now: Instant,
        interval: Duration,
    ) -> Vec<Drift> {
        let mut due = Vec::new();
        let mut still_off = HashMap::new();

        for group in groups {
            let Some(expected) = expect.get(&group.tag) else {
                continue;
            };
            if group.selected == *expected || !group.items.contains(expected) {
                continue;
            }

            let mut anchor = self.anchors.get(&group.tag).copied().unwrap_or(now);
            if now.duration_since(anchor) >= interval {
                due.push(Drift {
                    group: group.tag.clone(),
                    current: group.selected.clone(),
                    expected: expected.clone(),
                });
                anchor = now;
            }
            still_off.insert(group.tag.clone(), anchor);
        }

        self.anchors = still_off;
        due
    }

    pub fn reset(&mut self) {
        self.anchors.clear();
    }
}

/// 通知正文。多个组合成一条，免得一次弹好几个。
pub fn notification_body(drifts: &[Drift]) -> String {
    match drifts {
        [one] => format!(
            "{} is still on {} (expected {}).",
            one.group, one.current, one.expected
        ),
        many => {
            let list = many
                .iter()
                .map(|d| format!("{} → {}", d.group, d.current))
                .collect::<Vec<_>>()
                .join(", ");
            format!("{} groups are off their expected node: {list}", many.len())
        }
    }
}

pub fn spawn_exit_reminder(app: AppHandle, resident: Arc<ResidentState>) {
    tauri::async_runtime::spawn(async move {
        let mut tracker = Tracker::default();
        let mut ticker = tokio::time::interval(CHECK_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            ticker.tick().await;

            let minutes = app
                .try_state::<BackendPrefsState>()
                .map(|prefs| prefs.get().exit_reminder_minutes)
                .unwrap_or(0);
            // 会话结束时 `ResidentState` 会被清空 —— 没连上就没有「偏离」可言，
            // 计时也一起清掉，下次连上从头算。
            let groups = resident.groups();
            if minutes == 0 || groups.is_empty() {
                tracker.reset();
                continue;
            }

            let Some(store) = app.try_state::<Store>() else {
                continue;
            };
            let expect = store
                .run_blocking(|store| Ok(exit_expect::load_for_selected(store)))
                .await
                .unwrap_or_default();

            let drifts = tracker.poll(
                &groups,
                &expect,
                Instant::now(),
                Duration::from_secs(u64::from(minutes) * 60),
            );
            if drifts.is_empty() {
                continue;
            }

            if let Err(e) = app
                .notification()
                .builder()
                .title("Expected outbound")
                .body(notification_body(&drifts))
                .show()
            {
                tracing::warn!(error = ?e, "failed to show exit reminder notification");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: Duration = Duration::from_secs(60);
    const INTERVAL: Duration = Duration::from_secs(30 * 60);

    fn group(tag: &str, selected: &str) -> TrayGroup {
        TrayGroup {
            tag: tag.into(),
            selected: selected.into(),
            items: vec!["TW".into(), "HK".into(), "JP".into()],
        }
    }

    fn expect(pairs: &[(&str, &str)]) -> ExitExpect {
        pairs
            .iter()
            .map(|(g, n)| (g.to_string(), n.to_string()))
            .collect()
    }

    #[test]
    fn a_fresh_drift_waits_a_full_interval_before_the_first_reminder() {
        // 切过去的那一下是用户故意的，不该马上弹。
        let mut tracker = Tracker::default();
        let start = Instant::now();
        let groups = [group("test", "HK")];
        let expect = expect(&[("test", "TW")]);

        assert!(tracker.poll(&groups, &expect, start, INTERVAL).is_empty());
        assert!(
            tracker
                .poll(&groups, &expect, start + 29 * MIN, INTERVAL)
                .is_empty()
        );
        assert_eq!(
            tracker.poll(&groups, &expect, start + 30 * MIN, INTERVAL),
            vec![Drift {
                group: "test".into(),
                current: "HK".into(),
                expected: "TW".into(),
            }]
        );
    }

    #[test]
    fn it_keeps_reminding_every_interval_until_switched_back() {
        let mut tracker = Tracker::default();
        let start = Instant::now();
        let groups = [group("test", "HK")];
        let expect = expect(&[("test", "TW")]);

        tracker.poll(&groups, &expect, start, INTERVAL);
        assert_eq!(
            tracker
                .poll(&groups, &expect, start + 30 * MIN, INTERVAL)
                .len(),
            1
        );
        assert!(
            tracker
                .poll(&groups, &expect, start + 31 * MIN, INTERVAL)
                .is_empty(),
            "just reminded"
        );
        assert_eq!(
            tracker
                .poll(&groups, &expect, start + 60 * MIN, INTERVAL)
                .len(),
            1
        );
    }

    #[test]
    fn switching_back_resets_the_clock() {
        let mut tracker = Tracker::default();
        let start = Instant::now();
        let expect = expect(&[("test", "TW")]);

        tracker.poll(&[group("test", "HK")], &expect, start, INTERVAL);
        tracker.poll(&[group("test", "TW")], &expect, start + 20 * MIN, INTERVAL);
        // 又切走了：从这一刻重新计时，而不是接着最早那次。
        assert!(
            tracker
                .poll(&[group("test", "HK")], &expect, start + 31 * MIN, INTERVAL)
                .is_empty()
        );
        assert_eq!(
            tracker
                .poll(&[group("test", "HK")], &expect, start + 61 * MIN, INTERVAL)
                .len(),
            1
        );
    }

    #[test]
    fn hopping_between_wrong_nodes_keeps_the_original_clock() {
        // HK → JP 仍然是「没切回 TW」，不该因为换了个错的节点就重新计时。
        let mut tracker = Tracker::default();
        let start = Instant::now();
        let expect = expect(&[("test", "TW")]);

        tracker.poll(&[group("test", "HK")], &expect, start, INTERVAL);
        tracker.poll(&[group("test", "JP")], &expect, start + 20 * MIN, INTERVAL);
        let due = tracker.poll(&[group("test", "JP")], &expect, start + 30 * MIN, INTERVAL);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].current, "JP");
    }

    #[test]
    fn an_expected_node_that_is_gone_never_reminds() {
        let mut tracker = Tracker::default();
        let start = Instant::now();
        let expect = expect(&[("test", "TW-renamed")]);
        let groups = [group("test", "HK")];

        tracker.poll(&groups, &expect, start, INTERVAL);
        assert!(
            tracker
                .poll(&groups, &expect, start + 90 * MIN, INTERVAL)
                .is_empty()
        );
    }

    #[test]
    fn groups_without_an_expectation_or_missing_from_the_config_are_ignored() {
        let mut tracker = Tracker::default();
        let start = Instant::now();
        let expect = expect(&[("gone", "TW")]);
        let groups = [group("test", "HK")];

        tracker.poll(&groups, &expect, start, INTERVAL);
        assert!(
            tracker
                .poll(&groups, &expect, start + 90 * MIN, INTERVAL)
                .is_empty()
        );
    }

    #[test]
    fn a_reset_starts_every_clock_over() {
        // 断连 / 关掉提醒都会走 `reset`：重新连上之后要再等满一个间隔。
        let mut tracker = Tracker::default();
        let start = Instant::now();
        let groups = [group("test", "HK")];
        let expect = expect(&[("test", "TW")]);

        tracker.poll(&groups, &expect, start, INTERVAL);
        tracker.reset();
        assert!(
            tracker
                .poll(&groups, &expect, start + 30 * MIN, INTERVAL)
                .is_empty()
        );
    }

    #[test]
    fn several_drifts_share_one_notification() {
        let one = Drift {
            group: "test".into(),
            current: "HK".into(),
            expected: "TW".into(),
        };
        assert_eq!(
            notification_body(std::slice::from_ref(&one)),
            "test is still on HK (expected TW)."
        );

        let two = [
            one,
            Drift {
                group: "stream".into(),
                current: "US".into(),
                expected: "JP".into(),
            },
        ];
        assert_eq!(
            notification_body(&two),
            "2 groups are off their expected node: test → HK, stream → US"
        );
    }
}
