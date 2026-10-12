/**
 * CMIS Cloud Sync — adopting the cloud copy, and the backup that makes it safe.
 *
 * `docs/cloud-sync-data-guard-spec.md` §6.4 option 2 ("Use the cloud copy") and
 * §6.5 (the safety net). This is the only destructive sync path: the device's
 * synced tables are emptied and refilled from the cloud, so records that exist
 * only here are gone afterwards. The order below is the whole design:
 *
 * 1. **Back up first.** Every synced table is cloned with the app's existing
 *    snapshot pattern, so a mistaken choice is recoverable from the Status tab.
 *    If the backup throws, the caller never clears anything.
 * 2. **Clear, then refill.** The local tables are emptied (children first) and
 *    the full cloud copy is pulled from empty cursors, so the device mirrors the
 *    cloud exactly.
 * 3. **Reconcile the push cursors.** The rows just downloaded are not local
 *    edits; without moving the push cursors past them the next run would upload
 *    the mirror it just pulled.
 *
 * Metadata lives in `sync_state` (migration 0014) rather than in a new table, so
 * no migration is needed and there is no `migrations.lock` line to forget.
 */

import {
  backupSuffix,
  backupTableName,
  pruneBackups,
  snapshotTable,
} from "@/features/inventory/creation/snapshot";
import { writePushCursors } from "./offline-queue";
import {
  countRows,
  formatPushCursor,
  newestPushCursor,
  readStateValue,
  writeStateValue,
} from "./scan";
import { SYNC_TABLES } from "./schema";
import type { SyncDatabase, SyncTableName } from "./types";

const BACKUP_KEY = "backup_latest";

/** What the Status tab shows for the most recent automatic sync backup. */
export interface SyncBackupInfo {
  at: string;
  rows: number;
  suffix: string;
}

/** The value is untrusted disk state, so it is validated rather than cast. */
function parseBackup(raw: string | null): SyncBackupInfo | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SyncBackupInfo>;
    if (
      typeof parsed.suffix === "string" &&
      parsed.suffix !== "" &&
      typeof parsed.at === "string" &&
      typeof parsed.rows === "number"
    ) {
      return { at: parsed.at, rows: parsed.rows, suffix: parsed.suffix };
    }
  } catch {
    // A malformed value means "no backup", which is safer than crashing.
  }
  return null;
}

/**
 * Clones every synced table into a timestamped backup and records how big it
 * was. Prunes with the same retention as the import and vocabulary flows.
 */
export async function backupSyncedTables(
  db: SyncDatabase,
  now: Date = new Date()
): Promise<SyncBackupInfo> {
  const suffix = backupSuffix(now);
  let rows = 0;
  for (const spec of SYNC_TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: one snapshot per table; the whole point is that each one exists before anything is cleared
    await snapshotTable(db, spec.name, suffix);
    rows += await countRows(db, spec.name);
  }
  const info: SyncBackupInfo = { at: now.toISOString(), rows, suffix };
  await writeStateValue(db, BACKUP_KEY, JSON.stringify(info));
  await Promise.all(
    SYNC_TABLES.map((spec) => pruneBackups(db, `${spec.name}_backup`))
  );
  return info;
}

/** The most recent automatic sync backup, or `null` when there is none. */
export async function readLatestBackup(
  db: SyncDatabase
): Promise<SyncBackupInfo | null> {
  return parseBackup(await readStateValue(db, BACKUP_KEY));
}

/**
 * Empties every synced table and the tombstone log.
 *
 * Children are deleted before their parents so no foreign key is ever left
 * dangling mid-way. The tombstones the delete triggers write are cleared too:
 * the device is about to mirror the cloud, so a local delete log is exactly the
 * state that must not leak back up.
 */
export async function clearSyncedTables(db: SyncDatabase): Promise<void> {
  for (const spec of [...SYNC_TABLES].reverse()) {
    // biome-ignore lint/performance/noAwaitInLoops: children before parents, or a cascade makes the later deletes meaningless
    await db.execute(`DELETE FROM ${spec.name}`);
  }
  await db.execute("DELETE FROM sync_tombstones");
}

/**
 * Moves the push cursors past everything now in the local tables, so the copy
 * just pulled from the cloud is not mistaken for unsent local work.
 */
export async function reconcilePushCursors(db: SyncDatabase): Promise<void> {
  const rows: Partial<Record<SyncTableName, string>> = {};
  for (const spec of SYNC_TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: one cursor per table against a single key/value table
    rows[spec.name] = formatPushCursor(await newestPushCursor(db, spec.name));
  }
  // The tombstone log was just cleared, so any cursor is already "everything
  // sent"; `""` says that without inventing a timestamp for nothing.
  await writePushCursors(db, { deleted: "", rows });
}

/**
 * Copies a backup back over the live tables, replacing their contents.
 *
 * Returns `false` when there is no backup to restore. Clears the tombstone log
 * for the same reason `clearSyncedTables` does: the restored rows are the
 * truth, and a stale delete must not shadow them.
 */
export async function restoreSyncedTables(
  db: SyncDatabase,
  info?: SyncBackupInfo | null
): Promise<boolean> {
  const backup = info ?? (await readLatestBackup(db));
  if (!backup) {
    return false;
  }
  for (const spec of [...SYNC_TABLES].reverse()) {
    // biome-ignore lint/performance/noAwaitInLoops: children before parents
    await db.execute(`DELETE FROM ${spec.name}`);
  }
  for (const spec of SYNC_TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: parents before children, so every foreign key resolves
    await db.execute(
      `INSERT INTO ${spec.name} SELECT * FROM "${backupTableName(spec.name, backup.suffix)}"`
    );
  }
  await db.execute("DELETE FROM sync_tombstones");
  return true;
}
