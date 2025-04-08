// config.rs - 管理配置文件

use crate::errors::CommandError;

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
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Some(path_str) = path.to_str() {
                config_files.push(path_str.to_string());
            }
        }
    }
    Ok(config_files)
}