// window_state.rs — persist and restore the main window's position, size,
// and maximized state across launches. Previously nothing did this: every
// launch opened at `tauri.conf.json`'s fixed, centered default regardless
// of how the window was last left. Mirrors the official Electron client's
// `windowState.ts` + `index.ts`'s `registerMainWindowStatePersistence`.

use serde::{Deserialize, Serialize};
use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow, Window};

use crate::config;

const WINDOW_STATE_FILE: &str = "window_state.json";

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

fn load() -> Option<WindowState> {
    let path = config::io::get_named_config_path(WINDOW_STATE_FILE).ok()?;
    if !path.exists() {
        return None;
    }
    config::io::read_json_file(&path).ok()
}

fn save(state: &WindowState) {
    if let Ok(path) = config::io::get_named_config_path(WINDOW_STATE_FILE) {
        let _ = config::io::write_json_file(&path, state);
    }
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
    if min > max { min } else { value.clamp(min, max) }
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
pub fn restore(window: &WebviewWindow) {
    let Some(state) = load() else { return };

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
/// Skips capturing geometry while maximized — Tauri has no equivalent of
/// Electron's `getNormalBounds()` to read the un-maximized bounds back out
/// while maximized — so the last known un-maximized size/position is what
/// `restore` re-applies; the `maximized` flag itself is always kept
/// current, so a maximized window comes back maximized.
pub fn persist(window: &Window) {
    let maximized = window.is_maximized().unwrap_or(false);
    let mut state = load().unwrap_or(WindowState {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        maximized: false,
    });
    state.maximized = maximized;
    if !maximized {
        if let Ok(pos) = window.outer_position() {
            state.x = pos.x;
            state.y = pos.y;
        }
        if let Ok(size) = window.outer_size() {
            state.width = size.width;
            state.height = size.height;
        }
    }
    save(&state);
}
