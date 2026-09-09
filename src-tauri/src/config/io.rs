// 只剩原子写：其余的 JSON 读写辅助随 `app_settings.json` / `profile_index.json`
// 等文件一起作废了（阶段 4 换成 SQLite）。配置内容文件仍然走这里 —— 崩溃或
// 断电时读者只会看到完整的旧内容或完整的新内容，不会看到半截。

use crate::errors::CommandError;
use std::fs;
use std::path::Path;

/// 原子写：先在同目录写临时文件，再 rename 覆盖目标。
///
/// 同一文件系统内的 rename 是单个原子操作 —— 读者（以及崩溃 / 断电）只会看到
/// 完整的旧内容或完整的新内容，不会看到写了一半的文件。对齐官方客户端的
/// `atomicWriteFile`（`src/main/profiles.ts`），它每一次档案写入也都走这里。
pub fn atomic_write(path: &Path, content: &[u8]) -> Result<(), CommandError> {
    let dir = path.parent().ok_or_else(|| {
        CommandError::invalid_state(
            "atomic_write",
            format!("{} has no parent directory", path.display()),
        )
    })?;
    let file_name = path.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
        CommandError::invalid_state(
            "atomic_write",
            format!("{} has no valid file name", path.display()),
        )
    })?;

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let tmp_path = dir.join(format!(".{file_name}.{}-{nanos}.tmp", std::process::id()));

    if let Err(error) = fs::write(&tmp_path, content) {
        let _ = fs::remove_file(&tmp_path);
        return Err(CommandError::io(
            format!("failed to write temp file for {}", path.display()),
            error,
        ));
    }

    if let Err(error) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(CommandError::io(
            format!("failed to finalize write to {}", path.display()),
            error,
        ));
    }

    Ok(())
}
