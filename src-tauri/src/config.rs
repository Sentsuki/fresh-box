// config.rs - 管理配置文件

use crate::errors::CommandError;
use std::process::Command;

// 获取 bin 目录路径的公共函数
pub fn get_bin_dir() -> Result<std::path::PathBuf, CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to get executable path: {}", e)))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::ResourceNotFound("Failed to get executable directory".to_string())
    })?;
    
    Ok(exe_dir.join("bin"))
}

#[tauri::command]
pub async fn open_app_directory() -> Result<(), CommandError> {
    let exe_path = std::env::current_exe()
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to get executable path: {}", e)))?;
    let exe_dir = exe_path.parent().ok_or_else(|| {
        CommandError::ResourceNotFound("Failed to get executable directory".to_string())
    })?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(exe_dir)
            .spawn()
            .map_err(|e| CommandError::ResourceNotFound(format!("Failed to open directory: {}", e)))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(exe_dir)
            .spawn()
            .map_err(|e| CommandError::ResourceNotFound(format!("Failed to open directory: {}", e)))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(exe_dir)
            .spawn()
            .map_err(|e| CommandError::ResourceNotFound(format!("Failed to open directory: {}", e)))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn save_subscription_config(
    file_name: String,
    content: String
) -> Result<String, CommandError> {
    let bin_dir = get_bin_dir()?;
    let target_path = bin_dir.join(&file_name);

    std::fs::write(&target_path, content)
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to write config file: {}", e)))?;

    Ok(target_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn copy_config_to_bin(config_path: String) -> Result<String, CommandError> {
    let bin_dir = get_bin_dir()?;
    let source_config_path = std::path::Path::new(&config_path);

    if !source_config_path.exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "Source config file not found at: {}",
            config_path
        )));
    }

    let config_file = source_config_path
        .file_name()
        .ok_or_else(|| CommandError::ResourceNotFound("Invalid config file path".to_string()))?;
    let target_config_path = bin_dir.join(config_file);

    // 如果文件已存在且内容相同，则无需复制
    if target_config_path.exists() {
        let source_content = std::fs::read(&config_path)
            .map_err(|e| CommandError::ResourceNotFound(format!("Failed to read source file: {}", e)))?;
        let target_content = std::fs::read(&target_config_path)
            .map_err(|e| CommandError::ResourceNotFound(format!("Failed to read target file: {}", e)))?;
        if source_content == target_content {
            return Ok(target_config_path.to_string_lossy().into_owned());
        }
    }

    std::fs::copy(&config_path, &target_config_path)
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to copy config file: {}", e)))?;
    
    Ok(target_config_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn list_configs(_app_handle: tauri::AppHandle) -> Result<Vec<String>, CommandError> {
    let bin_dir = get_bin_dir()?;

    let mut config_files = Vec::new();
    for entry in std::fs::read_dir(bin_dir)
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to read bin directory: {}", e)))?
    {
        let entry = entry.map_err(|e| CommandError::ResourceNotFound(format!("Failed to read entry: {}", e)))?;
        let path = entry.path();
        let file_name = path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
            
        // 过滤掉临时文件和覆盖配置文件
        if path.extension().and_then(|s| s.to_str()) == Some("json") 
            && file_name != "temp_config.json" 
            && file_name != "config_override.json" 
            && file_name != "singbox.log" {
            config_files.push(path.to_string_lossy().into_owned());
        }
    }
    Ok(config_files)
}

#[tauri::command]
pub async fn delete_config(config_path: String) -> Result<(), CommandError> {
    let rm_dir = get_bin_dir()?;
    let rm_full_path = rm_dir.join(&config_path);
    
    if !rm_full_path.exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "Config file not found at: {}",
            rm_full_path.to_string_lossy()
        )));
    }
    
    std::fs::remove_file(rm_full_path)
        .map_err(|e| CommandError::ResourceNotFound(format!("Failed to delete config file: {}", e)))?;
    
    Ok(())
}

#[tauri::command]
pub async fn rename_config(
    old_path: String,
    new_path: String
) -> Result<(), CommandError> {
    let bin_dir = get_bin_dir()?;
    
    // 构建完整的旧文件和新文件路径
    let old_full_path = bin_dir.join(&old_path);
    let new_full_path = bin_dir.join(&new_path);

    // 检查旧文件是否存在
    if !old_full_path.exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "Source config file not found at: {}",
            old_full_path.display()
        )));
    }

    // 检查新文件名是否已经存在
    if new_full_path.exists() {
        return Err(CommandError::ResourceNotFound(format!(
            "A config file already exists at: {}",
            new_full_path.display()
        )));
    }

    // 检查文件扩展名是否为 .json
    if new_full_path.extension().and_then(|s| s.to_str()) != Some("json") {
        return Err(CommandError::ResourceNotFound(
            "New filename must have .json extension".to_string()
        ));
    }

    // 执行重命名操作
    std::fs::rename(&old_full_path, &new_full_path)
        .map_err(|e| CommandError::ResourceNotFound(format!(
            "Failed to rename config file: {}", 
            e
        )))?;

    Ok(())
}