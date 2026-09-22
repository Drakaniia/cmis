# Spec — Database Backup & Restore (real, off-database, re-importable)

**Short name:** `backup-restore`
**Area:** `apps/desktop` — startup bootstrap, the first real Rust file/DB commands, the Settings → Backup tab, the System Health backup card, the Data page's import card, and `WipeDataCard`
**Status:** Draft, awaiting implementation
**Date:** 2026-09-22
**Phases:** Phase 1 — the real automatic backup (consistent copy, folder, retention, status, failure banner). Phase 2 — restore (verify, confirm, swap, restart, audit journal) and the Health/Import/Wipe wiring.
**Supersedes, in part:** the placeholder behaviour in `settings/components/backup-tab.tsx`, `health/hooks/use-health.ts` (`trigger-backup`) and `data/import-diff.ts` (".db backups are previewed only"). It does **not** supersede the in-database rollback snapshots (`inventory/creation/snapshot.ts`) — those serve a different purpose and stay.

---

## 1. The request, in the requester's words

> "the most importand aspect of this project is the backup, how can we impliment it, (im thinking when i open the app, it should automatically creatae a system copy of the system data of the dvice,, and this file is importable, or whats do you think for best or alternative solution)"

Read plainly: there is a Backup screen in Settings, and it does nothing. The requester wants a *real* copy of the device's data to exist without anyone remembering to make one, produced automatically when the app opens, in a file that the same app can read back. The parenthetical "or what do you think for best or alternative solution" invites the interview to fix the naive version of that idea, and the interview did:

- **Once per day, not once per launch.** A clinic that opens the app eight times in a morning should not collect eight identical copies.
- **A clean copy, not a file-system copy.** The live database is open and being written to; a plain `copy` can capture a half-written file. The copy is produced by asking SQLite itself.
- **Documents, not app data.** A backup that lives on the same disk, in the same folder as the thing it protects, is not a backup.
- **Restore is a verified, restarting operation.** The file is opened and integrity-checked *before* anything is touched, and a backup made by a newer app version is refused rather than trusted.

---

## 2. Current state — relevant findings

Numbered `B1…B13` for reference from the decisions and functional sections.

| # | Finding | Evidence |
|---|---------|----------|
| B1 | **Backup is a placeholder.** "Trigger Backup Now" calls `onTrigger()` (which only sets `lastBackupAt` in React state) and then toasts "Backup complete". The displayed location is the literal string `%APPDATA%/com.cmis.app/backups`, never resolved. | `settings/components/backup-tab.tsx`, `settings/hooks/use-settings.ts` (`triggerBackup`, `DEFAULT_SETTINGS.backup.path`) |
| B2 | **Nothing about settings is persisted.** `useSettings` is a plain `useState` with `DEFAULT_SETTINGS`; `lastBackupAt`, `nextRun` and `schedule` reset on every reload. | `settings/hooks/use-settings.ts` |
| B3 | **System Health's "Run backup" is a second placeholder** — it patches card state and reports "Written to appData/backups". The wording is false. | `health/hooks/use-health.ts` (`actionId === "trigger-backup"`) |
| B4 | **The Health backup card counts tables, not files.** Its metric is `SELECT name FROM sqlite_master WHERE name LIKE '%_backup_%'` — i.e. the in-database rollback snapshots. The card's "Save to appData/backups" framing has no file behind it. | `health/data/system-health.ts` (`backupRows`, `newestBackup`) |
| B5 | **The only real snapshots live inside the database.** `snapshotTable()` clones `inventory_items` / `inventory_batches` / `dispensing_events` into `*_backup_<ts>` tables and `pruneBackups()` keeps the last 3, so a failed import can be rolled back. A deleted/corrupt/lost `cmis.db` takes all of them with it. | `inventory/creation/snapshot.ts`, `inventory/import/import.ts`, `inventory/data/categories.ts` |
| B6 | **All app data is one SQLite file.** `DB_URL = "sqlite:cmis.db"`, opened by the SQL plugin from the frontend and preloaded in `tauri.conf.json`. Migrations 1–12 are registered in `lib.rs`. Tables: `inventory_items`, `inventory_batches`, `requests`, `request_history`, `request_notes`, `dispensing_records`, `dispensing_events`, `trash_records`, `audit_log`, `categories`, `app_meta`. | `lib/db.ts`, `src-tauri/src/lib.rs` (`db_migrations`), `src-tauri/tauri.conf.json` (`plugins.sql.preload`) |
| B7 | **`export_data` does not exist.** The Data page's Export card invokes it; the Rust `invoke_handler` registers only `save_stock_report_workbook` and `generate_stock_report_pdf`, so the invoke throws and the card silently falls back to a browser download. | `features/admin/data/components/export-card.tsx`, `src-tauri/src/lib.rs` |
| B8 | **The Import card previews `.db` and commits nothing.** `parseImportDiff` returns warnings including *"Restoring a backup replaces the current database entirely"* and *"This build previews .db backups only — nothing is written for them"*, then the confirm step toasts "Nothing imported". | `features/admin/data/import-diff.ts`, `components/import-card.tsx` (`handleConfirm`) |
| B9 | **`tauri-plugin-dialog` is installed and already used** (JS package, Rust crate, `dialog:default` capability) — `save` in `reports-page.tsx`. There is **no fs plugin**, so file I/O is Rust-command-shaped today. | `apps/desktop/package.json`, `src-tauri/Cargo.toml`, `capabilities/default.json`, `commands/reports.rs::save_stock_report_workbook` |
| B10 | **A real relaunch path already exists.** `tauri-plugin-process` is installed and `process:allow-restart` is granted (the updater uses it). | `capabilities/default.json`, `features/updater` |
| B11 | **Machine-local JSON storage exists.** `tauri-plugin-store` (`LazyStore`) is used for `updater.json` and `cmis.dat` — the natural home for settings that must survive a wipe or a restore. | `features/updater/updater-settings.ts`, `inventory/hooks/use-panel-ratio.ts` |
| B12 | **Startup work is `beforeLoad` on the root route** (the three backfills), which **blocks the first render**. Wrong place for work the interview decided must never block. | `routes/__root.tsx` (`beforeLoad`, `ensureStrengthBackfill` et al.) |
| B13 | **The destructive path already exists and is UI-gated**: `WipeDataCard` types `WIPE` to confirm and calls `wipeAllData()` (which clears inventory, requests, dispensing, Trash and re-seeds categories, and deliberately keeps `audit_log`). | `settings/components/wipe-data-card.tsx`, `lib/db.ts` |

---

## 3. Goals

- **G1 — A real copy exists without anyone deciding to make one.** Every calendar day that the app is opened, one complete copy of `cmis.db` is written off the live database.
- **G2 — The copy is guaranteed consistent.** It is produced by SQLite, not by a file-system copy, so it is a valid database even if a write was in flight.
- **G3 — The copy survives the machine.** It lands in a visible folder under Documents, where a USB stick or a synced folder can pick it up.
- **G4 — The copy is genuinely restorable.** The same app reads it back, verifies it first, and returns the device to that exact state.
- **G5 — A failure is impossible to miss.** A persistent in-app banner states that the device is currently unprotected, and the Health card reports the same fact.
- **G6 — The operator can see what exists.** The Backup tab lists every copy with its date and size, and can restore any one of them.
- **G7 — Old copies age out without deleting anything a person made.** A bounded retention keeps disk use predictable and never touches a file the app did not write.
- **G8 — The false surfaces stop lying.** The placeholder Backup tab, the Health card and its "Run backup" action, and the Import card's `.db` copy all tell the truth or do the real thing.
- **G9 — A mistake before an irreversible action is recoverable.** "Wipe All Data" writes a real off-database copy first.

## 4. Non-goals

- **N1 — No JSON export, no ZIP bundle, no encryption.** The artefact is a plain SQLite file (D1).
- **N2 — No second backup format.** The detailed, importable `.xlsx` from `docs/TODO.md` is a separate request with its own spec (D12).
- **N3 — No cloud, network, or sync upload.** The app remains local-only; nothing leaves the machine except by the operator's hand (D21). The "Sync" Health card stays honest about this.
- **N4 — No merge restore.** Restore replaces; there is no per-row reconciliation (D4).
- **N5 — No pre-restore safety copy.** Restore does not snapshot the database it is replacing (D4, D13). The protection is the integrity check and the confirmation, not a second file.
- **N6 — No in-app deletion of backups.** Pruning is automatic and pattern-scoped; deleting a specific file is the file manager's job (D15).
- **N7 — No backup scheduler.** No 02:00 timer, no cron-style runs. The trigger is "the app was opened on a new day" (D2, D23), and the Settings "Auto-schedule / weekly" control goes away.
- **N8 — No change to the in-database rollback snapshots.** `snapshotTable` / `pruneBackups` / `KEEP_BACKUPS = 3` and the import rollback path are untouched (B5).
- **N9 — No change to the inventory import path.** `.csv` / `.xlsx` imports, their diff preview and their confirmation are not modified; only the `.db` branch of that card changes.
- **N10 — No recovery of data from a copy that fails verification.** A file that is not a valid, complete CMIS database is refused; it is never partially imported.
- **N11 — No operator-role gating.** Backup and restore are available wherever Settings is available; this build has no user accounts.

---

## 5. Decisions taken in the interview

| ID | Decision | Value chosen |
|----|----------|--------------|
| D1 | Backup format | A **full copy of `cmis.db`** — a byte-level SQLite database file |
| D2 | Automatic trigger | **First launch of each calendar day** — not every launch |
| D3 | Backup scope | **The database only** — no UI preferences, no store files, no xlsx |
| D4 | Restore semantics | **Replace everything** — the copy becomes the device's data |
| D5 | Destination | **`<Documents>/CMIS Backups`** — a visible, user-reachable folder |
| D6 | Retention | **Keep the last N files, default 10** |
| D7 | Success notification | **Fully silent** — status lives on the Backup tab and Health card |
| D8 | Failure handling | **Persistent in-app banner + Health card warning** until a backup succeeds |
| D9 | Applying a restore | **Confirm, then restart the app immediately** |
| D10 | Version safety | **Refuse a backup whose schema is newer** than the running app |
| D11 | Restore entry point | **A dedicated Restore flow inside the Backup tab** |
| D12 | `.xlsx` export | **Out of scope** — it stays its own request (see `docs/TODO.md`) |
| D13 | Extra trigger | **Only before "Wipe All Data"** — no copy before ordinary imports or edits |
| D14 | How the copy is made | **Ask SQLite for a clean copy** — never a raw file copy, and no silent fallback to one |
| D15 | Backup list | **List every copy with a per-file restore action** — no in-app delete |
| D16 | Startup behaviour | **Never block** — the copy runs in the background after the UI appears |
| D17 | Default state | **On by default**, with an off switch in Settings |
| D18 | Manual copies | **Separate name prefix, never auto-deleted** |
| D19 | Audit | **Both backup and restore are written to `audit_log`** |
| D20 | Restore checks | **Verify before touching anything** — an invalid file is refused outright |
| D21 | Getting a copy off the device | **The operator's job, one deliberate path**: "Save a copy…". No reminders |
| D22 | Retention safety | **Only files matching the app's own naming pattern** may ever be deleted |
| D23 | Day rollover | **Take the copy on the rollover** — an app left open past midnight still gets its daily copy |
| D24 | Fresh install | **Offer a restore prompt on first launch** when the database is empty |

---

## 6. Functional specification

### F1 — The daily automatic backup

1. The app launches. The UI renders normally and is immediately usable (**D16**). No `beforeLoad` work, no startup gate (see B12).
2. Once the root component has mounted, a background task reads the machine-local backup settings (F8) and compares `lastBackupDate` with today's **local** date (`YYYY-MM-DD`).
3. If they match, nothing happens — no file, no network, no toast, no write.
4. If they differ (or `lastBackupDate` is unset), the task:
   1. resolves and creates `<Documents>/CMIS Backups` (F3);
   2. builds the target name `cmis-auto-<YYYY-MM-DD>.db` (F3);
   3. **if that file already exists**, adopts it — records its mtime as `lastBackupAt`, records today as done, and stops (idempotence, §7.4);
   4. otherwise asks SQLite for a consistent copy to a `.partial` path, then renames it into place (§8);
   5. on success, records `lastBackupAt` / `lastBackupDate` / `lastBackupPath` and writes an `audit_log` entry (**D19**);
   6. on failure, records `lastBackupError` and shows the banner (F6).
5. The whole task is fire-and-forget: nothing awaits it, and no failure of it can prevent the app from working.
6. It is suppressed entirely when `enabled` is false (F8), or when no database is behind the window (the browser preview / Vitest).

### F2 — Day rollover (D23)

A long-running session must not silently skip a day.

- A lightweight interval (60 s) re-runs the same date comparison as F1. When the local date changes, the daily backup runs.
- The interval is cleared on unmount, takes no opinion about connectivity, and does nothing when a run is already in flight or when today is already recorded.
- A single in-flight guard means the rollover check and the launch check can never produce two copies of the same day.

### F3 — Location, naming, and what a copy is called

- **Folder:** the OS Documents directory, subfolder `CMIS Backups`. Created on demand, never assumed to exist.
- **Automatic copy:** `cmis-auto-YYYY-MM-DD.db` (one per day; local date).
- **Manual copy ("Back up now"):** `cmis-manual-YYYY-MM-DD-HHmm.db`.
- **Pre-wipe copy (F7):** `cmis-manual-YYYY-MM-DD-HHmm.db` — the same manual prefix, because it is a deliberate, hand-triggered copy (**D18**, **D22**).
- **In-progress copy:** `cmis-auto-YYYY-MM-DD.db.partial`, renamed on success only. A `.partial` left behind by a killed process is swept on the next launch and is never treated as a backup.
- **Collisions** (two manual copies in the same minute) append `-2`, `-3`, … before `.db`. Nothing is ever overwritten.
- The live database is never written to by any backup path.

### F4 — Retention and pruning (D6, D22)

- After a successful automatic copy, the folder is pruned down to the newest **`keep`** files matching exactly `cmis-auto-*.db` (default 10).
- **Only** that pattern is eligible. `cmis-manual-*.db`, a hand-copied `cmis.db`, a file from another tool, and any `.partial` are ignored permanently — not "kept if convenient", but structurally invisible to the pruner.
- The file just written is never a pruning candidate.
- Ordering is by name, which for `YYYY-MM-DD` is chronological; the pruner does not trust mtimes (a copy dragged in from a USB drive carries whatever timestamps the filesystem gave it).
- Pruning is best-effort: a file that cannot be deleted (locked by a backup tool, permissions) is reported and skipped, and never turns a successful backup into a failure.
- `keep` is operator-configurable (1–100, default 10) in Settings.

### F5 — Manual backup, and taking a copy off the device (D18, D21)

- **"Back up now"** on the Backup tab performs the same consistent copy immediately, to the same folder, under the `cmis-manual-` prefix. It is *not* subject to "already backed up today". It reports success with the file name, or the real error — never a placeholder toast (contrast B1).
- **"Save a copy…"** opens the native save dialog (`tauri-plugin-dialog`, already installed per B9) so the operator can write a copy to a USB stick, a network share, or a cloud folder. The *destination* copy is written by the same consistent-copy routine; nothing about it is special-cased or converted.
- There is no reminder, no nag, and no "your last off-device copy was N days ago" prompt (**D21**). The Backup tab simply shows the date of the most recent `cmis-manual-` copy so the fact is visible when someone looks.

### F6 — Failure is loud (D8, D17)

- A failed automatic backup sets a persistent, app-wide **warning banner** — rendered at the app shell level so it is visible on every page, not only in Settings.
- The banner carries the real reason (e.g. "Access is denied" / "There is not enough space on the disk"), names the folder it tried to write to, and offers **Retry** (which re-runs F1 immediately, ignoring the once-per-day rule).
- The banner is dismissed only by a successful backup — not by a close button, not by navigating away, not by restarting into another failure.
- The System Health backup card simultaneously flips to `warn` with the same message (F9).
- **Success is silent** (**D7**): no toast on a successful daily copy, ever. The first backup the feature ever makes is also silent — its proof is the file, the Backup tab timestamp, and the Health card.

### F7 — Pre-wipe copy (D13)

- `WipeDataCard`'s typed-`WIPE` confirmation (B13) gains one step in front of `wipeAllData()`: write a `cmis-manual-*` copy first.
- If that copy **fails**, the wipe does **not** proceed; the error is surfaced, and the operator decides. Destroying data that has just been proven unrecoverable is worse than refusing the action.
- If the operator cancels the wipe, the copy has already been made. That is acceptable: it is a hand-triggered `cmis-manual-` file, so it is never pruned, and it is exactly the kind of artefact the feature exists to produce.
- This is the only additional trigger (**D13**). Ordinary imports, category changes and edits keep relying on the in-database snapshots (N8).

### F8 — Settings that are actually stored

The current `BackupSettings` (B1, B2) is replaced. Because it must be readable before the database is trusted and must survive both a wipe and a restore, it is stored **machine-locally** in a `cmis-backup.json` Tauri store (`LazyStore`, the pattern from B11) — not in `app_meta`, and not in React state.

| Key | Meaning |
|-----|---------|
| `enabled` | Automatic daily backup on/off. **Default `true`** (**D17**) |
| `keep` | Retention count for `cmis-auto-*.db`. Default `10` |
| `lastBackupAt` | ISO timestamp of the last successful copy of any kind |
| `lastBackupDate` | Local `YYYY-MM-DD` the automatic copy last ran — the once-per-day key |
| `lastBackupPath` | Absolute path of the last successful copy |
| `lastBackupError` | Message of the last failure, or empty. Its presence is what the banner reads |
| `lastManualAt` | ISO timestamp of the last `cmis-manual-` copy — what F5 shows |

The `schedule: "off" | "daily" | "weekly"` field and the "Next run (daily 02:00)" claim are removed along with the timer they implied (N7). In their place the tab states the real rule: **"Runs once a day, the first time you open the app."**

`BackupSettings` leaves `SettingsState`; `useSettings` loses `triggerBackup` and `setBackupSchedule`. Anyone reading `settings.state.backup` is updated in the same change (the test fixtures in `stock-in-wizard.test.tsx` and `use-settings.test.ts` both construct that object literally).

### F9 — The Backup tab, and the cards it replaces

**Settings → Backup** becomes the single real surface:

- **Status block** — "Last backup: today 09:14 / yesterday 09:14 / Never", the newest copy's file name and size, the number of copies kept, and the folder path (resolved and real — not the literal `%APPDATA%` string of B1), with a copy-to-clipboard affordance so it can be pasted into Explorer.
- **Actions** — "Back up now" (F5), "Save a copy…" (F5), "Restore from a backup…" (F10).
- **Automatic backups block** — an on/off switch and the retention count, both persisted (F8). No schedule radios.
- **Backup list** — every `cmis-*.db` in the folder, newest first: file name, date and time, size, and whether it is automatic or manual. Each row has a **Restore** action (**D15**). Empty state: "No backups yet — one is made the next time you open the app." There is no delete action (N6).
- The stale "Restore → Go to Import / Restore" link to `/admin/data` is replaced by the real Restore flow in place (**D11**).

**System Health** (B3, B4): the backup card is rebuilt from the *files*, via the same listing call — newest copy's date, number of copies, total size on disk. Its action becomes a real "Back up now" and its success/failure text reports what actually happened; the false "Written to appData/backups" string (B3) and the `sqlite_master`-table metric (B4) both go. The caption changes from the fictitious "next: daily 02:00" to the real rule ("next: the next time you open the app").

**Import card** (B8): the `.db` branch stops claiming it previews a restore. A `.db` chosen there is **routed to the real Restore flow**, pre-selecting the file (the card's copy for `.json` stays preview-only). The two warnings about restoring that no longer apply are corrected in `import-diff.ts`.

### F10 — Restore (D9, D10, D20)

Entry points: the Backup tab's Restore action (from a listed copy) and "Restore from a backup…" (native open dialog, filtered to `.db`, for a file on a USB stick).

1. **Inspect — before anything is touched** (**D20**). The chosen file is opened **read-only** and checked:
   - `PRAGMA integrity_check` must return `ok` (any other value → refuse);
   - it must contain the app's expected tables (`inventory_items`, `requests`, and friends, B6) — a random `.db` is not a CMIS backup;
   - its recorded schema version must not be **greater** than the running app's newest migration (**D10**).
2. **Refusals are specific, and nothing is modified.** Each failure reports which check failed and what it means: "This file is not a CMIS backup", "This backup is damaged (integrity check failed)", "This backup was made by a newer version of CMIS — update the app first". The current database is untouched in every refuse path.
3. **Confirm.** The dialog states plainly what is about to happen, in the words the import card already uses (B8): restoring replaces the current database entirely, and any change recorded since the chosen copy will be lost. Confirmation is the existing typed-confirm idiom (`RESTORE`), matching `WipeDataCard`'s `WIPE` (B13). The file's name, date and size are shown. No row counts and no content preview (see §14 Q4).
4. **Apply, then restart immediately** (**D9**):
   1. the frontend closes the SQL plugin connection;
   2. Rust copies the source to a temporary file beside the live database, then **removes the live `cmis.db-wal` and `cmis.db-shm` sidecars**, then renames the temporary file over `cmis.db` (§9). Copy-plus-rename means a failure can never leave a half-swapped database;
   3. Rust writes a **restore journal** recording the source file, the operator, the app version and the timestamp;
   4. the app calls `relaunch()` (B10) and the restored database opens normally, running any migrations the current version still needs.
5. **If the swap cannot be performed** (the live file is locked by another process), the restore is **not** half-applied: the error is reported with its real reason, the app does **not** restart, and the operator is told to close other CMIS windows and try again.
6. **The audit entry survives the swap** (**D19**). An `audit_log` row cannot be written before the swap (it lives in the database being replaced), so on the next launch — after the database is open and migrations have run — the pending journal is consumed and one `audit_log` entry is written into the *restored* database: "Restored database from `<file>`", naming the operator. The journal is then deleted. A journal that cannot be parsed is reported and deleted; it never blocks startup.
7. **Backups are audited too** (**D19**): each successful automatic copy, each "Back up now", each "Save a copy…" and each pre-wipe copy writes one `audit_log` row. (The row is necessarily written *after* the copy it describes, so a given backup does not contain evidence of itself. That is correct, not a bug — the file is a snapshot of the moment.)

### F11 — Fresh install (D24)

When the app starts with an **empty database on the current version** (no inventory items, no requests, no dispensing events — a genuine first run, not a wipe), the Backup tab's Restore action is surfaced as a first-run prompt: "Restoring from a backup? Choose a file, or skip." Skipping is a real option and never returns. On a database that merely *looks* empty because it was wiped, the prompt does not appear.

---

## 7. Data and behaviour details

### 7.1 What "today" means

The local calendar date (`YYYY-MM-DD` from the machine's local time), not UTC. A clinic in one timezone gets a copy per local day regardless of the machine's offset, and a DST changeover cannot produce two copies or none.

### 7.2 The machine-local state is not the database

`lastBackupDate` lives in `cmis-backup.json` (F8) precisely because the database is the thing being protected: a wipe that resets settings, or a restore that replaces the database wholesale, must not reset the *machine's* record of when it last wrote a copy. A wiped clinic will therefore still see an accurate "last backup" line and still get exactly one copy that day.

### 7.3 Interaction with `Wipe All Data`

`wipeAllData()` already clears `cmis-*` localStorage keys and (with `resetSettings`) `app_meta` and the categories table. It does **not** touch `cmis-backup.json`; the backup log is a device fact, not clinic data. The pre-wipe copy happens before any of this (F7).

### 7.4 Idempotence and adoption

The name `cmis-auto-<date>.db` is the primary key of "have we done today". If the folder already holds today's file — because the store was cleared, or the folder is shared, or a previous run recorded nothing — the run **adopts** that file instead of writing a second one, and records its modification time as `lastBackupAt`. The outcome is exactly one automatic copy per day even when state is lost.

### 7.5 A killed process

Because the copy is written to `.partial` and renamed only on success, an interrupted run leaves no file that could be mistaken for a backup. `.partial` files are swept at the next launch and never counted, listed, pruned or restored.

### 7.6 Preview and test environments

The browser preview (`import.meta.env.DEV` without Tauri, per `lib/db.ts`) and Vitest have no Tauri filesystem, no Rust commands and no real Documents folder. In those environments the backup layer is inert: no folder lookups, no writes, no banner, no list. The date/retention/naming logic stays in pure modules so it is tested directly rather than through a mocked filesystem (§11).

---

## 8. How the copy is made — consistent by construction (D14)

A plain `std::fs::copy` of a database that the app is actively writing to can capture a torn page set, and — if the database is in WAL mode — will miss the `-wal` sidecar entirely, producing a file that opens but is silently missing the most recent writes. That risk is the whole reason **D14** exists.

- The copy is produced by **SQLite itself**: `VACUUM INTO '<target>'`, which writes a complete, defragmented, transactionally-consistent database at the target path, or by SQLite's online backup API. The copy runs against the live connection while the app continues to work.
- **No silent fallback.** If the consistent copy cannot be produced, the backup **fails** and reports it (F6). Copying a possibly-torn file and calling it a backup is precisely the failure this feature exists to prevent.
- `VACUUM INTO` refuses to overwrite an existing file, which lines up with the never-overwrite rule in F3: the naming step guarantees the target does not exist, and a collision is resolved by the naming step, not by the copy.
- The target directory must exist first (`create_dir_all`), and the target must not be inside a path SQLite is holding open.
- The resulting file is a normal SQLite database with SQLite's default page settings — the restored app re-runs migrations against it like any other database.

**Where the statement runs.** Preferred: the existing `tauri-plugin-sql` connection the frontend already holds (`VACUUM INTO` accepts an absolute path literal; quote escaping is handled by the caller). If the plugin's statement handling refuses `VACUUM` (it must not run inside a transaction), the command moves into Rust: add `sqlx` with the `sqlite` feature — **matching the version `tauri-plugin-sql` 2.4 already pulls in**, so a second `libsqlite3-sys` is not linked — and run the same statement (or the backup API) there. Either path satisfies D14; the second one keeps the whole file operation in Rust, which is also where `resolve`/`list`/`prune` live.

---

## 9. Rust commands, and the restore swap

All file and database-path work moves behind a small set of commands in a new `src-tauri/src/commands/backup.rs`, registered in `commands/mod.rs` and added to `invoke_handler`. This mirrors the existing shape of `reports.rs` (**B9**: Rust writes; the frontend decides policy) and keeps path resolution and `documents_dir()` handling in one place.

| Command | Purpose | Returns |
|---------|---------|---------|
| `backup_default_dir` | Resolve and `create_dir_all` `<Documents>/CMIS Backups` | Absolute path |
| `backup_live_db_path` | Resolve `<app_data>/cmis.db` (and its expected sidecars) | Absolute path |
| `create_backup(dest_path)` | Produce a **consistent** copy at `dest_path` via `.partial` + rename (§8). Never overwrites | `BackupFileInfo` (name, size, mtime) |
| `inspect_backup(path)` | Read-only open: `integrity_check`, expected-table presence, recorded app/schema version | `BackupInspection` (ok / reason, version, size, mtime) |
| `list_backups(dir)` | Every `cmis-*.db` with size, mtime and kind (`auto` \| `manual`) | `BackupFileInfo[]` |
| `prune_backups(dir, keep)` | Delete only `cmis-auto-*.db` beyond the newest `keep`; sweep `.partial` | `string[]` (removed names) |
| `apply_restore(source_path)` | Temp copy → remove `-wal`/`-shm` → rename over `cmis.db` → write the restore journal | Path written |
| `consume_restore_journal()` | Called at startup after the database opens: hand back the pending restore record once | Optional journal |

**Version stamping.** So that a backup can describe its own origin (F10 step 1), the app writes two keys into `app_meta` on every launch: the app version and the current schema version (`MAX(version)` from `_sqlx_migrations`, falling back to the presence of `inventory_items`). `inspect_backup` reads those keys. A database from before this change simply reports "unknown" and is accepted unless its tables are wrong.

**Startup order.** In `lib.rs`'s `setup`, before the window is shown: sweep stray `.partial` files, and resolve any pending restore journal so the frontend can consume it once the database is open. Neither step can fail the launch — both are best-effort with logged warnings, matching how `setup_native_menu` failures are already handled.

**Capabilities.** No new plugin permissions are required: custom commands are not permission-gated in Tauri 2, `dialog:default` is already granted for the F5/F10 dialogs, and `process:allow-restart` is already granted for the relaunch (**B9**, **B10**). The only capability question is the `VACUUM INTO` placement in §8 — if the statement runs through the SQL plugin rather than Rust, `sql:allow-load` may also be needed for the read-only inspection connection.

---

## 10. Settings, files and copies touched

**New**
- `src-tauri/src/commands/backup.rs` — the commands in §9
- `apps/desktop/src/features/backup/` — `data/backup-naming.ts` (names, dates, collision rule), `data/backup-retention.ts` (which files the pruner may delete), `data/backup-inspection.ts` (verdict → operator-facing message), `data/backup-policy.ts` (should-this-launch-back-up), `data/restore-journal.ts` (parse/serialize), `hooks/use-backup-status.ts`, `hooks/use-daily-backup.ts`, `hooks/use-backup-files.ts`, `components/backup-tab.tsx`, `components/backup-warning-banner.tsx`, `components/restore-dialog.tsx`
- `apps/desktop/src/lib/backup-store.ts` — the `cmis-backup.json` `LazyStore` accessor (F8)

**Changed**
- `src-tauri/src/lib.rs` — `invoke_handler`, startup sweep + journal, `app_meta` version stamp
- `src-tauri/src/commands/mod.rs` — register the module
- `src-tauri/Cargo.toml` — `sqlx` (sqlite) only if §8's fallback is taken
- `routes/__root.tsx` — the background launch hook (F1) + the warning banner (F6); explicitly **not** in `beforeLoad` (B12)
- `features/admin/settings/components/backup-tab.tsx` — the placeholder (B1) is replaced by the real tab (F9)
- `features/admin/settings/hooks/use-settings.ts`, `settings/types.ts` — `BackupSettings` leaves `SettingsState` (F8)
- `features/admin/settings/components/wipe-data-card.tsx` — pre-wipe copy (F7)
- `features/admin/settings/components/data-tab.tsx` / `settings-page.tsx` — the Backup tab's props change with F8
- `features/admin/health/data/system-health.ts`, `features/admin/health/hooks/use-health.ts` — the backup card is file-based and its action is real (B3, B4, F9)
- `features/admin/data/components/import-card.tsx`, `features/admin/data/import-diff.ts` — the `.db` branch routes to the real flow; the "preview only" copy goes (B8, F9)
- `features/admin/data/types.ts` — `ImportDiff`'s `.db` shape if the routing changes it
- `lib/db.ts` — a `closeDb()` export for the swap, and the resolved-backup-folder helper if the tab needs it
- `features/help` content — the Backup help section states the real rule (once a day, on first open; where the files are; how to restore), in place of the current fictional schedule

**Untouched** — `inventory/creation/snapshot.ts` and every in-database rollback path (N8); the `.csv`/`.xlsx` import path (N9); the stock-report export and PDF writers; migrations 1–12 (no schema change is needed — the backup is a file copy, not a schema feature).

---

## 11. Verification

### Automated
- **Pure unit tests** for the policy layer, in the existing `*.test.ts` style: `backup-naming.ts` (local-date names, collision suffixes, `.partial` names), `backup-retention.ts` (keep-N over `cmis-auto-*`, ordering by name, manual files structurally ineligible, the just-written file never a candidate), `backup-policy.ts` (same day → skip; new day → run; disabled → skip; error recorded), `restore-journal.ts` (round-trip, malformed input), `backup-inspection.ts` (each verdict → its message, including newer-schema and damaged).
- **A real-engine round trip**, in the spirit of `august-2026-import.test.ts` (which runs against a real SQLite engine): create a database, insert known inventory + request + dispensing rows, produce a consistent copy, then open the copy and assert every row matches, and that `integrity_check` returns `ok`. This is the test that proves G2 and G4 together, and is worth more than any mock.
- **A negative test**: a deliberately damaged file (truncated bytes) is refused by inspection, and the live database is byte-identical afterwards.
- **Existing suites stay green** — in particular `lib/db.test.ts` (wipe order and the audit entry), `settings/hooks/use-settings.test.ts` and `stock-in-wizard.test.tsx` (both construct `BackupSettings` literally and must be updated with F8), `import-card.test.tsx` / `import-card.confirm.test.tsx` (the `.db` preview assertions change), and the health/system-health tests.

### Manual (Windows and macOS, since both paths are filesystem-sensitive)
1. Delete `cmis-backup.json`, launch → exactly one `cmis-auto-<today>.db` appears in Documents/CMIS Backups; no toast; the Backup tab shows it.
2. Launch three more times the same day → still exactly one automatic file.
3. Rewind `lastBackupDate` to yesterday, launch → a new file for today.
4. Plant twelve `cmis-auto-*.db` files, launch a new day → the oldest is gone, ten remain.
5. Plant a hand-made `notes.db` and a `cmis-manual-*` file in the same folder → both survive pruning untouched.
6. Kill the app during a copy (or make the folder read-only) → no `.partial` masquerading as a backup; the persistent banner appears on the next launch and the Health card shows a warning.
7. Fix the cause and Retry → banner clears, one file exists.
8. Files → "Back up now" → a `cmis-manual-*` file appears; the toast names it.
9. "Save a copy…" → write to a USB stick; open that file elsewhere; restore from it.
10. Restore from the newest automatic copy → typed confirmation → the app restarts → the data is from that snapshot, and the audit log contains one "Restored database from …" entry **written after** the swap.
11. Restore from a file made by a newer app version → refused, current data untouched, no restart.
12. Restore from a truncated file → refused with the integrity message, current data untouched.
13. Settings → Data → "Wipe All Data" (typed) → a `cmis-manual-*` copy exists immediately before the wipe, and the wipe proceeds.
14. Delete `cmis-backup.json` **and** point the backup folder at a read-only location → the wipe is **stopped** by the failed pre-wipe copy (F7).

---

## 12. Phased plan

**Phase 1 — the copy (G1, G2, G3, G6, G7, G8 partly)**
1. Rust: `backup_default_dir`, `backup_live_db_path`, `create_backup`, `list_backups`, `prune_backups` (§8, §9). Validate the consistent-copy mechanism on Windows first — it is the only genuinely uncertain piece.
2. TS: the pure policy layer (`backup-naming`, `backup-retention`, `backup-policy`) with its tests.
3. TS: `lib/backup-store.ts` (F8) and the background launch hook + 60 s rollover check (F1, F2), wired in `routes/__root.tsx` — after mount, never in `beforeLoad`.
4. UI: the real Backup tab (status, actions, list, switch, retention) replacing the placeholder (F9).
5. UI: the failure banner at shell level (F6) and the rebuilt Health card (F9).
6. Audit entries for successful copies (F10 step 7).

**Phase 2 — the restore (G4, G5, G9)**
7. Rust: `inspect_backup`, `apply_restore`, `consume_restore_journal`, plus the `app_meta` version stamp and the startup sweep/journal handling.
8. TS: the restore dialog (inspect → refuse-or-confirm → swap → relaunch) and the journal consumer that writes the surviving audit entry (F10).
9. `WipeDataCard`'s pre-wipe copy, including the "copy failed, so the wipe did not run" path (F7).
10. Re-route the Import card's `.db` branch into the real flow and correct its copy (B8, F9).
11. The first-launch restore prompt (F11) and the help docs.

Each phase leaves the app fully working: Phase 1 alone delivers a real, off-database, daily backup; Phase 2 makes it readable back.

---

## 13. Why this shape, briefly

- **The copy is the product.** Everything else — listing, pruning, banners — exists to make the copy trustworthy and visible. That is why D14 (consistent copy, no fallback) is the one decision that must not be softened during implementation.
- **Once a day on first open** matches how the app is actually used (a clinic opens it in the morning) and keeps the folder readable: a month of history, not a folder full of near-identical files.
- **Documents** is the compromise between hidden-but-ignored (app data) and safe-but-unasked (a configured network share). It needs no permission prompt, it is where a person would look for a document, and one "Save a copy…" is what actually gets data off the machine.
- **Keep 10 by pattern** is a retention rule an implementer cannot get dangerously wrong: names are the order, only the app's own files are eligible, the newest is never a candidate, and a failed delete is never fatal.
- **Restore refuses rather than repairs.** There is no merge, no partial import, and no "best effort". A restore either replaces the database with a verified file or changes nothing at all.

---

## 14. Open questions (not resolved in the interview)

| # | Question | Current lean |
|---|----------|--------------|
| Q1 | Should a *failed* backup also write an audit row, or is the persistent banner + Health warning enough? | The banner and the Health card feel sufficient; auditing failures daily could produce a large, low-signal log. |
| Q2 | Should the destination folder ever be configurable (a Settings path, or a "Change folder" action), given a network folder or a second disk is the real disaster-recovery answer? | Not in this spec — F3 fixes Documents (D5, D21). A folder picker is the obvious follow-up. |
| Q3 | Should "Save a copy…" also be offered from the app menu (File → Save a Backup Copy…) with a mirrored native-menu item, as `stock-report-export` did for its export? | Probably yes for consistency, but it adds a third place to keep menu ids in sync. |
| Q4 | The restore confirmation deliberately shows only the file name, date and size (D20). Should it also show the row counts the inspection already reads — e.g. "412 medicines · 1,208 dispensing records"? | Low cost and it helps pick the right snapshot; it was declined in the interview, so it needs a decision rather than an implementation choice. |
| Q5 | Should the daily backup run when the operator has opened the app but the database is empty (a first run before any data exists)? | Harmless but pointless; an empty database is cheap either way. |
| Q6 | Should a `.partial` file left behind be reported in the Health card, or silently swept? | Silently swept, since a killed copy is unremarkable. |
| Q7 | Does the pre-wipe copy need to be distinguishable in the list from an operator's manual copy (e.g. a `kind: "pre-wipe"` label using the same prefix)? | The list already shows date and size; a label would make the reason visible, which may matter during an incident review. |
