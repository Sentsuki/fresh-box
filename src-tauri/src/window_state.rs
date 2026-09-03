// window_state.rs — persist and restore the main window's position, size,
// and maximized state across launches. Previously nothing did this: every
// launch opened at `tauri.conf.json`'s fixed, centered default regardless
// of how the window was last left. Mirrors the official Electron client's
// `windowState.ts` + `index.ts`'s `registerMainWindowStatePersistence`.

use serde::{Deserialize, Serialize};
use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow, Window};

use crate::config;

const WINDOW_STATE_FILE: &str = "window_state.json";

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

/// Whether `(x, y)` — the window's saved top-left corner — falls within any
/// currently-connected monitor. A position saved from a monitor that's
/// since been unplugged or rearranged would otherwise place the window
/// somewhere the user can no longer reach it.
fn position_is_visible(window: &WebviewWindow, x: i32, y: i32) -> bool {
    window
        .available_monitors()
        .map(|monitors| {
            monitors.iter().any(|monitor| {
                let pos = monitor.position();
                let size = monitor.size();
                x >= pos.x
                    && x < pos.x + size.width as i32
                    && y >= pos.y
                    && y < pos.y + size.height as i32
            })
        })
        .unwrap_or(false)
}

/// Apply the saved state, if there is one and it's still valid. Call once
/// from `setup()`, before the window is first shown — the window is
/// created hidden (`"visible": false` in `tauri.conf.json`) specifically so
/// this can't be seen jumping from the default position to the restored
/// one.
pub fn restore(window: &WebviewWindow) {
    let Some(state) = load() else { return };

    if state.width > 0 && state.height > 0 {
        let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    }
    if position_is_visible(window, state.x, state.y) {
        let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
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
