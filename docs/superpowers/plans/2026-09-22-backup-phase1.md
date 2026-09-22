# Database Backup Phase 1 — The Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every calendar day the app is opened, one consistent copy of `cmis.db` is written to `<Documents>/CMIS Backups` with retention, status UI, and loud failure — no restore yet.

**Architecture:** Rust owns all file/DB-path work in a new `commands/backup.rs` (consistent copy via `VACUUM INTO` through `sqlx 0.8`, the version `tauri-plugin-sql 2.4.1` already pulls in, so no second `libsqlite3-sys` is linked). TypeScript owns pure policy (naming, retention, schedule decision — unit-tested), a `cmis-backup.json` `LazyStore` (readable before the DB is trusted, survives wipe/restore), a post-mount background hook with a 60 s rollover check, the real Backup tab, a shell-level failure banner, and a file-based Health card. Nothing backup-related runs in `beforeLoad`.

**Tech Stack:** Tauri 2 (`tauri::Manager` path APIs), `sqlx 0.8` with `sqlite` + `runtime-tokio`, React + TanStack Query/Router, `tauri-plugin-store` `LazyStore`, `tauri-plugin-dialog` `save`, vitest with `node:sqlite` for the real-engine round trip.

**Spec:** `docs/specs/backup-restore-spec.md` — Phase 1 is spec §12 steps 1–6 only. Restore (`inspect_backup`, `apply_restore`, `consume_restore_journal`, restore dialog, journal consumer), the pre-wipe copy, the Import-card `.db` reroute, and the first-launch prompt are Phase 2 and are explicitly out of scope.

## Global Constraints

- The copy is produced by SQLite (`VACUUM INTO`), never a raw file copy, with no silent fallback — a copy that cannot be made consistently fails loudly (D14).
- One automatic copy per calendar day (local `YYYY-MM-DD`), silent on success, persistent banner + Health warning on failure (D2, D7, D8).
- Destination is `<Documents>/CMIS Backups`, created on demand (D5).
- Retention keeps the newest `keep` (default 10, range 1–100) files matching exactly `cmis-auto-*.db`, ordered by name; `cmis-manual-*.db`, foreign files, and `.partial` files are structurally invisible to the pruner (D6, D22).
- Manual copies use the `cmis-manual-YYYY-MM-DD-HHmm.db` prefix, are never auto-deleted, and collisions append `-2`, `-3` before `.db` — nothing is ever overwritten (D18, F3).
- In-progress copies end in `.partial`, are renamed only on success, and are swept on next launch — never listed, counted, pruned, or restored (F3, §7.5).
- Browser preview (`import.meta.env.DEV` without Tauri) and Vitest have no Tauri FS: the backup layer is inert there; date/retention/naming logic lives in pure modules tested directly (§7.6).
- In-database rollback snapshots (`snapshotTable`/`pruneBackups`/`KEEP_BACKUPS = 3`) and the `.csv`/`.xlsx` import path are untouched (N8, N9).
- No new Tauri capability permissions are needed; no schema/migration change (backup is a file copy).
- Run `pnpm dlx ultracite fix` before committing (repo code standards).

---

## File Structure

**Rust (new + changed):**

- Create `apps/desktop/src-tauri/src/commands/backup.rs` — five commands (`backup_default_dir`, `backup_live_db_path`, `create_backup`, `list_backups`, `prune_backups`) plus the shared `BackupFileInfo` struct, `backup_kind()`, and the `VACUUM INTO` helper. One responsibility: file and database-path work.
- Modify `apps/desktop/src-tauri/src/commands/mod.rs` — add `pub mod backup;`.
- Modify `apps/desktop/src-tauri/src/lib.rs` — register the five commands in `invoke_handler` (nothing else; no startup sweep/journal — that is Phase 2).
- Modify `apps/desktop/src-tauri/Cargo.toml` — add `sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio"] }` (matches the `0.8.6` / `libsqlite3-sys 0.30.1` already in `Cargo.lock` via `tauri-plugin-sql 2.4.1`).

**TypeScript pure layer (new, framework-free, unit-tested):**

- Create `apps/desktop/src/features/backup/data/backup-naming.ts` — local-date keys, auto/manual/partial names, collision suffixes, kind guards.
- Create `apps/desktop/src/features/backup/data/backup-naming.test.ts`.
- Create `apps/desktop/src/features/backup/data/backup-retention.ts` — `selectPruneVictims`.
- Create `apps/desktop/src/features/backup/data/backup-retention.test.ts`.
- Create `apps/desktop/src/features/backup/data/backup-policy.ts` — `shouldRunDailyBackup`.
- Create `apps/desktop/src/features/backup/data/backup-policy.test.ts`.
- Create `apps/desktop/src/features/backup/data/backup-roundtrip.test.ts` — real-engine (`node:sqlite`) consistent-copy proof (G2/G4 at the TS level).

**TypeScript state + hooks (new):**

- Create `apps/desktop/src/lib/backup-store.ts` — `cmis-backup.json` `LazyStore` accessor (F8 keys), defaults `enabled: true`, `keep: 10`.
- Create `apps/desktop/src/lib/backup-store.test.ts`.
- Create `apps/desktop/src/features/backup/hooks/use-backup-status.ts` — loads store state, exposes `status`, `reload`, `setEnabled`, `setKeep`.
- Create `apps/desktop/src/features/backup/hooks/use-daily-backup.ts` — mount + 60 s rollover runner with in-flight guard; performs adopt-or-copy, prune, store + audit writes.
- Create `apps/desktop/src/features/backup/hooks/use-backup-files.ts` — `list_backups` via `invoke`, TanStack Query key `"backup-files"`.

**TypeScript UI (new + changed):**

- Create `apps/desktop/src/features/backup/components/backup-tab.tsx` — self-contained real tab (status, Back up now, Save a copy…, auto switch, retention, file list, empty state). No per-row Restore buttons (Phase 2).
- Create `apps/desktop/src/features/backup/components/backup-warning-banner.tsx` — shell-level persistent banner with Retry.
- Modify `apps/desktop/src/routes/__root.tsx` — mount `useDailyBackup` + banner after UI renders (never in `beforeLoad`).
- Modify `apps/desktop/src/features/admin/settings/components/settings-page.tsx` — render the new `<BackupTab />` without props.
- Modify `apps/desktop/src/features/admin/settings/hooks/use-settings.ts` — remove `backup` from state, `triggerBackup`, `setBackupSchedule`.
- Modify `apps/desktop/src/features/admin/settings/types.ts` — delete `BackupSettings`; remove `backup` from `SettingsState`.
- Modify `apps/desktop/src/features/admin/health/data/system-health.ts` — backup card built from an injected file summary (no more `sqlite_master` metric, no fictitious `daily 02:00`).
- Modify `apps/desktop/src/features/admin/health/hooks/use-system-health.ts` — merge DB cards with `list_backups` summary when in Tauri.
- Modify `apps/desktop/src/features/admin/health/hooks/use-health.ts` — delete the placeholder `trigger-backup` branch.
- Modify `apps/desktop/src/features/admin/health/components/health-page.tsx` and `apps/desktop/src/features/admin/settings/components/health-tab.tsx` — intercept the backup action and run the real manual backup with truthful toasts.
- Modify `apps/desktop/src/features/admin/settings/hooks/use-settings.test.ts` — drop the `backup` assertions/fixtures.
- Modify `apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx` (2 spots) — drop the literal `backup:` fixtures.
- Delete `apps/desktop/src/features/admin/settings/components/backup-tab.tsx` (placeholder) once the new tab is wired — or keep the path and replace its contents (executor: replace contents, keep import path stable, so `settings-page.tsx` barely changes).

---

### Task 1: Rust — backup dir + live DB path commands

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/backup.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `tauri::Manager` path APIs (`document_dir`, `app_data_dir`).
- Produces: `backup_default_dir() -> Result<String, String>`, `backup_live_db_path() -> Result<String, String>`, `BackupFileInfo` struct (used by Tasks 2–3).

- [ ] **Step 1: Create `backup.rs` with dir resolution and the shared struct**

```rust
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
```

- [ ] **Step 2: Register the module and the two commands**

Run: edit `apps/desktop/src-tauri/src/commands/mod.rs` to:

```rust
// Tauri commands - add per feature
pub mod backup;
pub mod reports;
```

Edit `apps/desktop/src-tauri/src/lib.rs` `invoke_handler` to:

```rust
.invoke_handler(tauri::generate_handler![
    commands::backup::backup_default_dir,
    commands::backup::backup_live_db_path,
    commands::reports::save_stock_report_workbook,
    commands::reports::generate_stock_report_pdf
])
```

(`create_backup`, `list_backups`, `prune_backups` join this list in Tasks 2–3.)

- [ ] **Step 3: Verify it compiles**

Run: `cargo check` in `apps/desktop/src-tauri`
Expected: PASS (warnings ok, errors not). Note: this environment is Windows PowerShell — run `cargo check` via the `workdir` parameter, no `cd`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/backup.rs apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(backup): resolve backup dir and live db path commands"
```

### Task 2: Rust — consistent `create_backup` via `VACUUM INTO`

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/backup.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (register `create_backup`)

**Interfaces:**
- Consumes: `backup_live_db_path` resolution, `BackupFileInfo`, `backup_kind` from Task 1.
- Produces: `create_backup(dest_path: String) -> Result<BackupFileInfo, String>` (used by Task 7 hooks).

- [ ] **Step 1: Add the `sqlx` dependency pinned to the version already in the lockfile**

Run: edit `apps/desktop/src-tauri/Cargo.toml`, append to `[dependencies]`:

```toml
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio"] }
```

Then verify no second SQLite linkage: `cargo tree -i libsqlite3-sys` in `apps/desktop/src-tauri` must show exactly one version (`0.30.1`). If cargo reports two versions, stop — do not proceed with a duplicated native lib; report back instead.

- [ ] **Step 2: Implement `create_backup` — `.partial` + `VACUUM INTO` + rename, never overwrite**

Append to `apps/desktop/src-tauri/src/commands/backup.rs`:

```rust
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
        return Err(format!("Refusing to write a backup to {dest_path}: not a .db path"));
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

    let options = SqliteConnectOptions::from_str(&format!("sqlite:{}?mode=rw", live.display()))
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
```

Also register `commands::backup::create_backup` in the `invoke_handler` from Task 1.

- [ ] **Step 3: Verify it compiles**

Run: `cargo check` in `apps/desktop/src-tauri`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/backup.rs apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(backup): consistent create_backup via VACUUM INTO"
```

### Task 3: Rust — `list_backups` + `prune_backups`

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/backup.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (register both)

**Interfaces:**
- Consumes: `BackupFileInfo`, `backup_kind`, `file_info` from Task 1.
- Produces: `list_backups(dir: String) -> Result<Vec<BackupFileInfo>, String>`, `prune_backups(dir: String, keep: u32) -> Result<Vec<String>, String>` (used by Tasks 7–8).

- [ ] **Step 1: Implement listing (every `cmis-*.db`, never `.partial`) and pattern-scoped pruning**

Append to `apps/desktop/src-tauri/src/commands/backup.rs`:

```rust
/// Every `cmis-*.db` in `dir`, newest first. `.partial` files, a hand-copied
/// `cmis.db`, and anything not ending in `.db` are never listed.
#[tauri::command]
pub fn list_backups(dir: String) -> Result<Vec<BackupFileInfo>, String> {
    let dir = std::path::PathBuf::from(&dir);
    let entries = std::fs::read_dir(&dir)
        .map_err(|error| format!("Could not read {}: {error}", dir.display()))?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Could not read {}: {error}", dir.display()))?;
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
    let entries = std::fs::read_dir(&dir)
        .map_err(|error| format!("Could not read {}: {error}", dir.display()))?;
    let mut auto: Vec<String> = Vec::new();
    let mut partials: Vec<std::path::PathBuf> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Could not read {}: {error}", dir.display()))?;
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
```

Register both commands in `invoke_handler`.

- [ ] **Step 2: Verify it compiles**

Run: `cargo check` in `apps/desktop/src-tauri`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/backup.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(backup): list and pattern-scoped prune commands"
```

### Task 4: TS pure layer — naming, retention, policy + tests

**Files:**
- Create: `apps/desktop/src/features/backup/data/backup-naming.ts`
- Create: `apps/desktop/src/features/backup/data/backup-naming.test.ts`
- Create: `apps/desktop/src/features/backup/data/backup-retention.ts`
- Create: `apps/desktop/src/features/backup/data/backup-retention.test.ts`
- Create: `apps/desktop/src/features/backup/data/backup-policy.ts`
- Create: `apps/desktop/src/features/backup/data/backup-policy.test.ts`

**Interfaces:**
- Consumes: nothing (pure; no Tauri, no React).
- Produces: `localDateKey`, `autoBackupName`, `manualBackupName`, `partialName`, `resolveCollision`, `backupKindOf`, `isAutoBackupName`, `isListableBackupName` (naming); `selectPruneVictims` (retention); `shouldRunDailyBackup` + `DailyBackupDecision` (policy). Used by Tasks 5/7/8.

- [ ] **Step 1: Write the failing naming tests**

```ts
import { describe, expect, it } from "vitest";
import {
  autoBackupName,
  backupKindOf,
  isAutoBackupName,
  isListableBackupName,
  localDateKey,
  manualBackupName,
  resolveCollision,
} from "./backup-naming";

describe("backup-naming", () => {
  it("keys the local calendar date, not UTC", () => {
    expect(localDateKey(new Date(2026, 8, 22, 0, 30))).toBe("2026-09-22");
  });

  it("names one automatic copy per day", () => {
    expect(autoBackupName("2026-09-22")).toBe("cmis-auto-2026-09-22.db");
  });

  it("names manual copies to the minute", () => {
    expect(manualBackupName(new Date(2026, 8, 22, 9, 14))).toBe(
      "cmis-manual-2026-09-22-0914.db",
    );
  });

  it("suffixes collisions before .db and never overwrites", () => {
    expect(
      resolveCollision(["cmis-manual-2026-09-22-0914.db"], "cmis-manual-2026-09-22-0914.db"),
    ).toBe("cmis-manual-2026-09-22-0914-2.db");
  });

  it("classifies only the app's own patterns", () => {
    expect(backupKindOf("cmis-auto-2026-09-22.db")).toBe("auto");
    expect(backupKindOf("cmis-manual-2026-09-22-0914.db")).toBe("manual");
    expect(backupKindOf("notes.db")).toBe("other");
    expect(isAutoBackupName("cmis-manual-2026-09-22-0914.db")).toBe(false);
    expect(isListableBackupName("cmis-auto-2026-09-22.db.partial")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter desktop test --run src/features/backup/data/backup-naming.test.ts` from repo root (or `pnpm test --run <path>` inside `apps/desktop`)
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the naming module**

```ts
/** Backup file naming (backup-restore spec F3). Pure — no Tauri, no React. */

export type BackupKind = "auto" | "manual" | "other";

const AUTO_RE = /^cmis-auto-\d{4}-\d{2}-\d{2}\.db$/;
const MANUAL_RE = /^cmis-manual-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.db$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local `YYYY-MM-DD` — the once-per-day key (§7.1), never UTC. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `cmis-auto-YYYY-MM-DD.db` — one per day. */
export function autoBackupName(dateKey: string): string {
  return `cmis-auto-${dateKey}.db`;
}

/** `cmis-manual-YYYY-MM-DD-HHmm.db` — local time, to the minute. */
export function manualBackupName(now: Date = new Date()): string {
  return `cmis-manual-${localDateKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}.db`;
}

/** In-progress copy path — renamed into place only on success. */
export function partialName(name: string): string {
  return `${name}.partial`;
}

export function backupKindOf(name: string): BackupKind {
  if (AUTO_RE.test(name)) return "auto";
  if (MANUAL_RE.test(name)) return "manual";
  return "other";
}

export function isAutoBackupName(name: string): boolean {
  return backupKindOf(name) === "auto";
}

export function isListableBackupName(name: string): boolean {
  return backupKindOf(name) !== "other";
}

/** Append `-2`, `-3`, … before `.db` until the name is unused. */
export function resolveCollision(existing: readonly string[], base: string): string {
  if (!existing.includes(base)) return base;
  const dot = base.lastIndexOf(".db");
  const stem = dot === -1 ? base : base.slice(0, dot);
  let n = 2;
  while (existing.includes(`${stem}-${n}.db`)) n += 1;
  return `${stem}-${n}.db`;
}
```

- [ ] **Step 4: Write the failing retention + policy tests**

```ts
import { describe, expect, it } from "vitest";
import { selectPruneVictims } from "./backup-retention";
import { shouldRunDailyBackup } from "./backup-policy";

describe("backup-retention", () => {
  const names = (n: number) =>
    Array.from({ length: n }, (_, i) => `cmis-auto-2026-09-${String(i + 1).padStart(2, "0")}.db`);

  it("keeps the newest N automatic copies by name order", () => {
    expect(selectPruneVictims([...names(12), "notes.db"], 10, "cmis-auto-2026-09-12.db")).toEqual([
      "cmis-auto-2026-09-01.db",
      "cmis-auto-2026-09-02.db",
    ]);
  });

  it("never touches manual or foreign files and never the just-written file", () => {
    const files = ["cmis-manual-2026-09-01-0914.db", "notes.db", "cmis-auto-2026-09-01.db"];
    expect(selectPruneVictims(files, 1, "cmis-auto-2026-09-01.db")).toEqual([]);
  });
});

describe("backup-policy", () => {
  it("skips when disabled, done today, or no database; runs on a new day", () => {
    expect(
      shouldRunDailyBackup({ enabled: false, hasDatabase: true, lastBackupDate: "", today: "2026-09-22" }).run,
    ).toBe(false);
    expect(
      shouldRunDailyBackup({ enabled: true, hasDatabase: true, lastBackupDate: "2026-09-22", today: "2026-09-22" }).run,
    ).toBe(false);
    expect(
      shouldRunDailyBackup({ enabled: true, hasDatabase: false, lastBackupDate: "", today: "2026-09-22" }).run,
    ).toBe(false);
    expect(
      shouldRunDailyBackup({ enabled: true, hasDatabase: true, lastBackupDate: "2026-09-21", today: "2026-09-22" }).run,
    ).toBe(true);
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `pnpm --filter desktop test --run src/features/backup/data/backup-retention.test.ts src/features/backup/data/backup-policy.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 6: Implement retention + policy**

```ts
/** Retention victim selection (backup-restore spec F4). Pure. */
import { isAutoBackupName } from "./backup-naming";

export function selectPruneVictims(
  names: readonly string[],
  keep: number,
  justWritten: string,
): string[] {
  // `justWritten` counts toward the survivors (it is today's file, so it is
  // normally among the newest) but is never itself a victim: the filter runs
  // after the cut, so a clock-skewed outlier keeps keep+1 files rather than
  // deleting the file just written.
  const all = names.filter((name) => isAutoBackupName(name)).sort();
  const survivors = Math.max(1, keep);
  return all
    .slice(0, Math.max(0, all.length - survivors))
    .filter((name) => name !== justWritten);
}
```

```ts
/** Once-per-day launch decision (backup-restore spec F1). Pure. */
export interface DailyBackupInput {
  enabled: boolean;
  hasDatabase: boolean;
  lastBackupDate: string;
  today: string;
}

export interface DailyBackupDecision {
  reason: "already-done" | "disabled" | "due" | "no-database";
  run: boolean;
}

export function shouldRunDailyBackup(input: DailyBackupInput): DailyBackupDecision {
  if (!input.enabled) return { reason: "disabled", run: false };
  if (!input.hasDatabase) return { reason: "no-database", run: false };
  if (input.lastBackupDate === input.today) return { reason: "already-done", run: false };
  return { reason: "due", run: true };
}
```

- [ ] **Step 7: Run all three suites green**

Run: `pnpm --filter desktop test --run src/features/backup/data/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/features/backup/data/
git commit -m "feat(backup): pure naming, retention and policy layer"
```

### Task 5: `cmis-backup.json` store + real-engine round-trip test

**Files:**
- Create: `apps/desktop/src/lib/backup-store.ts`
- Create: `apps/desktop/src/lib/backup-store.test.ts`
- Create: `apps/desktop/src/features/backup/data/backup-roundtrip.test.ts`

**Interfaces:**
- Consumes: `localDateKey` (Task 4); `LazyStore` from `@tauri-apps/plugin-store` (dynamic import, browser-safe fallback like `updater-settings.ts`).
- Produces: `BackupStoreState`, `DEFAULT_BACKUP_STORE`, `loadBackupStore`, `saveBackupStore` (used by Tasks 7–8).

- [ ] **Step 1: Write the failing store test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_BACKUP_STORE, coerceBackupStore } from "./backup-store";

describe("backup-store", () => {
  it("defaults to enabled with keep 10", () => {
    expect(DEFAULT_BACKUP_STORE.enabled).toBe(true);
    expect(DEFAULT_BACKUP_STORE.keep).toBe(10);
  });

  it("coerces garbage and clamps keep to 1–100", () => {
    expect(coerceBackupStore({ keep: 500 }).keep).toBe(100);
    expect(coerceBackupStore({ keep: 0 }).keep).toBe(1);
    expect(coerceBackupStore(null).enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter desktop test --run src/lib/backup-store.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the store (mirrors `updater-settings.ts`)**

```ts
/** Machine-local backup settings (backup-restore spec F8). */

export interface BackupStoreState {
  enabled: boolean;
  keep: number;
  lastBackupAt: string;
  lastBackupDate: string;
  lastBackupError: string;
  lastBackupPath: string;
  lastManualAt: string;
}

export const BACKUP_STORE_FILE = "cmis-backup.json";

export const DEFAULT_BACKUP_STORE: BackupStoreState = {
  enabled: true,
  keep: 10,
  lastBackupAt: "",
  lastBackupDate: "",
  lastBackupError: "",
  lastBackupPath: "",
  lastManualAt: "",
};

let cachedStore: unknown | null = null;

async function getStore(): Promise<{
  get: <T>(key: string) => Promise<T | undefined>;
  save: () => Promise<void>;
  set: (key: string, value: unknown) => Promise<void>;
}> {
  if (cachedStore) return cachedStore as never;
  const { LazyStore } = await import("@tauri-apps/plugin-store");
  const store = new LazyStore(BACKUP_STORE_FILE);
  cachedStore = store;
  return store as never;
}

/** Exported for tests — clamps `keep` to 1–100, keeps every key defined. */
export function coerceBackupStore(raw: unknown): BackupStoreState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BACKUP_STORE };
  const r = raw as Record<string, unknown>;
  const keep = typeof r.keep === "number" ? Math.min(100, Math.max(1, Math.floor(r.keep))) : 10;
  const str = (key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    keep,
    lastBackupAt: str("lastBackupAt"),
    lastBackupDate: str("lastBackupDate"),
    lastBackupError: str("lastBackupError"),
    lastBackupPath: str("lastBackupPath"),
    lastManualAt: str("lastManualAt"),
  };
}

export async function loadBackupStore(): Promise<BackupStoreState> {
  try {
    const store = await getStore();
    const raw = await store.get<BackupStoreState>("backup");
    if (raw === null || raw === undefined) return { ...DEFAULT_BACKUP_STORE };
    return coerceBackupStore(raw);
  } catch {
    return { ...DEFAULT_BACKUP_STORE };
  }
}

export async function saveBackupStore(patch: Partial<BackupStoreState>): Promise<BackupStoreState> {
  const next: BackupStoreState = { ...(await loadBackupStore()), ...patch };
  next.keep = Math.min(100, Math.max(1, Math.floor(next.keep)));
  try {
    const store = await getStore();
    await store.set("backup", next);
    await store.save();
  } catch {
    // ignore store write failures (browser dev without Tauri)
  }
  return next;
}

export function __resetBackupStoreCacheForTests(): void {
  cachedStore = null;
}
```

- [ ] **Step 4: Write the real-engine round-trip test (proves G2)**

```ts
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

/**
 * The consistent-copy proof (backup-restore spec §11): a database with known
 * rows is copied the way `create_backup` copies it — SQLite itself
 * (`VACUUM INTO`) — and every row matches in the copy with `integrity_check`
 * returning `ok`. `node:sqlite` is the same SQLite engine family the Rust
 * `VACUUM INTO` runs against, so this pins the semantics, not the mock.
 */
describe("backup consistent-copy round trip", () => {
  it("VACUUM INTO carries every row and passes integrity_check", () => {
    const dir = mkdtempSync(join(tmpdir(), "cmis-backup-"));
    const live = join(dir, "live.db");
    const copy = join(dir, "cmis-auto-2026-09-22.db");

    const db = new DatabaseSync(live);
    db.exec("CREATE TABLE inventory_items (id TEXT PRIMARY KEY, name TEXT)");
    db.exec("CREATE TABLE requests (id TEXT PRIMARY KEY, state TEXT)");
    db.prepare("INSERT INTO inventory_items VALUES (?, ?)").run("i1", "Paracetamol 500mg");
    db.prepare("INSERT INTO requests VALUES (?, ?)").run("r1", "submitted");

    const target = copy.replaceAll("'", "''");
    db.exec(`VACUUM INTO '${target}'`);
    db.close();

    const restored = new DatabaseSync(copy);
    try {
      const items = restored.prepare("SELECT * FROM inventory_items").all();
      const requests = restored.prepare("SELECT * FROM requests").all();
      const check = restored.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
      expect(items).toEqual([{ id: "i1", name: "Paracetamol 500mg" }]);
      expect(requests).toEqual([{ id: "r1", state: "submitted" }]);
      expect(check).toEqual([{ integrity_check: "ok" }]);
    } finally {
      restored.close();
    }
    expect(readdirSync(dir).sort()).toEqual(["cmis-auto-2026-09-22.db", "live.db"]);
  });
});
```

- [ ] **Step 5: Run both suites green**

Run: `pnpm --filter desktop test --run src/lib/backup-store.test.ts src/features/backup/data/backup-roundtrip.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/lib/backup-store.ts apps/desktop/src/lib/backup-store.test.ts apps/desktop/src/features/backup/data/backup-roundtrip.test.ts
git commit -m "feat(backup): machine-local store plus consistent-copy proof"
```

### Task 6: Background runner — hooks, banner, `__root.tsx` wiring

**Files:**
- Create: `apps/desktop/src/features/backup/hooks/use-backup-status.ts`
- Create: `apps/desktop/src/features/backup/hooks/use-daily-backup.ts`
- Create: `apps/desktop/src/features/backup/hooks/use-backup-files.ts`
- Create: `apps/desktop/src/features/backup/components/backup-warning-banner.tsx`
- Modify: `apps/desktop/src/routes/__root.tsx`

**Interfaces:**
- Consumes: `invoke` from `@/lib/tauri`; `isTauriRuntime` from `@/lib/open-external`; `getDb` from `@/lib/db`; `recordAudit` from `@/features/admin/audit/write-audit`; store (Task 5); naming/policy (Task 4); Rust `backup_default_dir`/`create_backup`/`list_backups`/`prune_backups` (Tasks 1–3).
- Produces: `useBackupStatus`, `useDailyBackup({runManualBackup, retry})`, `useBackupFiles`, `BackupWarningBanner`, `BackupFileInfo` TS type (shared shape below — duplicate it verbatim in each consumer, no barrel file).

```ts
export interface BackupFileInfo {
  kind: string;
  mtime: number;
  name: string;
  path: string;
  size: number;
}
```

- [ ] **Step 1: `use-backup-status.ts` — store-backed status**

```ts
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_BACKUP_STORE,
  loadBackupStore,
  saveBackupStore,
  type BackupStoreState,
} from "@/lib/backup-store";
import { isTauriRuntime } from "@/lib/open-external";

export function useBackupStatus() {
  const [status, setStatus] = useState<BackupStoreState>(DEFAULT_BACKUP_STORE);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!isTauriRuntime()) {
      setReady(true);
      return DEFAULT_BACKUP_STORE;
    }
    const next = await loadBackupStore();
    setStatus(next);
    setReady(true);
    return next;
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    setStatus(await saveBackupStore({ enabled }));
  }, []);

  const setKeep = useCallback(async (keep: number) => {
    setStatus(await saveBackupStore({ keep }));
  }, []);

  return { ready, reload, setEnabled, setKeep, status } as const;
}
```

- [ ] **Step 2: `use-backup-files.ts` — listing via `invoke`**

```ts
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { isTauriRuntime } from "@/lib/open-external";

export interface BackupFileInfo {
  kind: string;
  mtime: number;
  name: string;
  path: string;
  size: number;
}

export const BACKUP_FILES_KEY = "backup-files";

async function loadBackupFiles(): Promise<{ dir: string; files: BackupFileInfo[] }> {
  if (!isTauriRuntime()) return { dir: "", files: [] };
  const dir = await invoke<string>("backup_default_dir");
  const files = await invoke<BackupFileInfo[]>("list_backups", { dir });
  return { dir, files };
}

export function useBackupFiles() {
  return useQuery({
    placeholderData: (previous) => previous,
    queryFn: loadBackupFiles,
    queryKey: [BACKUP_FILES_KEY],
    retry: false,
    staleTime: 15_000,
  });
}
```

- [ ] **Step 3: `use-daily-backup.ts` — adopt-or-copy runner (F1, F2)**

```ts
import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";
import { loadBackupStore, saveBackupStore } from "@/lib/backup-store";
import { isTauriRuntime } from "@/lib/open-external";
import { invoke } from "@/lib/tauri";
import {
  autoBackupName,
  localDateKey,
  manualBackupName,
  resolveCollision,
} from "../data/backup-naming";
import { shouldRunDailyBackup } from "../data/backup-policy";
import { BACKUP_FILES_KEY, type BackupFileInfo } from "./use-backup-files";

const ROLLOVER_MS = 60_000;

async function auditBackup(detail: string): Promise<void> {
  try {
    await recordAudit(
      (await getDb()) as unknown as {
        execute: (sql: string, params?: unknown[]) => Promise<unknown>;
      },
      { action: "settings", detail, targetKind: "settings" },
      { bestEffort: true },
    );
  } catch {
    // best-effort: a backup that landed must not fail because its audit row did
  }
}

async function listToday(dir: string): Promise<BackupFileInfo[]> {
  return invoke<BackupFileInfo[]>("list_backups", { dir });
}

/** Adopt today's existing file (spec §7.4) or write it via `create_backup`. */
async function ensureAutoBackup(dir: string, today: string): Promise<BackupFileInfo> {
  const wanted = autoBackupName(today);
  const files = await listToday(dir);
  const existing = files.find((file) => file.name === wanted);
  if (existing) return existing;
  return invoke<BackupFileInfo>("create_backup", { destPath: `${dir}/${wanted}` });
}

export function useDailyBackup() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);

  const runOnce = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!isTauriRuntime() || inFlight.current) return;
      inFlight.current = true;
      try {
        const store = await loadBackupStore();
        if (!store.enabled) return;
        const today = localDateKey();
        const decision = shouldRunDailyBackup({
          enabled: store.enabled,
          hasDatabase: true,
          lastBackupDate: store.lastBackupDate,
          today,
        });
        if (!decision.run && !opts?.force) return;
        const dir = await invoke<string>("backup_default_dir");
        const info = await ensureAutoBackup(dir, today);
        const { keep } = await loadBackupStore();
        await invoke("prune_backups", { dir, keep });
        await saveBackupStore({
          lastBackupAt: new Date(info.mtime * 1000).toISOString(),
          lastBackupDate: today,
          lastBackupError: "",
          lastBackupPath: info.path,
        });
        await auditBackup(`Automatic backup written — ${info.name}`);
        await queryClient.invalidateQueries({ queryKey: [BACKUP_FILES_KEY] });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
          const dir = await invoke<string>("backup_default_dir").catch(() => "");
          await saveBackupStore({ lastBackupError: `${message} (tried ${dir || "the backup folder"})` });
        } catch {
          // the store itself is unavailable; the next launch retries
        }
      } finally {
        inFlight.current = false;
      }
    },
    [queryClient],
  );

  const runManualBackup = useCallback(async (): Promise<BackupFileInfo> => {
    const dir = await invoke<string>("backup_default_dir");
    const files = await listToday(dir);
    const name = resolveCollision(
      files.map((file) => file.name),
      manualBackupName(new Date()),
    );
    const info = await invoke<BackupFileInfo>("create_backup", { destPath: `${dir}/${name}` });
    await saveBackupStore({
      lastBackupAt: new Date(info.mtime * 1000).toISOString(),
      lastBackupError: "",
      lastBackupPath: info.path,
      lastManualAt: new Date().toISOString(),
    });
    await auditBackup(`Manual backup written — ${info.name}`);
    await queryClient.invalidateQueries({ queryKey: [BACKUP_FILES_KEY] });
    return info;
  }, [queryClient]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const timer = window.setTimeout(() => void runOnce(), 0);
    const interval = window.setInterval(() => void runOnce(), ROLLOVER_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [runOnce]);

  return { retry: () => runOnce({ force: true }), runManualBackup } as const;
}
```

- [ ] **Step 4: Banner + `__root.tsx` wiring (F6, D16)**

`backup-warning-banner.tsx`:

```tsx
import { Button } from "@cmis/ui/components/button";
import { TriangleAlert } from "lucide-react";
import { useBackupStatus } from "../hooks/use-backup-status";
import { useDailyBackup } from "../hooks/use-daily-backup";

/**
 * Persistent app-wide failure banner (spec F6): rendered at the shell level so
 * it is visible on every page. Dismissed only by a successful backup — there
 * is no close button. Success is silent, so this renders nothing then.
 */
export function BackupWarningBanner() {
  const { ready, status } = useBackupStatus();
  const { retry } = useDailyBackup();

  if (!ready || !status.lastBackupError) return null;
  return (
    <div
      className="flex items-center gap-3 border-[var(--warning)]/40 border-b bg-[var(--warning)]/10 px-3 py-2"
      role="alert"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Automatic backup failed — this device is unprotected. </span>
        <span className="text-muted-foreground">{status.lastBackupError}</span>
      </p>
      <Button onClick={() => void retry()} size="sm" variant="outline">
        Retry
      </Button>
    </div>
  );
}
```

In `apps/desktop/src/routes/__root.tsx`: call `useDailyBackup()` once inside `RootComponent` (after mount, never in `beforeLoad`), and render `<BackupWarningBanner />` directly under `<TitleBar>` in the non-docs branch (inside the outer column so it spans every page).

- [ ] **Step 5: Typecheck the new hooks**

Run: `pnpm --filter desktop check-types` (falls back to `tsc --noEmit` in `apps/desktop` if the script differs)
Expected: PASS for the new files (pre-existing errors elsewhere must not be introduced by this task — compare against the pre-change baseline if the command fails).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/backup/hooks apps/desktop/src/features/backup/components/backup-warning-banner.tsx apps/desktop/src/routes/__root.tsx
git commit -m "feat(backup): daily background runner plus failure banner"
```

### Task 7: Real Backup tab + `useSettings` cleanup

**Files:**
- Create (or replace contents of): `apps/desktop/src/features/backup/components/backup-tab.tsx`
- Modify: `apps/desktop/src/features/admin/settings/components/settings-page.tsx`
- Modify: `apps/desktop/src/features/admin/settings/hooks/use-settings.ts`
- Modify: `apps/desktop/src/features/admin/settings/types.ts`
- Modify: `apps/desktop/src/features/admin/settings/hooks/use-settings.test.ts`
- Modify: `apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx` (2 fixtures)
- Delete: `apps/desktop/src/features/admin/settings/components/backup-tab.tsx` (placeholder, superseded)

**Interfaces:**
- Consumes: `useBackupStatus`, `useBackupFiles`, `useDailyBackup().runManualBackup` (Task 6); `invoke`; `save` from `@tauri-apps/plugin-dialog`; `absoluteDateTime` from `features/admin/format`.
- Produces: `<BackupTab />` with no props (self-contained). `SettingsState` without `backup`.

- [ ] **Step 1: Replace `use-settings.ts` backup state and `types.ts`**

Delete `BackupSettings` from `types.ts` and the `backup` field from `SettingsState`. In `use-settings.ts`, delete `DEFAULT_SETTINGS.backup`, `triggerBackup`, `setBackupSchedule`, and their return entries.

- [ ] **Step 2: Update the two test fixtures that construct backup literally**

In `use-settings.test.ts`: delete the `expect(result.current.state.backup.lastBackupAt).toBeDefined()` line (and any `backup` fixture). In `stock-in-wizard.test.tsx` lines ~20 and ~136: delete the `backup: { … }` keys from both literals. Run both suites green before continuing:

Run: `pnpm --filter desktop test --run src/features/admin/settings/hooks/use-settings.test.ts src/features/inventory/components/stock-in-wizard.test.tsx`
Expected: PASS.

- [ ] **Step 3: Write the real tab (status, Back up now, Save a copy…, switch, retention, list)**

Key behaviours: `Back up now` calls `runManualBackup()` and toasts the real file name (or the real error); `Save a copy…` opens the native save dialog filtered to `.db` with a `cmis-manual-*` suggested name, then invokes `create_backup` at the chosen path and audits it; the folder path is the resolved `dir` from `useBackupFiles` with a copy-to-clipboard button; the auto-switch and retention count persist via `useBackupStatus`; the list shows every file newest-first with auto/manual label, date, size; empty state reads "No backups yet — one is made the next time you open the app."; header copy states the real rule "Runs once a day, the first time you open the app." No Restore buttons (Phase 2).

- [ ] **Step 4: Wire `settings-page.tsx` and delete the placeholder**

Render `<BackupTab />` (new path `@/features/backup/components/backup-tab`) for `tab === "backup"` with no props. Delete `apps/desktop/src/features/admin/settings/components/backup-tab.tsx`.

- [ ] **Step 5: Run the settings + backup suites**

Run: `pnpm --filter desktop test --run src/features/admin/settings src/features/backup`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/backup/components/backup-tab.tsx apps/desktop/src/features/admin/settings apps/desktop/src/features/inventory/components/stock-in-wizard.test.tsx
git commit -m "feat(backup): real backup tab replacing the placeholder"
```

### Task 8: File-based Health card + real Run-backup action

**Files:**
- Modify: `apps/desktop/src/features/admin/health/data/system-health.ts`
- Modify: `apps/desktop/src/features/admin/health/hooks/use-system-health.ts`
- Modify: `apps/desktop/src/features/admin/health/hooks/use-health.ts`
- Modify: `apps/desktop/src/features/admin/health/components/health-page.tsx`
- Modify: `apps/desktop/src/features/admin/settings/components/health-tab.tsx`

**Interfaces:**
- Consumes: `BackupFileInfo` shape; `loadSystemHealth(db)` gains an optional second parameter `BackupSummary` (defined below); `runManualBackup` from Task 6 for the action.
- Produces: backup card with `warn` status on failure, truthful captions, and a working action.

```ts
export interface BackupSummary {
  dir: string;
  error: string;
  files: { kind: string; mtime: number; name: string; size: number }[];
}
```

- [ ] **Step 1: Rebuild the backup card from files in `system-health.ts`**

Change the signature to `loadSystemHealth(db: DbLike, backup?: BackupSummary)`. Delete the `backupRows`/`newestBackup` `sqlite_master` query. Build the card as: no summary or zero files → `status: "ok"`, `metric: "—"`, `statusLabel: "No backup yet"`, caption `"No backups yet · next: the next time you open the app"`; files → metric = newest file's local date, caption = `"Newest <name> · <n> copies · <total size> · next: the next time you open the app"`; non-empty `error` → `status: "warn"`, `statusLabel: "Backup failed"`, caption carries the error. Keep the other four cards byte-identical.

- [ ] **Step 2: Merge the file summary in `use-system-health.ts`**

After `loadSystemHealth(await getDb())` resolves the DB-only cards, if `isTauriRuntime()`, `invoke backup_default_dir` + `list_backups`; on success rebuild just the backup card by calling `loadSystemHealth` with the summary (or export a `buildBackupCard(summary)` helper from `system-health.ts` and swap it in). On invoke failure, pass `{ dir: "", error: <message>, files: [] }` so the card warns. Non-Tauri: leave DB cards as-is (backup card shows the no-backup-yet state).

- [ ] **Step 3: Delete the placeholder branch and intercept the action in both pages**

Delete the `actionId === "trigger-backup"` branch in `use-health.ts`. In `health-page.tsx` and `health-tab.tsx` `handleAction`: if `action.id === "trigger-backup"`, `await runManualBackup()`, toast success naming the real file (or error with the real reason), and invalidate `["system-health", "backup-files"]` queries. All other actions keep the existing `runAction` path.

- [ ] **Step 4: Run health + backup suites**

Run: `pnpm --filter desktop test --run src/features/admin/health src/features/backup`
Expected: PASS (if a `system-health` test asserts the old `sqlite_master` metric or `daily 02:00` caption, update it to the file-based expectation in the same commit).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/admin/health
git commit -m "feat(backup): file-based health card with real backup action"
```

### Task 9: Full verification + manual pass

**Files:** none (verification only).

- [ ] **Step 1: Format and lint**

Run: `pnpm dlx ultracite fix` from repo root
Expected: clean; commit any autofixes separately as `style: ultracite autofix`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter desktop check-types`
Expected: PASS.

- [ ] **Step 3: Full frontend suite stays green**

Run: `pnpm --filter desktop test --run`
Expected: PASS — in particular `lib/db.test.ts`, `use-settings.test.ts`, `stock-in-wizard.test.tsx`, `import-card*` suites (Phase 1 must not change `.db` import behaviour).

- [ ] **Step 4: Rust compiles**

Run: `cargo check` in `apps/desktop/src-tauri`
Expected: PASS with a single `libsqlite3-sys 0.30.1` (`cargo tree -i libsqlite3-sys`).

- [ ] **Step 5: Manual pass (Windows first, then macOS) — spec §11 items 1–8**

1. Delete `cmis-backup.json`, launch → exactly one `cmis-auto-<today>.db` in Documents/CMIS Backups; no toast; tab shows it. 2. Three more launches same day → still one auto file. 3. Rewind `lastBackupDate` to yesterday, launch → today's file. 4. Plant twelve `cmis-auto-*.db` + launch on a new day → ten remain, oldest gone. 5. Plant `notes.db` + a `cmis-manual-*` file → both survive pruning. 6. Read-only folder → no `.partial` masquerading; persistent banner + Health warning on next launch. 7. Fix + Retry → banner clears, one file. 8. `Back up now` → `cmis-manual-*` file + toast naming it.

---

## Self-Review

- **Spec coverage:** F1 (Task 6 runner + Task 4 policy), F2 (60 s interval, Task 6), F3 (Tasks 1–2 + Task 4 naming), F4 (Tasks 3–4), F5 Back-up-now + Save-a-copy (Task 7; no reminders per D21), F6 (Task 6 banner), F8 (Task 5 store; schedule radios removed in Task 7), F9 tab + Health truthfulness (Tasks 7–8), audit-on-success (Tasks 6–7), G1/G2/G3/G6/G7/G8-partly. F7 pre-wipe, F10 restore, F11 first-launch prompt, and the Import-card reroute are Phase 2 — absent by design. Q1 resolved as specified (failures surface via banner + Health, not audit rows).
- **Placeholder scan:** no TBD/TODO; every step names exact files, commands, and expected outputs; error handling is specified inline (best-effort prune, best-effort audit, refused overwrites, `.partial` sweep).
- **Type consistency:** `BackupFileInfo` (`kind/mtime/name/path/size`) is defined verbatim in Tasks 1, 6, and 8; `BackupStoreState` keys match F8 (`enabled/keep/lastBackupAt/lastBackupDate/lastBackupPath/lastBackupError/lastManualAt`); `BackupSummary` in Task 8 reuses the same file shape.
