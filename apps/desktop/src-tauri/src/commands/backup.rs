//! Database backup file commands (backup-restore spec, Phases 1 + 2).
//!
//! All filesystem and database-path work lives here: the frontend decides
//! policy (once a day, which names, how many to keep) and these commands
//! execute it. No command here ever writes to the live database — except
//! `apply_restore`, which is the one deliberate whole-file swap, performed
//! only after the frontend verified the source with `inspect_backup`.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::DEV_IDENTIFIER;

/// Folder name under `<Documents>` holding the backup files.
///
/// Production uses the spec'd `CMIS Backups`. The dev build gets its own folder
/// because this path is keyed by *document* directory, not by bundle
/// identifier — so a dev launch would otherwise write `cmis-auto-<today>.db`
/// into the clinic's real backup folder and then prune that folder down to the
/// dev store's retention count, deleting genuine backups of real data.
fn backup_dir_name(identifier: &str) -> &'static str {
    if identifier == DEV_IDENTIFIER {
        "CMIS Backups (dev)"
    } else {
        "CMIS Backups"
    }
}

/// `<Documents>/CMIS Backups` (or its dev sibling) for this build.
fn backup_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("Could not resolve the Documents folder: {error}"))?;
    Ok(documents.join(backup_dir_name(&app.config().identifier)))
}

/// Newest migration registered in `lib.rs::db_migrations`. A backup whose
/// recorded schema version is greater than this is refused (spec D10/F10).
pub const CURRENT_SCHEMA_VERSION: i64 = 13;

/// Tables a file must contain before it is treated as a CMIS database.
/// `inventory_items` + `requests` are the load-bearing pair; the rest of B6
/// (batches, dispensing, audit, categories, app_meta) rides along in any real
/// copy, but a file missing even these two is a random `.db`, not a backup.
const EXPECTED_TABLES: &[&str] = &["inventory_items", "requests"];

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

/// Scratch file the copy is built in, unique to this attempt.
///
/// The staging name must never be deterministic. `CMIS Backups` is a folder two
/// clinic machines can share — over a network path, or because `Documents` is a
/// synced folder — and both devices back up on the same calendar day under the
/// same `cmis-auto-<date>.db` name. With a fixed staging name (`.db.partial`),
/// one device's `VACUUM INTO` opens the file the other device is still writing
/// and SQLite aborts with `table _sqlx_migrations already exists`, which reaches
/// the operator as "backup failed — this device is unprotected". The published
/// name stays per-day; only the scratch file is per-attempt. It keeps the
/// `.partial` suffix so `sweep_partial_files` still recognises a leftover.
fn staging_path(dest: &std::path::Path) -> Result<std::path::PathBuf, String> {
    use std::sync::atomic::{AtomicU64, Ordering};

    /// Distinguishes two attempts started in the same clock tick — the clock
    /// alone is not a guarantee (Windows file times can be coarse).
    static ATTEMPT: AtomicU64 = AtomicU64::new(0);

    let name = dest
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| {
            format!(
                "Refusing to write a backup to {}: no file name",
                dest.display()
            )
        })?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    let attempt = ATTEMPT.fetch_add(1, Ordering::Relaxed);
    Ok(dest.with_file_name(format!(
        "{name}.{}-{stamp}-{attempt}.partial",
        std::process::id()
    )))
}

/// Delete a scratch copy and any journal SQLite left beside it. Best-effort:
/// this only ever removes a file the current attempt created.
fn discard_staging(staging: &std::path::Path) {
    let _ = std::fs::remove_file(staging);
    for suffix in ["-journal", "-wal", "-shm"] {
        let mut sidecar = staging.as_os_str().to_os_string();
        sidecar.push(suffix);
        let _ = std::fs::remove_file(std::path::PathBuf::from(sidecar));
    }
}

/// Operator-facing hint for the copy failures that come from the folder rather
/// than from the database: a scratch file another program — or the other device,
/// through a synced or network folder — is holding or left behind mid-write.
/// Anything else is reported exactly as SQLite worded it.
/// Verify a finished scratch copy the way a restore would, before it is given
/// the backup name — the "0" in 3-2-1-1-0: zero errors, confirmed, not assumed.
/// A copy that cannot be restored must never be published, because the next
/// launch adopts whatever holds today's name and would then report protection
/// over an unusable file.
async fn verify_copy(staging: &std::path::Path) -> Result<(), String> {
    match inspect_file(staging).await {
        Ok(verdict) if verdict.ok => Ok(()),
        Ok(verdict) => Err(format!(
            "Backup not written — the finished copy did not verify ({}): {}",
            verdict.code, verdict.reason
        )),
        Err(error) => Err(format!(
            "Backup not written — the finished copy could not be verified: {error}"
        )),
    }
}

fn copy_failure_hint(message: &str) -> &'static str {
    let lower = message.to_lowercase();
    if lower.contains("already exists") {
        " — another program or the other device is using this backup folder; close it and retry, or back up to a different folder"
    } else if lower.contains("unable to open database file") {
        " — the backup folder could not be written to; another program or the other device may be using it"
    } else {
        ""
    }
}

/// Verdict of `inspect_backup`: read-only, before anything is touched.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupInspection {
    pub ok: bool,
    /// Machine code the frontend maps to an operator message: `ok`,
    /// `not-database`, `damaged`, `not-cmis`, `newer-version`.
    pub code: String,
    /// Human sentence naming the failed check (empty when `ok`).
    pub reason: String,
    pub schema_version: Option<i64>,
    pub app_version: Option<String>,
    pub size: u64,
    pub mtime: u64,
    pub name: String,
}

/// The pending-restore record `apply_restore` leaves behind and the frontend
/// consumes on the next launch to write the surviving audit entry (F10.6).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RestoreJournal {
    pub source_file: String,
    pub source_name: String,
    pub operator: String,
    pub app_version: String,
    pub at: String,
}

fn journal_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the app data folder: {error}"))?;
    Ok(data.join("cmis-restore-journal.json"))
}

/// Remove stray `<name>.partial` files in `dir`. A killed copy is
/// unremarkable (spec Q6): swept silently, never listed or counted.
pub fn sweep_partial_files(dir: &std::path::Path) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.ends_with(".partial") {
            if let Err(error) = std::fs::remove_file(&path) {
                log::warn!("Could not sweep {}: {error}", path.display());
            }
        }
    }
}

/// Sweep stray `.partial` files in `<Documents>/CMIS Backups` (spec §9).
/// Best-effort with logged warnings — never fails the launch.
pub fn sweep_backup_partials(app: &AppHandle) {
    if let Ok(dir) = backup_dir(app) {
        sweep_partial_files(&dir);
    }
}

/// Resolve and create `<Documents>/CMIS Backups`.
#[tauri::command]
pub fn backup_default_dir(app: AppHandle) -> Result<String, String> {
    let dir = backup_dir(&app)?;
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
/// and miss the `-wal` sidecar. The copy goes to a per-attempt `.partial` file
/// first (see `staging_path`) and is renamed into place only on success, so a
/// killed process never leaves a file that looks like a backup. It is verified
/// with the same check a restore runs (`inspect_file`) *before* it is renamed:
/// a file the app would refuse to restore never gets a backup name. An existing
/// `dest_path` is never overwritten; if one appears while the copy is being
/// built — another device publishing today's file into a shared folder — it is
/// adopted instead, but only if it verifies.
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
    let staging = staging_path(&dest)?;
    discard_staging(&staging);

    let options =
        SqliteConnectOptions::from_str(&format!("sqlite:{}?mode=rw", live.display()))
            .map_err(|error| format!("Could not open the live database: {error}"))?
            .busy_timeout(std::time::Duration::from_secs(10));
    let pool = sqlx::SqlitePool::connect_with(options)
        .await
        .map_err(|error| format!("Could not open the live database: {error}"))?;
    let target = staging.to_string_lossy().replace('\'', "''");
    let copy = sqlx::query(&format!("VACUUM INTO '{target}'"))
        .execute(&pool)
        .await;
    pool.close().await;
    if let Err(error) = copy {
        // Never leave the failed attempt's scratch file behind: it holds a
        // half-written database in the operator's backup folder.
        discard_staging(&staging);
        return Err(format!(
            "Consistent copy failed (nothing was written): {error}{}",
            copy_failure_hint(&error.to_string())
        ));
    }

    // Verify the staging file, not the published one: nothing that cannot be
    // restored may ever reach the backup name.
    if let Err(reason) = verify_copy(&staging).await {
        discard_staging(&staging);
        return Err(reason);
    }

    if dest.exists() {
        // Another device published today's file while this copy was built. Adopt
        // it only if it is usable — adopting a half-synced or damaged file would
        // claim protection this device does not have.
        let usable = matches!(inspect_file(&dest).await, Ok(verdict) if verdict.ok);
        discard_staging(&staging);
        if usable {
            return file_info(&dest);
        }
        return Err(format!(
            "{dest_path} already exists but is not a usable backup — delete it, then back up again"
        ));
    }
    std::fs::rename(&staging, &dest).map_err(|error| {
        discard_staging(&staging);
        format!("Could not publish {dest_path}: {error}")
    })?;
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

/// Open `file` read-only and judge whether it is a restorable CMIS database.
///
/// Checks, in order: the file opens as SQLite, `PRAGMA integrity_check`
/// returns `ok`, the expected tables exist, and the recorded schema version
/// is not newer than this app. Nothing is modified on any path — a refusal
/// leaves the live database untouched (spec F10.1–F10.2).
///
/// `create_backup` runs this same judgement on the copy it has just written,
/// so the only two definitions of "a restorable backup" — the one that gates a
/// restore and the one that gates a publish — cannot drift apart.
async fn inspect_file(file: &std::path::Path) -> Result<BackupInspection, String> {
    use sqlx::Row;
    use sqlx::sqlite::SqliteConnectOptions;
    use std::str::FromStr;

    let shown = file.to_string_lossy().to_string();
    let meta =
        std::fs::metadata(file).map_err(|error| format!("Could not read {shown}: {error}"))?;
    let name = file
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|mtime| mtime.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let size = meta.len();

    let refused = |code: &str, reason: String| {
        BackupInspection {
            ok: false,
            code: code.to_string(),
            reason,
            schema_version: None,
            app_version: None,
            size,
            mtime,
            name: name.clone(),
        }
    };

    let options = SqliteConnectOptions::from_str(&format!(
        "sqlite:{}?mode=ro",
        file.display()
    ))
    .map_err(|_| format!("{shown} is not a database file and cannot be restored."))?
    .busy_timeout(std::time::Duration::from_secs(5));
    let pool = sqlx::SqlitePool::connect_with(options).await.map_err(|_| {
        refused(
            "not-database",
            "This file is not a database and cannot be restored.".to_string(),
        )
        .reason
    });
    let pool = match pool {
        Ok(pool) => pool,
        Err(reason) => {
            return Ok(refused("not-database", reason));
        }
    };

    let check: Result<Vec<String>, sqlx::Error> = async {
        let rows = sqlx::query("PRAGMA integrity_check")
            .fetch_all(&pool)
            .await?;
        let mut values = Vec::new();
        for row in rows {
            values.push(row.try_get::<String, _>("integrity_check")?);
        }
        Ok(values)
    }
    .await;
    match check {
        Ok(values) if values.len() == 1 && values[0].eq_ignore_ascii_case("ok") => {}
        Ok(_) => {
            pool.close().await;
            return Ok(refused(
                "damaged",
                "This backup is damaged (integrity check failed) and cannot be restored.".to_string(),
            ));
        }
        Err(_) => {
            pool.close().await;
            return Ok(refused(
                "not-database",
                "This file is not a database and cannot be restored.".to_string(),
            ));
        }
    }

    let tables: Vec<String> = sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .fetch_all(&pool)
        .await
        .map_err(|error| format!("Could not inspect {shown}: {error}"))?
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("name").ok())
        .collect();
    for expected in EXPECTED_TABLES {
        if !tables.iter().any(|table| table == expected) {
            pool.close().await;
            return Ok(refused(
                "not-cmis",
                "This file is not a CMIS backup (expected tables are missing).".to_string(),
            ));
        }
    }

    let schema_version: Option<i64> = async {
        if let Ok(row) = sqlx::query(
            "SELECT value FROM app_meta WHERE key = 'backup_schema_version'",
        )
        .fetch_optional(&pool)
        .await
        {
            if let Some(row) = row {
                if let Ok(raw) = row.try_get::<String, _>("value") {
                    if let Ok(version) = raw.trim().parse::<i64>() {
                        return Some(version);
                    }
                }
            }
        }
        // Databases from before the stamp carry no key: fall back to the
        // migration ledger, then to "unknown" (accepted unless tables lie).
        if let Ok(row) =
            sqlx::query("SELECT MAX(version) AS v FROM _sqlx_migrations")
                .fetch_optional(&pool)
                .await
        {
            if let Some(row) = row {
                if let Ok(version) = row.try_get::<i64, _>("v") {
                    return Some(version);
                }
            }
        }
        None
    }
    .await;
    let app_version: Option<String> = sqlx::query(
        "SELECT value FROM app_meta WHERE key = 'backup_app_version'",
    )
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten()
    .and_then(|row| row.try_get::<String, _>("value").ok());
    pool.close().await;

    if let Some(version) = schema_version {
        if version > CURRENT_SCHEMA_VERSION {
            return Ok(BackupInspection {
                ok: false,
                code: "newer-version".to_string(),
                reason: "This backup was made by a newer version of CMIS — update the app first.".to_string(),
                schema_version: Some(version),
                app_version,
                size,
                mtime,
                name,
            });
        }
    }

    Ok(BackupInspection {
        ok: true,
        code: "ok".to_string(),
        reason: String::new(),
        schema_version,
        app_version,
        size,
        mtime,
        name,
    })
}

/// Read-only verdict on a file the operator picked, before anything is touched.
#[tauri::command]
pub async fn inspect_backup(path: String) -> Result<BackupInspection, String> {
    inspect_file(&std::path::PathBuf::from(&path)).await
}

/// Replace the live `cmis.db` with `source_path` (spec F10.4).
///
/// The caller must have verified the source with `inspect_backup` first.
/// The source is copied to a temporary file beside the live database, the
/// `-wal`/`-shm` sidecars are removed, and only then is the temporary file
/// renamed over `cmis.db` — a failure can never leave a half-swapped
/// database. A restore journal is written for the next launch to consume
/// (the surviving audit entry, F10.6). The app must `relaunch()` after this
/// returns; on error the app must NOT restart.
#[tauri::command]
pub async fn apply_restore(
    app: AppHandle,
    source_path: String,
    operator: Option<String>,
) -> Result<String, String> {
    let source = std::path::PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("Backup not found at {source_path}"));
    }
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the app data folder: {error}"))?;
    std::fs::create_dir_all(&data)
        .map_err(|error| format!("Could not create {}: {error}", data.display()))?;
    let live = data.join("cmis.db");
    let incoming = data.join("cmis.db.restore-incoming");

    // Copy-plus-rename: the temp file is complete before the live file moves.
    std::fs::copy(&source, &incoming)
        .map_err(|error| format!("Could not stage the restore (nothing was changed): {error}"))?;
    for sidecar in ["cmis.db-wal", "cmis.db-shm"] {
        let path = data.join(sidecar);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|error| {
                let _ = std::fs::remove_file(&incoming);
                format!(
                    "Could not replace the live database (nothing was changed): {error}"
                )
            })?;
        }
    }
    if live.exists() {
        // Windows cannot rename over an existing file: the complete incoming
        // copy already exists, so removing first still leaves a recovery path.
        std::fs::remove_file(&live).map_err(|error| {
            let _ = std::fs::remove_file(&incoming);
            format!("Could not replace the live database (nothing was changed): {error}")
        })?;
    }
    std::fs::rename(&incoming, &live).map_err(|error| {
        format!("Could not replace the live database: {error} — restore the backup file manually")
    })?;

    let journal = RestoreJournal {
        source_name: source
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default(),
        source_file: source.to_string_lossy().to_string(),
        operator: operator.unwrap_or_else(|| "Local user".to_string()),
        app_version: app.package_info().version.to_string(),
        at: chrono::Utc::now().to_rfc3339(),
    };
    let path = journal_path(&app)?;
    let json = serde_json::to_string_pretty(&journal)
        .map_err(|error| format!("Database was restored, but the journal could not be written: {error}"))?;
    std::fs::write(&path, json)
        .map_err(|error| format!("Database was restored, but the journal could not be written: {error}"))?;
    Ok(live.to_string_lossy().to_string())
}

/// Stage a `.db` file dropped on the Import card so the real Restore flow can
/// open it (spec F9). The browser `File` carries bytes but no path, while
/// `inspect_backup`/`apply_restore` need one — this writes the bytes to a
/// staging file under app data and returns its path. Staged files are never
/// listed, pruned, or mistaken for backups; each staging run replaces the
/// previous file of the same name.
#[tauri::command]
pub fn stage_import_db(
    app: AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let stem = std::path::Path::new(&name)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    if !stem.to_lowercase().ends_with(".db") || stem.contains(['/', '\\']) {
        return Err("Only .db files can be staged for restore.".to_string());
    }
    if bytes.is_empty() {
        return Err(format!("{stem} is empty — nothing to restore."));
    }
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the app data folder: {error}"))?;
    let dir = data.join("cmis-restore-staging");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    let staged = dir.join(&stem);
    std::fs::write(&staged, &bytes)
        .map_err(|error| format!("Could not stage {stem}: {error}"))?;
    Ok(staged.to_string_lossy().to_string())
}

/// Hand back the pending restore record once (spec F10.6).///
/// Called at startup after the database is open. The journal is deleted
/// whether it parses or not — a corrupt journal is reported, never blocking.
#[tauri::command]
pub fn consume_restore_journal(app: AppHandle) -> Result<Option<RestoreJournal>, String> {
    let path = journal_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the restore journal: {error}"))?;
    // Delete first: the record is single-use, and a malformed file must not
    // reappear on every launch.
    let _ = std::fs::remove_file(&path);
    match serde_json::from_str::<RestoreJournal>(&raw) {
        Ok(journal) => Ok(Some(journal)),
        Err(_) => Err(
            "The restore journal was unreadable, so no audit entry was written. The restored data itself is unaffected.".to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(label: &str) -> std::path::PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos());
        let dir = std::env::temp_dir().join(format!("cmis-backup-{label}-{stamp}"));
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    /// `verify_copy` without the async plumbing at every call site.
    fn verify(path: &std::path::Path) -> Result<(), String> {
        tauri::async_runtime::block_on(verify_copy(path))
    }

    /// A database shaped like the live one: the migration ledger, the two
    /// load-bearing tables a backup must carry, and the version stamp.
    fn write_cmis_database(path: &std::path::Path, schema_version: i64) {
        tauri::async_runtime::block_on(async {
            let options = sqlx::sqlite::SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(true);
            let pool = sqlx::SqlitePool::connect_with(options)
                .await
                .expect("open scratch database");
            for sql in [
                "CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY, description TEXT NOT NULL)",
                "CREATE TABLE inventory_items (id INTEGER PRIMARY KEY, name TEXT)",
                "CREATE TABLE requests (id INTEGER PRIMARY KEY)",
                "CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            ] {
                sqlx::query(sql).execute(&pool).await.expect("schema");
            }
            sqlx::query("INSERT INTO _sqlx_migrations (version, description) VALUES (?1, 'seed')")
                .bind(schema_version)
                .execute(&pool)
                .await
                .expect("seed ledger");
            sqlx::query("INSERT INTO app_meta (key, value) VALUES ('backup_schema_version', ?1)")
                .bind(schema_version.to_string())
                .execute(&pool)
                .await
                .expect("seed stamp");
            pool.close().await;
        });
    }

    #[test]
    fn verify_accepts_a_finished_cmis_copy() {
        let dir = scratch_dir("verify-ok");
        let path = dir.join("cmis-auto-2026-09-30.db");
        write_cmis_database(&path, CURRENT_SCHEMA_VERSION);

        verify(&path).expect("a real CMIS database must verify");
        let verdict = tauri::async_runtime::block_on(inspect_file(&path)).expect("inspect");
        assert!(verdict.ok);
        assert_eq!(verdict.code, "ok");
        assert_eq!(verdict.schema_version, Some(CURRENT_SCHEMA_VERSION));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_accepts_a_vacuum_into_copy() {
        // The end-to-end shape of `create_backup` minus the `AppHandle`: copy the
        // live database into a staging file, then pass it through the gate that
        // stands between the copy and the backup name.
        let dir = scratch_dir("verify-vacuum");
        let live = dir.join("live.db");
        write_cmis_database(&live, CURRENT_SCHEMA_VERSION);
        let staging = dir.join("cmis-auto-2026-09-30.db.1-2-0.partial");

        tauri::async_runtime::block_on(async {
            let pool = sqlx::SqlitePool::connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&live)
                    .create_if_missing(false),
            )
            .await
            .expect("open live database");
            let target = staging.to_string_lossy().replace('\'', "''");
            sqlx::query(&format!("VACUUM INTO '{target}'"))
                .execute(&pool)
                .await
                .expect("vacuum into staging");
            pool.close().await;
        });

        verify(&staging).expect("a VACUUM INTO copy must verify");
        let verdict =
            tauri::async_runtime::block_on(inspect_file(&staging)).expect("inspect the copy");
        assert!(verdict.ok && verdict.size > 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_rejects_a_zero_byte_placeholder() {
        // What a half-synced folder leaves behind: it opens as an empty
        // database, so only the expected-tables check catches it.
        let dir = scratch_dir("verify-empty");
        let path = dir.join("cmis-auto-2026-09-30.db");
        std::fs::write(&path, b"").expect("empty file");

        let error = verify(&path).expect_err("an empty file is not a backup");
        assert!(error.contains("not-cmis"), "{error}");
        assert!(error.contains("did not verify"), "{error}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_rejects_a_truncated_copy() {
        let dir = scratch_dir("verify-truncated");
        let whole = dir.join("whole.db");
        write_cmis_database(&whole, CURRENT_SCHEMA_VERSION);
        let bytes = std::fs::read(&whole).expect("read scratch database");
        assert!(bytes.len() > 1024, "scratch database is too small to truncate");
        let cut = dir.join("cmis-auto-2026-09-30.db");
        std::fs::write(&cut, &bytes[..bytes.len() / 2]).expect("truncated copy");

        let error = verify(&cut).expect_err("a truncated copy is not a backup");
        assert!(error.contains("did not verify"), "{error}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_rejects_a_copy_from_a_newer_app() {
        let dir = scratch_dir("verify-newer");
        let path = dir.join("cmis-auto-2026-09-30.db");
        write_cmis_database(&path, CURRENT_SCHEMA_VERSION + 1);

        let error = verify(&path).expect_err("a newer schema must be refused");
        assert!(error.contains("newer-version"), "{error}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn staging_files_are_unique_per_attempt() {
        // The bug this guards: a fixed `<name>.db.partial` is shared state once
        // two devices back up into one folder, and one device's VACUUM INTO
        // then opens the other's half-written file.
        let dest = std::path::PathBuf::from("backups").join("cmis-auto-2026-09-30.db");
        let first = staging_path(&dest).expect("staging path");
        let second = staging_path(&dest).expect("staging path");
        assert_ne!(first, second, "two attempts must not share a scratch file");
        for path in [&first, &second] {
            let name = path
                .file_name()
                .expect("name")
                .to_string_lossy()
                .to_string();
            assert!(name.starts_with("cmis-auto-2026-09-30.db."), "{name}");
            // Still swept at launch, still invisible to list and prune.
            assert!(name.ends_with(".partial"), "{name}");
            assert_ne!(path, &dest);
            assert_eq!(path.parent(), dest.parent());
        }
    }

    #[test]
    fn staging_path_never_reuses_the_legacy_partial_name() {
        // A folder left in the failed state holds `cmis-auto-<date>.db.partial`,
        // the fixed name the old code staged into. An attempt must not open it.
        let dest = std::path::PathBuf::from("backups").join("cmis-auto-2026-09-30.db");
        let legacy = dest.with_extension("db.partial");
        assert_ne!(staging_path(&dest).expect("staging path"), legacy);
    }

    #[test]
    fn staging_path_refuses_a_destination_with_no_file_name() {
        assert!(staging_path(std::path::Path::new("..")).is_err());
    }

    #[test]
    fn discard_staging_removes_the_copy_and_its_sidecars() {
        let dir = scratch_dir("staging");
        let staging = dir.join("cmis-auto-2026-09-30.db.1-2-0.partial");
        std::fs::write(&staging, b"half-written").expect("stage copy");
        let journal = dir.join("cmis-auto-2026-09-30.db.1-2-0.partial-journal");
        std::fs::write(&journal, b"journal").expect("stage journal");

        discard_staging(&staging);

        assert!(!staging.exists());
        assert!(!journal.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn backup_kind_ignores_staging_files() {
        let staged = staging_path(&std::path::PathBuf::from("cmis-auto-2026-09-30.db"))
            .expect("staging path");
        let name = staged.file_name().expect("name").to_string_lossy().to_string();
        // `prune_backups` sweeps `.partial` and never counts it as a backup.
        assert_eq!(backup_kind(&name), "other");
        assert!(name.ends_with(".partial"));
    }
}
