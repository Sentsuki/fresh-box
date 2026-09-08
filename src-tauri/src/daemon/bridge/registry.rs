// 流注册表 —— 把每条 gRPC 订阅挂在开启它的那个窗口名下，窗口销毁时一并取消。
//
// 这是销毁模式（关闭主窗口 = 销毁 webview）特有的风险点：每一次开关窗口都会
// 新建一批订阅。少收一次，daemon 那边就多留一条永远不会有人读的流；症状是
// 内存缓涨、daemon 变慢，不会立刻报错，所以只能靠机制保证而不是靠记得清理。
//
// 两道保险：
//   1. `WindowEvent::Destroyed`（`main.rs`）调 `cancel_window`
//   2. `Channel::send` 失败即视为对端已消失，任务自行退出并注销
// 任何一道单独都够用，两道一起是因为它们的失效方式不同：第一道漏在「事件没
// 触发」，第二道漏在「流上再也没有新消息、send 也就没机会失败」。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU32, Ordering};

use tokio::task::AbortHandle;

/// 按窗口分组的活跃流。`u32` 是发给前端的流 id，前端用它调 `daemon_cancel`。
///
/// `Clone` 是廉价的（一次 Arc 计数），因为每条流的任务都要持有一份来注销
/// 自己 —— 它跑在 Tauri managed state 的借用之外。
#[derive(Default, Clone)]
pub struct StreamRegistry {
    inner: Arc<Inner>,
}

#[derive(Default)]
struct Inner {
    /// 窗口 label → (流 id → 取消句柄)
    windows: Mutex<HashMap<String, HashMap<u32, AbortHandle>>>,
    next_id: AtomicU32,
}

impl StreamRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// 领一个流 id。先领 id 再 spawn 任务，这样任务里就能用它注销自己。
    pub fn next_id(&self) -> u32 {
        self.inner.next_id.fetch_add(1, Ordering::Relaxed)
    }

    pub fn insert(&self, window: &str, id: u32, handle: AbortHandle) {
        let Ok(mut windows) = self.inner.windows.lock() else {
            return;
        };
        windows.entry(window.to_string()).or_default().insert(id, handle);
    }

    /// 注销但不取消 —— 任务自己跑完时调用，此时再 abort 自己没有意义。
    pub fn remove(&self, window: &str, id: u32) {
        let Ok(mut windows) = self.inner.windows.lock() else {
            return;
        };
        if let Some(streams) = windows.get_mut(window) {
            streams.remove(&id);
            if streams.is_empty() {
                windows.remove(window);
            }
        }
    }

    /// 取消一条流。`true` 表示确实取消了一条还活着的。
    pub fn cancel(&self, window: &str, id: u32) -> bool {
        let Ok(mut windows) = self.inner.windows.lock() else {
            return false;
        };
        let Some(streams) = windows.get_mut(window) else {
            return false;
        };
        let Some(handle) = streams.remove(&id) else {
            return false;
        };
        handle.abort();
        if streams.is_empty() {
            windows.remove(window);
        }
        true
    }

    /// 取消某个窗口名下的全部流，返回取消了几条。窗口销毁时调用。
    pub fn cancel_window(&self, window: &str) -> usize {
        let Ok(mut windows) = self.inner.windows.lock() else {
            return 0;
        };
        let Some(streams) = windows.remove(window) else {
            return 0;
        };
        let count = streams.len();
        for handle in streams.into_values() {
            handle.abort();
        }
        count
    }

    /// 当前活跃流总数 —— 「开关窗口 N 次后回到基线」这条验收标准的观测点。
    pub fn active_count(&self) -> usize {
        self.inner
            .windows
            .lock()
            .map(|windows| windows.values().map(HashMap::len).sum())
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 造一个永不结束的任务，只为拿它的 `AbortHandle`。
    fn spawn_idle() -> (tokio::task::JoinHandle<()>, AbortHandle) {
        let handle = tokio::spawn(std::future::pending::<()>());
        let abort = handle.abort_handle();
        (handle, abort)
    }

    #[tokio::test]
    async fn cancel_window_drops_every_stream_it_owns() {
        let registry = StreamRegistry::new();
        let mut tasks = Vec::new();

        for _ in 0..5 {
            let (task, abort) = spawn_idle();
            let id = registry.next_id();
            registry.insert("main", id, abort);
            tasks.push(task);
        }
        // 另一个窗口的流不该被牵连。
        let (other_task, other_abort) = spawn_idle();
        let other_id = registry.next_id();
        registry.insert("other", other_id, other_abort);

        assert_eq!(registry.active_count(), 6);
        assert_eq!(registry.cancel_window("main"), 5);
        assert_eq!(registry.active_count(), 1, "only 'other' should remain");

        for task in tasks {
            assert!(task.await.unwrap_err().is_cancelled());
        }

        registry.cancel_window("other");
        assert!(other_task.await.unwrap_err().is_cancelled());
        assert_eq!(registry.active_count(), 0);
    }

    #[tokio::test]
    async fn repeated_window_cycles_return_to_baseline() {
        // 「开关窗口 50 次，活跃订阅数回到基线」的机制部分 —— GUI 那半只能
        // 手测，但注册表这半可以钉死。
        let registry = StreamRegistry::new();
        for _ in 0..50 {
            let mut tasks = Vec::new();
            for _ in 0..4 {
                let (task, abort) = spawn_idle();
                let id = registry.next_id();
                registry.insert("main", id, abort);
                tasks.push(task);
            }
            assert_eq!(registry.cancel_window("main"), 4);
            for task in tasks {
                assert!(task.await.unwrap_err().is_cancelled());
            }
        }
        assert_eq!(registry.active_count(), 0);
    }

    #[tokio::test]
    async fn remove_deregisters_without_cancelling() {
        let registry = StreamRegistry::new();
        let handle = tokio::spawn(async {});
        let id = registry.next_id();
        registry.insert("main", id, handle.abort_handle());

        registry.remove("main", id);
        assert_eq!(registry.active_count(), 0);
        // 任务自己跑完，不该被记成「取消」。
        assert!(handle.await.is_ok());
    }

    #[tokio::test]
    async fn cancelling_an_unknown_stream_is_a_no_op() {
        let registry = StreamRegistry::new();
        assert!(!registry.cancel("main", 42));
        assert_eq!(registry.cancel_window("nope"), 0);
    }

    #[test]
    fn ids_are_unique() {
        let registry = StreamRegistry::new();
        let ids: Vec<u32> = (0..100).map(|_| registry.next_id()).collect();
        let unique: std::collections::HashSet<u32> = ids.iter().copied().collect();
        assert_eq!(unique.len(), ids.len());
    }
}
