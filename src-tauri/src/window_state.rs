// window_state.rs — persist and restore the main window's position, size,
// and maximized state across launches. Previously nothing did this: every
// launch opened at `tauri.conf.json`'s fixed, centered default regardless
// of how the window was last left. Mirrors the official Electron client's
// `windowState.ts` + `index.ts`'s `registerMainWindowStatePersistence`.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Window};

const WINDOW_STATE_KEY: &str = "windowState";

/// Smallest size `restore()` will ever apply — keep in sync with
/// `tauri.conf.json`'s `app.windows[0].minWidth`/`minHeight`, which stops
/// the user from manually resizing below this too. Without a floor here, a
/// size restored onto a much smaller monitor than it was saved from (see
/// `restore()`) could clamp down to something core UI (the sidebar, the
/// self-drawn title bar's controls) doesn't fit in any more.
const MIN_WINDOW_WIDTH: u32 = 900;
const MIN_WINDOW_HEIGHT: u32 = 600;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

// 窗口位置/大小也存在 `settings` 表里（阶段 4 之前是 `window_state.json`）。
// 需要 `AppHandle` 才能拿到 Store，所以这两个函数比原来多一个参数。
fn load(app: &tauri::AppHandle) -> Option<WindowState> {
    let store = app.try_state::<crate::store::Store>()?;
    let value: Option<WindowState> = crate::store::settings::get_or_default(
        store.inner(),
        crate::store::settings::SCOPE_APP,
        WINDOW_STATE_KEY,
    )
    .ok()?;
    value
}

fn save(app: &tauri::AppHandle, state: &WindowState) {
    let Some(store) = app.try_state::<crate::store::Store>() else {
        return;
    };
    let _ = crate::store::settings::set(
        store.inner(),
        crate::store::settings::SCOPE_APP,
        WINDOW_STATE_KEY,
        &Some(state),
    );
}

/// Area (in px²) where rect `a` and rect `b` overlap, each given as
/// `(x, y, width, height)`. `0` if they don't overlap at all.
fn intersection_area(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> i64 {
    let (ax, ay, aw, ah) = a;
    let (bx, by, bw, bh) = b;
    let left = ax.max(bx);
    let top = ay.max(by);
    let right = (ax + aw).min(bx + bw);
    let bottom = (ay + ah).min(by + bh);
    if right > left && bottom > top {
        (right - left) as i64 * (bottom - top) as i64
    } else {
        0
    }
}

/// Which currently-connected monitor the saved bounds `(x, y, width,
/// height)` mostly belong to — the one its work area overlaps the most,
/// not just whichever one contains the top-left corner (a saved rect can
/// easily have only its corner, or nothing at all, on a monitor that's
/// since been unplugged, resized, or rearranged). `None` if no monitor
/// overlaps it at all.
fn best_monitor_for(
    monitors: &[tauri::Monitor],
    rect: (i32, i32, u32, u32),
) -> Option<&tauri::Monitor> {
    let (x, y, width, height) = rect;
    monitors
        .iter()
        .map(|m| {
            let work = m.work_area();
            let area = intersection_area(
                (x, y, width as i32, height as i32),
                (
                    work.position.x,
                    work.position.y,
                    work.size.width as i32,
                    work.size.height as i32,
                ),
            );
            (m, area)
        })
        .filter(|(_, area)| *area > 0)
        .max_by_key(|(_, area)| *area)
        .map(|(m, _)| m)
}

/// Clamp `value` into `[min, max]`, tolerating `min > max` (returns `min`
/// in that case) instead of panicking like `i32::clamp` would — which
/// happens here whenever a monitor's work area is smaller than
/// `MIN_WINDOW_WIDTH`/`HEIGHT` in that axis, pushing the clamped-size
/// window's rightmost/bottommost valid position left/above its work area's
/// origin.
fn clamp_tolerant(value: i32, min: i32, max: i32) -> i32 {
    if min > max {
        min
    } else {
        value.clamp(min, max)
    }
}

// ─── 恢复期间挂起写入 ──────────────────────────────────────────────
//
// 窗口总是先按 `tauri.conf.json` 的默认尺寸建出来，之后才轮到 `restore`
// 把上次的尺寸设回去。这中间 Windows 已经发过 WM_SIZE/WM_MOVE，而 tao 会
// 把建窗过程中产生的事件先缓冲、稍后再统一投递 —— 于是「默认尺寸」有机会
// 抢在 `restore` 读取存储之前就被 `persist` 写进去，把用户调好的尺寸冲掉，
// `restore` 随后读到的就是 1200x750。
//
// 托盘重开窗口那条路径（`window_utils::show_or_create_main_window`）里建窗
// 在后台线程、事件在主线程，两边先后不定，所以这是个时灵时不灵的竞态，而
// 不是每次必现 —— 「关掉再打开有时候不是调好的大小」说的就是它。
static PERSIST_SUSPENDED: AtomicBool = AtomicBool::new(false);

/// 在「建窗 + `restore`」这段窗口几何还不代表用户意图的时间里挂起
/// `persist`，直到返回的 guard 析构。
#[must_use = "持久化会在 guard 析构的那一刻立即恢复"]
pub fn suspend_persist() -> PersistGuard {
    PERSIST_SUSPENDED.store(true, Ordering::SeqCst);
    PersistGuard(())
}

pub struct PersistGuard(());

impl Drop for PersistGuard {
    fn drop(&mut self) {
        PERSIST_SUSPENDED.store(false, Ordering::SeqCst);
    }
}

/// Apply the saved state, if there is one and it's still valid. Call once
/// from `setup()`, before the window is first shown — the window is
/// created hidden (`"visible": false` in `tauri.conf.json`) specifically so
/// this can't be seen jumping from the default position to the restored
/// one.
///
/// Clamps both size and position into whichever currently-connected
/// monitor's work area the saved bounds best match, instead of applying
/// them verbatim — a size/position saved from a much larger display (an
/// external 4K monitor, say) applied as-is onto a smaller one (a laptop's
/// built-in screen) could otherwise land mostly or entirely off-screen,
/// with no way for the user to reach the self-drawn title bar's controls
/// to fix it. Mirrors the official Electron client's
/// `restoredMainWindowBounds` (`windowState.ts`).
///
/// The size goes back through `set_size`, which is tao's
/// `set_inner_size` — so what `persist` stores has to be the inner size
/// too, or every round trip drifts. See `persist`.
pub fn restore(window: &WebviewWindow) {
    let Some(state) = load(window.app_handle()) else {
        return;
    };

    let monitors = window.available_monitors().unwrap_or_default();
    let target = (state.width > 0 && state.height > 0)
        .then(|| best_monitor_for(&monitors, (state.x, state.y, state.width, state.height)))
        .flatten();

    if let Some(monitor) = target {
        let work = monitor.work_area();
        let max_width = work.size.width.max(MIN_WINDOW_WIDTH);
        let max_height = work.size.height.max(MIN_WINDOW_HEIGHT);
        let width = state.width.clamp(MIN_WINDOW_WIDTH, max_width);
        let height = state.height.clamp(MIN_WINDOW_HEIGHT, max_height);
        let _ = window.set_size(PhysicalSize::new(width, height));

        let max_x = work.position.x + work.size.width as i32 - width as i32;
        let max_y = work.position.y + work.size.height as i32 - height as i32;
        let x = clamp_tolerant(state.x, work.position.x, max_x);
        let y = clamp_tolerant(state.y, work.position.y, max_y);
        let _ = window.set_position(PhysicalPosition::new(x, y));
    } else if state.width > 0 && state.height > 0 {
        // No connected monitor overlaps the saved bounds at all (every
        // display it was on is gone) — keep the size (still clamped to the
        // app's own floor) but leave the position at `tauri.conf.json`'s
        // `"center": true` default rather than placing it somewhere
        // arbitrary that might not be visible on any current display.
        let width = state.width.max(MIN_WINDOW_WIDTH);
        let height = state.height.max(MIN_WINDOW_HEIGHT);
        let _ = window.set_size(PhysicalSize::new(width, height));
    }

    if state.maximized {
        let _ = window.maximize();
    }
}

/// Save the window's current bounds. Call from the `Resized`/`Moved`
/// window-event handlers in `main.rs`.
///
/// Skips capturing geometry while maximized or fullscreen — Tauri has no
/// equivalent of Electron's `getNormalBounds()` to read the un-maximized
/// bounds back out while maximized — so the last known normal
/// size/position is what `restore` re-applies; the `maximized` flag itself
/// is always kept current, so a maximized window comes back maximized.
///
/// Records the **inner** (client-area) size, because that's the size
/// `restore` puts back: `WebviewWindow::set_size` maps to tao's
/// `set_inner_size`. Saving `outer_size` here instead made every
/// close/reopen cycle grow the window by the difference between the two —
/// on Windows an undecorated window (`"decorations": false`) still carries
/// an invisible resize border/shadow around its client area, so each round
/// trip added that border to a size that already included it.
pub fn persist(window: &Window) {
    // 建窗到 `restore` 之间的窗口几何是 tauri.conf.json 的默认值，不是用户
    // 调出来的 —— 写进去就会把上一次的尺寸冲掉。见 `PERSIST_SUSPENDED`。
    if PERSIST_SUSPENDED.load(Ordering::SeqCst) {
        return;
    }

    let maximized = window.is_maximized().unwrap_or(false);
    // 最小化同样会走 WM_SIZE，但那一条带的是 0x0，位置也变成 (-32000,
    // -32000) 这个哨兵值。照单全收就等于把有效尺寸抹成 0，下次开窗只能退回
    // 默认尺寸（`restore` 对 width/height 为 0 的记录直接不管）。
    let minimized = window.is_minimized().unwrap_or(false);
    let fullscreen = window.is_fullscreen().unwrap_or(false);

    let mut state = load(window.app_handle()).unwrap_or(WindowState {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        maximized: false,
    });
    // 最小化只是暂时藏起来，不该改变「上次是不是最大化的」这个事实：从最大
    // 化状态最小化再还原，窗口仍然是最大化的。
    if !minimized {
        state.maximized = maximized;
    }
    if !maximized && !minimized && !fullscreen {
        if let Ok(pos) = window.outer_position() {
            state.x = pos.x;
            state.y = pos.y;
        }
        if let Ok(size) = window.inner_size() {
            // 0x0 在这里理论上不该出现（上面已经挡掉最小化），但真出现了也
            // 只能是过渡态，宁可留着上一次的值。
            if size.width > 0 && size.height > 0 {
                state.width = size.width;
                state.height = size.height;
            }
        }
    }
    save(window.app_handle(), &state);
}

#[cfg(test)]
mod tests {
    use super::*;

    // `restore`/`persist` 要真窗口，`best_monitor_for` 要 `tauri::Monitor`
    // （构造不出来），所以这里测的是它们下面那两个纯几何函数 —— 恰好也是
    // 「窗口恢复到看不见的地方」这类 bug 真正的所在。

    #[test]
    fn overlapping_rects_report_their_shared_area() {
        assert_eq!(
            intersection_area((0, 0, 100, 100), (50, 50, 100, 100)),
            2500
        );
        assert_eq!(
            intersection_area((0, 0, 100, 100), (0, 0, 100, 100)),
            10_000
        );
    }

    #[test]
    fn a_contained_rect_reports_its_own_area() {
        assert_eq!(
            intersection_area((0, 0, 1920, 1080), (100, 100, 800, 600)),
            480_000
        );
    }

    #[test]
    fn disjoint_rects_report_zero() {
        assert_eq!(intersection_area((0, 0, 100, 100), (200, 200, 100, 100)), 0);
        // 只是贴边不算重叠 —— 窗口挪到显示器边界上时不该被算成「在这块屏上」。
        assert_eq!(intersection_area((0, 0, 100, 100), (100, 0, 100, 100)), 0);
    }

    #[test]
    fn negative_coordinates_work() {
        // 左侧/上方的第二显示器坐标是负的，这是最常见的多屏布局。
        assert_eq!(
            intersection_area((-100, -100, 100, 100), (-50, -50, 100, 100)),
            2500
        );
    }

    #[test]
    fn a_large_rect_does_not_overflow() {
        // i32 相乘会溢出，所以返回的是 i64 —— 4K 双屏的面积轻松超过 i32。
        let area = intersection_area((0, 0, 7680, 4320), (0, 0, 7680, 4320));
        assert_eq!(area, 7680i64 * 4320);
    }

    #[test]
    fn clamping_keeps_a_value_inside_the_range() {
        assert_eq!(clamp_tolerant(50, 0, 100), 50);
        assert_eq!(clamp_tolerant(-10, 0, 100), 0);
        assert_eq!(clamp_tolerant(999, 0, 100), 100);
    }

    #[test]
    fn the_guard_suspends_persisting_only_until_it_is_dropped() {
        // 忘了恢复，用户之后调多大都存不下来了 —— 所以这里盯的是 Drop。
        assert!(!PERSIST_SUSPENDED.load(Ordering::SeqCst));
        {
            let _guard = suspend_persist();
            assert!(PERSIST_SUSPENDED.load(Ordering::SeqCst));
        }
        assert!(!PERSIST_SUSPENDED.load(Ordering::SeqCst));
    }

    #[test]
    fn an_inverted_range_returns_the_minimum_instead_of_panicking() {
        // `i32::clamp` 在 min > max 时会 panic。这里会走到那种情况：显示器
        // 工作区比最小窗口尺寸还小时，「最右合法位置」就落到了工作区原点
        // 左边。宁可把窗口摆在原点，也不要在恢复窗口时直接崩掉。
        assert_eq!(clamp_tolerant(50, 100, 0), 100);
        assert_eq!(clamp_tolerant(-999, 100, 0), 100);
    }
}
