//! Database backup file commands (backup-restore spec, Phase 1).
//!
//! All filesystem and database-path work lives here: the frontend decides
//! policy (once a day, which names, how many to keep) and these commands
//! execute it. No command here ever writes to the live database.

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// One file in `<Documents>/CMIS Backups`, as the Backup tab lists it.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mtime: u64,
    pub kind: String,
}

/// `"auto"` for `cmis-auto-*.db`, `"manual"` for `cmis-manual-*.db`,
/// otherwise `"other"` (never pruned, never adopted).
pub fn backup_kind(name: &str) -> &'static str {
    if name.starts_with("cmis-auto-") && name.ends_with(".db") {
        "auto"
    } else if name.starts_with("cmis-manual-") && name.ends_with(".db") {
        "manual"
    } else {
        "other"
    }
}

fn file_info(path: &std::path::Path) -> Result<BackupFileInfo, String> {
    let meta = std::fs::metadata(path)
        .map_err(|error| format!("Could not stat {}: {error}", path.display()))?;
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| format!("Could not name {}", path.display()))?;
    let mtime = meta
        .modified()
        .map_err(|error| format!("Could not read mtime of {}: {error}", path.display()))?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    Ok(BackupFileInfo {
        kind: backup_kind(&name).to_string(),
        name,
        path: path.to_string_lossy().to_string(),
        size: meta.len(),
        mtime,
    })
}

/// Resolve and create `<Documents>/CMIS Backups`.
#[tauri::command]
pub fn backup_default_dir(app: AppHandle) -> Result<String, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("Could not resolve the Documents folder: {error}"))?;
    let dir = documents.join("CMIS Backups");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    Ok(dir.to_string_lossy().to_string())
}

/// Resolve `<app_data>/cmis.db` — the live database every copy is made from.
#[tauri::command]
pub fn backup_live_db_path(app: AppHandle) -> Result<String, String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the app data folder: {error}"))?;
    Ok(data.join("cmis.db").to_string_lossy().to_string())
}
