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

/// Write a transactionally-consistent copy of the live database to `dest_path`.
///
/// The copy is produced by SQLite itself (`VACUUM INTO`), so it is valid even
/// if a write was in flight — a plain file copy can capture a torn page set
/// and miss the `-wal` sidecar. The copy goes to `<dest>.partial` first and is
/// renamed into place only on success, so a killed process never leaves a file
/// that looks like a backup. An existing `dest_path` is never overwritten.
#[tauri::command]
pub async fn create_backup(app: AppHandle, dest_path: String) -> Result<BackupFileInfo, String> {
    use sqlx::sqlite::SqliteConnectOptions;
    use std::str::FromStr;

    let dest = std::path::PathBuf::from(&dest_path);
    if dest.extension().is_none_or(|ext| ext != "db") {
        return Err(format!(
            "Refusing to write a backup to {dest_path}: not a .db path"
        ));
    }
    if dest.exists() {
        return Err(format!("Refusing to overwrite existing backup {dest_path}"));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    let live = std::path::PathBuf::from(backup_live_db_path(app)?);
    if !live.exists() {
        return Err(format!(
            "Live database not found at {} — nothing to back up",
            live.display()
        ));
    }
    let partial = dest.with_extension("db.partial");
    let _ = std::fs::remove_file(&partial);

    let options =
        SqliteConnectOptions::from_str(&format!("sqlite:{}?mode=rw", live.display()))
            .map_err(|error| format!("Could not open the live database: {error}"))?
            .busy_timeout(std::time::Duration::from_secs(10));
    let pool = sqlx::SqlitePool::connect_with(options)
        .await
        .map_err(|error| format!("Could not open the live database: {error}"))?;
    let target = partial.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{target}'"))
        .execute(&pool)
        .await
        .map_err(|error| format!("Consistent copy failed (nothing was written): {error}"))?;
    pool.close().await;

    std::fs::rename(&partial, &dest)
        .map_err(|error| format!("Could not publish {dest_path}: {error}"))?;
    file_info(&dest)
}

/// Every `cmis-*.db` in `dir`, newest first. `.partial` files, a hand-copied
/// `cmis.db`, and anything not ending in `.db` are never listed.
#[tauri::command]
pub fn list_backups(dir: String) -> Result<Vec<BackupFileInfo>, String> {
    let dir = std::path::PathBuf::from(&dir);
    let entries =
        std::fs::read_dir(&dir).map_err(|error| format!("Could not read {}: {error}", dir.display()))?;
    let mut files = Vec::new();
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Could not read {}: {error}", dir.display()))?;
        let path = entry.path();
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if !name.starts_with("cmis-") || !name.ends_with(".db") {
            continue;
        }
        if backup_kind(&name) == "other" {
            continue;
        }
        files.push(file_info(&path)?);
    }
    files.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(files)
}

/// Delete `cmis-auto-*.db` files beyond the newest `keep`, then sweep stray
/// `.partial` files. Only the app's own auto pattern is ever eligible;
/// `cmis-manual-*.db` and foreign files are structurally invisible here.
/// Best-effort: an undeletable file is skipped, never fatal. Returns the
/// removed file names.
#[tauri::command]
pub fn prune_backups(dir: String, keep: u32) -> Result<Vec<String>, String> {
    let dir = std::path::PathBuf::from(&dir);
    let entries =
        std::fs::read_dir(&dir).map_err(|error| format!("Could not read {}: {error}", dir.display()))?;
    let mut auto: Vec<String> = Vec::new();
    let mut partials: Vec<std::path::PathBuf> = Vec::new();
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Could not read {}: {error}", dir.display()))?;
        let path = entry.path();
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.ends_with(".partial") {
            partials.push(path);
        } else if backup_kind(&name) == "auto" {
            auto.push(name);
        }
    }
    auto.sort();
    auto.reverse();
    let keep = keep.max(1) as usize;
    let mut removed = Vec::new();
    for name in auto.into_iter().skip(keep) {
        let path = dir.join(&name);
        match std::fs::remove_file(&path) {
            Ok(()) => removed.push(name),
            Err(error) => log::warn!("Could not prune backup {name}: {error}"),
        }
    }
    for path in partials {
        if let Err(error) = std::fs::remove_file(&path) {
            log::warn!("Could not sweep {}: {error}", path.display());
        }
    }
    Ok(removed)
}
