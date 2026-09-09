use crate::errors::CommandError;
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Marks that `harden_directory_acl` has already run for this directory —
/// see `get_app_data_root`.
///
/// `cfg(not(test))`：单测走 `test_app_data_root()`，那条路径不加固 ACL
/// （目标是临时目录，而 icacls 是个真实副作用）。
#[cfg(not(test))]
const ACL_MARKER_FILE: &str = ".access-control";

/// `CREATE_NO_WINDOW` — same reasoning as `daemon::install`: spawning a
/// console-subsystem binary from our GUI-subsystem process would otherwise
/// flash a console window on screen for as long as it runs.
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// `FILE_ATTRIBUTE_REPARSE_POINT` — set on both symlinks and directory
/// junctions.
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

/// Whether `path` is itself a symlink or junction, without following it.
fn is_reparse_point(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|m| m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
        .unwrap_or(false)
}

/// Lock `dir`'s ACL down to the current user, `SYSTEM`, and
/// `Administrators` only, replacing whatever it inherited from its parent
/// (typically already user-only under `%LOCALAPPDATA%`, just not as
/// explicitly locked down as this). Mirrors the official desktop client's
/// `userDataSecurity.ts`, which does the same for the same reason: this is
/// where subscription content (which can carry proxy credentials), logs,
/// and crash reports live, so it shouldn't be left any more exposed than
/// necessary to whatever else might be running under the same OS install.
///
/// Shells out to `icacls` rather than calling the Win32 security APIs
/// directly — same tradeoff `daemon::install` makes for elevation:
/// less code, and boxdd/Windows itself already knows how to do this
/// correctly.
#[cfg(not(test))]
fn harden_directory_acl(dir: &Path) -> Result<(), CommandError> {
    set_directory_acl(dir, "(OI)(CI)F")
}

/// `harden_directory_acl` 的通用版：当前用户拿到 `user_rights`，SYSTEM 与
/// Administrators 永远是完全控制。
fn set_directory_acl(dir: &Path, user_rights: &str) -> Result<(), CommandError> {
    let username = std::env::var("USERNAME").unwrap_or_default();
    if username.is_empty() {
        // Can't determine the current account to grant access to — skip
        // hardening rather than lock the current user out of their own
        // data directory.
        return Ok(());
    }
    let account = match std::env::var("USERDOMAIN") {
        Ok(domain) if !domain.is_empty() => format!("{domain}\\{username}"),
        _ => username,
    };

    // 绝对路径，不走 PATH 查找（审计项 L-14）—— 这个进程可能是从任意工作目录
    // 启动的，而 `icacls` 这一步是**放宽/收紧 ACL** 本身，被顶替掉的后果比
    // 其他外部调用都大。
    let output = Command::new(crate::daemon::install::system32("icacls.exe"))
        .arg(dir)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(format!("{account}:{user_rights}"))
        // SYSTEM — needed for the sing-box-daemon Windows service (which
        // runs as SYSTEM) and any OS-level maintenance.
        .arg("SYSTEM:(OI)(CI)F")
        // Well-known SID for BUILTIN\Administrators, rather than the
        // localized name (which isn't literally "Administrators" on every
        // Windows language edition).
        .arg("*S-1-5-32-544:(OI)(CI)F")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| CommandError::io("run icacls on app data directory", e))?;

    if !output.status.success() {
        return Err(CommandError::invalid_state(
            "set_directory_acl",
            format!(
                "icacls exited with {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        ));
    }
    Ok(())
}

pub fn get_exe_dir() -> Result<PathBuf, CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::resource_not_found("executable path", e))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::resource_not_found("executable directory", "parent path missing")
    })?;
    Ok(exe_dir.to_path_buf())
}

/// Root of fresh-box's own mutable state (subscriptions, settings, logs).
///
/// Deliberately NOT under the exe's own directory: since the app installs
/// per-machine into `C:\Program Files\fresh-box` (required so boxdd's
/// install-directory ACL check in `security_windows.go` accepts it — see
/// `daemon::install`), that directory is admin-protected and the app runs
/// unelevated, so it can't write there. `%LOCALAPPDATA%` is always
/// writable by the current user and is the standard place for a Windows
/// app's own per-user data.
/// 单测里的应用数据目录 —— 临时目录，整个测试二进制共用一个。
///
/// 没有这个的话，凡是碰到 `profiles_dir()` 的测试（档案内容、配置合成）都会
/// 写进用户真实的 `%LOCALAPPDATA%resh-box`，还会顺带触发一次 icacls。
/// 这是唯一一处 `#[cfg(test)]` 的行为差异，就为了让下面那些函数可测。
#[cfg(test)]
fn test_app_data_root() -> PathBuf {
    static OVERRIDE: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    OVERRIDE
        .get_or_init(|| {
            let dir = std::env::temp_dir().join(format!("fresh-box-tests-{}", std::process::id()));
            fs::create_dir_all(&dir).expect("create the test app data directory");
            dir
        })
        .clone()
}

pub fn get_app_data_root() -> Result<PathBuf, CommandError> {
    #[cfg(test)]
    return Ok(test_app_data_root());

    #[cfg(not(test))]
    {
        get_app_data_root_inner()
    }
}

#[cfg(not(test))]
fn get_app_data_root_inner() -> Result<PathBuf, CommandError> {
    let local_app_data = std::env::var_os("LOCALAPPDATA").ok_or_else(|| {
        CommandError::resource_not_found("LOCALAPPDATA", "environment variable is not set")
    })?;
    let dir = PathBuf::from(local_app_data).join("fresh-box");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("app data directory", e))?;
    }

    // Refuse to treat a symlink/junction as our data directory — silently
    // following one could mean reading/writing files fresh-box doesn't
    // actually control and never put there itself (a directory-hijack
    // attack), the same class of thing `userDataSecurity.ts` guards
    // against in the official client. Checked on every call, not just at
    // creation, since the directory could be swapped out for one after the
    // fact.
    if is_reparse_point(&dir) {
        return Err(CommandError::invalid_state(
            "app data directory",
            format!(
                "{} is a symlink or junction, not a real directory — refusing to use it as \
                 fresh-box's data directory",
                dir.display()
            ),
        ));
    }

    let marker = dir.join(ACL_MARKER_FILE);
    if !marker.exists() {
        // First time we've seen this directory — either just created above,
        // or left over from before this hardening existed. Best-effort: a
        // failure here shouldn't block the app from working, just leave
        // the directory at whatever ACL it already had.
        if let Err(e) = harden_directory_acl(&dir) {
            tracing::warn!(error = ?e, "failed to harden app data directory permissions");
        }
        let _ = fs::write(&marker, b"");
    }

    Ok(dir)
}

pub fn get_log_dir() -> Result<PathBuf, CommandError> {
    let dir = get_app_data_root()?.join("log");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("log directory", e))?;
    }
    Ok(dir)
}

/// 提权动作的输出目录 —— **当前用户只有读权限，写入只有管理员和 SYSTEM**。
///
/// 这不是洁癖（审计项 L-15）。日志是被提权到管理员的 PowerShell 用 `*>` 写出
/// 来的，而路径是我们这个**未提权**进程挑的。路径若落在同用户可写的目录里
/// （原先是 `%TEMP%`），另一个同用户进程可以抢在写入前把它做成指向别处的
/// 符号链接 —— 那次管理员写入就落到了它选的位置。这是一条完整的
/// 用户 → 管理员 提权链，而且和文件名猜不猜得中无关：攻击者只要盯着目录等
/// 文件出现之前那一瞬。把目录收成用户不可写，就没有抢跑的余地。
///
/// 代价是我们（未提权）删不掉自己读完的日志，所以清理交给下一次提权动作
/// 本身 —— 见 `daemon::install::run_elevated`。
pub fn get_elevated_log_dir() -> Result<PathBuf, CommandError> {
    let dir = get_app_data_root()?.join("elevated");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("elevated log directory", e))?;
    }
    if is_reparse_point(&dir) {
        return Err(CommandError::invalid_state(
            "elevated log directory",
            format!("{} is a symlink or junction", dir.display()),
        ));
    }

    // 标记文件放在**父目录**（那里我们写得进去）—— 目录本身收紧之后，我们
    // 就没法在里面留任何东西了。
    let marker = get_app_data_root()?.join(".elevated-access-control");
    if !marker.exists() {
        // 这里和 `get_app_data_root` 的 best-effort 不同：ACL 上不去就等于
        // 上面那条提权链还开着，所以直接失败，由调用方决定退回「不写日志」。
        set_directory_acl(&dir, "(OI)(CI)RX")?;
        let _ = fs::write(&marker, b"");
    }
    Ok(dir)
}
