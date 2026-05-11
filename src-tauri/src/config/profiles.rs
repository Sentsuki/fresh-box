use crate::errors::CommandError;
use serde_json::Value;
use std::fs;

const SUBSCRIPTIONS_FILE: &str = "subscriptions.json";
pub(crate) const FILE_ORDER_KEY: &str = "_file_order";

fn get_subscriptions_path() -> Result<std::path::PathBuf, CommandError> {
    Ok(super::paths::get_config_dir()?.join(SUBSCRIPTIONS_FILE))
}

pub(crate) fn load_subscriptions_json() -> Result<serde_json::Map<String, Value>, CommandError> {
    let path = get_subscriptions_path()?;
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| CommandError::io("failed to read subscriptions file", e))?;
    let value: Value =
        serde_json::from_str(&content).unwrap_or(Value::Object(serde_json::Map::new()));
    Ok(value.as_object().cloned().unwrap_or_default())
}

pub(crate) fn save_subscriptions_json(
    map: &serde_json::Map<String, Value>,
) -> Result<(), CommandError> {
    let path = get_subscriptions_path()?;
    super::io::write_json_file(&path, map)
}

pub(crate) fn load_file_order() -> Result<Vec<String>, CommandError> {
    let map = load_subscriptions_json()?;
    Ok(map
        .get(FILE_ORDER_KEY)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default())
}

pub(crate) fn save_file_order(order: &[String]) -> Result<(), CommandError> {
    let mut map = load_subscriptions_json()?;
    map.insert(
        FILE_ORDER_KEY.to_string(),
        Value::Array(order.iter().map(|s| Value::String(s.clone())).collect()),
    );
    save_subscriptions_json(&map)
}

pub(crate) fn append_to_file_order(stem: &str) -> Result<(), CommandError> {
    let mut order = load_file_order()?;
    if !order.iter().any(|s| s == stem) {
        order.push(stem.to_string());
        save_file_order(&order)?;
    }
    Ok(())
}

pub(crate) fn rename_in_file_order(old_stem: &str, new_stem: &str) -> Result<(), CommandError> {
    let mut order = load_file_order()?;
    for entry in order.iter_mut() {
        if entry == old_stem {
            *entry = new_stem.to_string();
            break;
        }
    }
    save_file_order(&order)
}

pub(crate) fn remove_from_file_order(stem: &str) -> Result<(), CommandError> {
    let mut order = load_file_order()?;
    order.retain(|s| s != stem);
    save_file_order(&order)
}

pub(crate) fn stem_from_filename(file_name: &str) -> &str {
    file_name.strip_suffix(".json").unwrap_or(file_name)
}
