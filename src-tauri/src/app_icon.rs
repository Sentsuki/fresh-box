// app_icon.rs - 窗口与托盘图标
//
// ─── 为什么不直接用 Tauri 给的图标 ──────────────────────────────────
//
// Tauri 的 `default_window_icon` 是 tauri-codegen 在编译期把 icon.ico 的
// **第一帧**（32×32）解成 RGBA 编进二进制的，窗口和托盘默认都只拿到这一张。
// tao 把它同时设成窗口的大、小图标；托盘也用它。而任务管理器子项、标题栏、
// 托盘要的是 16/20/24px，系统拿 32×32 现场硬缩，出来就是锯齿。
//
// exe 资源里其实有完整的图标：tauri-build 把整份 icon.ico 以
// IDI_APPLICATION（32512）嵌了进去，资源管理器、开始菜单、任务管理器的进程
// 组那一行用的都是它。这里让窗口和托盘也从这份资源按「当前 DPI 下的系统尺寸」
// 取图标，`LoadImageW` 会挑最合适的那一帧 —— 只要 icon.ico 里各尺寸齐全
// （见 scripts/gen-ico.py），就不会再缩放。
//
// 于是图标的唯一来源是 src-tauri/icons/icon.ico，exe、开始菜单快捷方式、
// 安装包、窗口、托盘全都从它出。
//
// 非 Windows 平台上这两个函数什么都不做，沿用 Tauri 默认的图标。

use tauri::{Runtime, Window, tray::TrayIcon};

/// 按窗口当前所在显示器的 DPI 设置窗口的大、小图标。
///
/// 窗口创建时调一次；窗口被拖到另一个缩放比例的显示器上时
/// （`WindowEvent::ScaleFactorChanged`）再调一次。
pub fn apply_to_window<R: Runtime>(window: &Window<R>) {
    #[cfg(target_os = "windows")]
    win::apply_to_window(window);
    #[cfg(not(target_os = "windows"))]
    let _ = window;
}

/// 把托盘图标换成 exe 资源里系统小图标尺寸的那一帧。托盘建好后调一次。
pub fn apply_to_tray<R: Runtime>(tray: &TrayIcon<R>) {
    #[cfg(target_os = "windows")]
    win::apply_to_tray(tray);
    #[cfg(not(target_os = "windows"))]
    let _ = tray;
}

#[cfg(target_os = "windows")]
mod win {
    use std::sync::Mutex;

    use tauri::{Runtime, Window, tray::TrayIcon};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::HiDpi::{GetDpiForSystem, GetDpiForWindow, GetSystemMetricsForDpi};
    use windows::Win32::UI::WindowsAndMessaging::{
        ICON_BIG, ICON_SMALL, IMAGE_ICON, LR_DEFAULTCOLOR, LoadImageW, SM_CXICON, SM_CXSMICON,
        SendMessageW, WM_SETICON,
    };
    use windows::core::PCWSTR;

    /// tauri-build 嵌入 icon.ico 时用的资源 ID（IDI_APPLICATION）。
    const ICON_RESOURCE_ID: u16 = 32512;

    /// 按像素尺寸缓存已加载的 HICON（裸指针不是 Send，以 isize 存）。
    ///
    /// 窗口在 destroy 模式下会反复销毁重建，`WM_SETICON` 又不接管图标的所有权，
    /// 每次现加载就得自己找时机 `DestroyIcon`。尺寸只有屈指可数的几种
    /// （每个 DPI 一大一小），常驻缓存更简单，也不会泄漏。
    static CACHE: Mutex<Vec<(i32, isize)>> = Mutex::new(Vec::new());

    fn load(size: i32) -> Option<isize> {
        let mut cache = CACHE.lock().ok()?;
        if let Some(&(_, icon)) = cache.iter().find(|(s, _)| *s == size) {
            return Some(icon);
        }
        let icon = unsafe {
            let module = GetModuleHandleW(None).ok()?;
            LoadImageW(
                Some(HINSTANCE(module.0)),
                PCWSTR(ICON_RESOURCE_ID as usize as *const u16),
                IMAGE_ICON,
                size,
                size,
                LR_DEFAULTCOLOR,
            )
        };
        match icon {
            Ok(handle) => {
                let icon = handle.0 as isize;
                cache.push((size, icon));
                Some(icon)
            }
            Err(e) => {
                tracing::warn!(size, error = %e, "failed to load icon resource");
                None
            }
        }
    }

    pub fn apply_to_window<R: Runtime>(window: &Window<R>) {
        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let hwnd = HWND(hwnd.0);
        let dpi = unsafe { GetDpiForWindow(hwnd) };

        for (kind, metric) in [(ICON_SMALL, SM_CXSMICON), (ICON_BIG, SM_CXICON)] {
            let size = unsafe { GetSystemMetricsForDpi(metric, dpi) };
            if let Some(icon) = load(size) {
                unsafe {
                    SendMessageW(
                        hwnd,
                        WM_SETICON,
                        Some(WPARAM(kind as usize)),
                        Some(LPARAM(icon)),
                    );
                }
            }
        }
    }

    pub fn apply_to_tray<R: Runtime>(tray: &TrayIcon<R>) {
        // 通知区域按系统 DPI 绘制（`LoadIconMetric(LIM_SMALL)` 的同款算法），
        // 不跟某个显示器走。
        let size = unsafe { GetSystemMetricsForDpi(SM_CXSMICON, GetDpiForSystem()) } as u32;

        // tray-icon 自己从资源加载并持有这个 HICON，不走上面的缓存。
        let result = tray.with_inner_tray_icon(move |inner| {
            let icon = tray_icon::Icon::from_resource(ICON_RESOURCE_ID, Some((size, size)))
                .map_err(|e| e.to_string())?;
            inner.set_icon(Some(icon)).map_err(|e| e.to_string())
        });
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => tracing::warn!(size, error = %e, "failed to set tray icon"),
            Err(e) => tracing::warn!(size, error = %e, "failed to reach tray icon"),
        }
    }
}
