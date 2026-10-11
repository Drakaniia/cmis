/**
 * CMIS Cloud Sync — reading and applying change sets.
 *
 * This is the layer both ends share: the desktop client runs it against its
 * SQLite handle, the Worker runs the identical code against D1. Every write is
 * guarded by `conflict-resolver`, so "who wins" has exactly one implementation,
 * and every statement is built from `PRAGMA table_info` rather than from a
 * hand-written column list — a payload cannot name a column this database does
 * not have, and a future migration that adds a column does not have to be
 * remembered here.
 *
 * Placeholders are `?` (not `$1`): that is the one spelling accepted by all
 * three engines this runs on — `tauri-plugin-sql`'s sqlx pool, D1's `bind()`,
 * and `node:sqlite` in the tests.
 */

import { decideIncomingDelete, decideIncomingRow } from "./conflict-resolver";
import { isSafeIdentifier, syncTableSpec } from "./schema";
import type {
  SyncApplyOutcome,
  SyncDatabase,
  SyncDelete,
  SyncRow,
  SyncTableName,
} from "./types";

/** `PRAGMA table_info` is cached per table: the schema does not change at runtime. */
const columnCache = new Map<string, Promise<string[]>>();

export function resetColumnCacheForTests(): void {
  columnCache.clear();
}

/** The live columns of a synced table, in declaration order. */
export function tableColumnNames(
  db: SyncDatabase,
  table: SyncTableName
): Promise<string[]> {
  const cached = columnCache.get(table);
  if (cached) {
    return cached;
  }
  const spec = syncTableSpec(table);
  if (!(spec && isSafeIdentifier(table))) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const pending = db
    .select<{ name: string }[]>(`PRAGMA table_info(${table})`)
    .then((rows) => rows.map((row) => row.name))
    .catch((error) => {
      columnCache.delete(table);
      throw error;
    });
  columnCache.set(table, pending);
  return pending;
}

async function writableColumns(
  db: SyncDatabase,
  table: SyncTableName,
  row: SyncRow
): Promise<string[]> {
  const spec = syncTableSpec(table);
  if (!spec) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const live = await tableColumnNames(db, table);
  const excluded = new Set(spec.applyExcludeColumns);
  const columns = live.filter(
    (column) =>
      column in row && !excluded.has(column) && isSafeIdentifier(column)
  );
  // The change timestamp is not optional: it is what makes the row orderable on
  // the other device. A payload that omitted it still lands in the timeline.
  if (live.includes("updated_at") && !columns.includes("updated_at")) {
    columns.push("updated_at");
  }
  return columns;
}

/** The effective change timestamp of one local row, or `null` when it is gone. */
async function readLocalTimestamp(
  db: SyncDatabase,
  table: SyncTableName,
  rowKey: string
): Promise<{ exists: boolean; updatedAt: string | null }> {
  const spec = syncTableSpec(table);
  if (!spec) {
    return { exists: false, updatedAt: null };
  }
  const rows = await db.select<{ ts: string | null }[]>(
    `SELECT ${spec.updatedAtSql()} AS ts FROM ${table}
      WHERE ${spec.rowKeySql()} = ?
      LIMIT 1`,
    [rowKey]
  );
  if (rows.length === 0) {
    return { exists: false, updatedAt: null };
  }
  return { exists: true, updatedAt: rows[0].ts };
}

async function readTombstone(
  db: SyncDatabase,
  table: SyncTableName,
  rowKey: string
): Promise<string | null> {
  const rows = await db.select<{ deleted_at: string }[]>(
    "SELECT deleted_at FROM sync_tombstones WHERE table_name = ? AND row_key = ?",
    [table, rowKey]
  );
  return rows[0]?.deleted_at ?? null;
}

async function forgetTombstone(
  db: SyncDatabase,
  table: SyncTableName,
  rowKey: string
): Promise<void> {
  await db.execute(
    "DELETE FROM sync_tombstones WHERE table_name = ? AND row_key = ?",
    [table, rowKey]
  );
}

async function writeRow(
  db: SyncDatabase,
  table: SyncTableName,
  row: SyncRow,
  rowKey: string,
  updatedAt: string
): Promise<void> {
  const spec = syncTableSpec(table);
  if (!spec) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const columns = await writableColumns(db, table, row);
  const values = columns.map((column) =>
    column === "updated_at" ? updatedAt : row[column]
  );
  const placeholders = columns.map(() => "?").join(", ");
  const names = columns.join(", ");

  if (spec.keyColumn === null) {
    // A content-keyed child row: replace whatever currently matches the key.
    // The AUTOINCREMENT `id` is excluded (see `applyExcludeColumns`), so the
    // rowid stays local and two devices cannot fight over it.
    await db.execute(`DELETE FROM ${table} WHERE ${spec.rowKeySql()} = ?`, [
      rowKey,
    ]);
    await db.execute(
      `INSERT INTO ${table} (${names}) VALUES (${placeholders})`,
      values
    );
    return;
  }

  const mutable = columns
    .filter((column) => column !== spec.keyColumn)
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  const conflict = mutable === "" ? " DO NOTHING" : ` DO UPDATE SET ${mutable}`;
  await db.execute(
    `INSERT INTO ${table} (${names}) VALUES (${placeholders})
       ON CONFLICT(${spec.keyColumn})${conflict}`,
    values
  );
}

/**
 * Applies incoming rows, one guarded write each.
 *
 * Returns what happened rather than throwing on a conflict: a rejected row is a
 * normal outcome of a sync, and the caller reports the count and logs the
 * detail.
 */
export async function applyRows(
  db: SyncDatabase,
  table: SyncTableName,
  rows: SyncRow[]
): Promise<SyncApplyOutcome> {
  const spec = syncTableSpec(table);
  if (!spec) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const outcome: SyncApplyOutcome = { applied: 0, conflicts: [], skipped: 0 };
  for (const row of rows) {
    const rowKey = spec.rowKey(row);
    const incoming = spec.effectiveUpdatedAt(row);
    if (rowKey === "" || incoming === null) {
      outcome.skipped += 1;
      continue;
    }
    // A child row whose parent is not here yet cannot be inserted (its foreign
    // key would fail). Parents are applied first within one pull, so this is only
    // reached when the parent is genuinely absent — a delete this device made,
    // or a page boundary. Skipping keeps the pull going; the overlap window in
    // `scan.ts` brings the row back once its parent has landed.
    if (spec.parent) {
      const parentKey = row[spec.parent.column];
      if (parentKey === null || parentKey === undefined || parentKey === "") {
        outcome.skipped += 1;
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: rows are applied one at a time on purpose — each write's conflict guard reads what the previous row left behind, and a child can only be checked once its parent is in place
      const parent = await db.select<{ present: number }[]>(
        `SELECT 1 AS present FROM ${spec.parent.table} WHERE id = ? LIMIT 1`,
        [parentKey]
      );
      if (parent.length === 0) {
        outcome.skipped += 1;
        continue;
      }
    }
    const local = await readLocalTimestamp(db, table, rowKey);
    const tombstoneDeletedAt = await readTombstone(db, table, rowKey);
    const decision = decideIncomingRow({
      incomingUpdatedAt: incoming,
      localExists: local.exists,
      localUpdatedAt: local.updatedAt,
      rowKey,
      table,
      tombstoneDeletedAt,
    });
    if (!decision.write) {
      outcome.skipped += 1;
      if (decision.conflict) {
        outcome.conflicts.push(decision.conflict);
      }
      continue;
    }
    await writeRow(db, table, row, rowKey, incoming);
    // A live row and a tombstone for the same key cannot coexist: this is what
    // stops an adopted row from being deleted again by the tombstone that
    // raced it.
    await forgetTombstone(db, table, rowKey);
    outcome.applied += 1;
  }
  return outcome;
}

/**
 * Applies incoming deletes.
 *
 * The local delete fires migration 0014's tombstone trigger; the tombstone it
 * writes is then replaced with the *incoming* timestamp, so this device's
 * timeline records when the record was really removed rather than when it heard
 * about it. Without that, a device that had been offline for a week would look
 * like it deleted everything a minute ago and would win every conflict.
 */
export async function applyDeletes(
  db: SyncDatabase,
  table: SyncTableName,
  deletes: SyncDelete[]
): Promise<SyncApplyOutcome> {
  const spec = syncTableSpec(table);
  if (!spec) {
    throw new Error(`unknown sync table: ${table}`);
  }
  const outcome: SyncApplyOutcome = { applied: 0, conflicts: [], skipped: 0 };
  for (const entry of deletes) {
    // biome-ignore lint/performance/noAwaitInLoops: deleting a parent removes its children through the foreign key, so the deletes must be applied in the order given
    const local = await readLocalTimestamp(db, table, entry.rowKey);
    const decision = decideIncomingDelete({
      deletedAt: entry.deletedAt,
      localExists: local.exists,
      localUpdatedAt: local.updatedAt,
      rowKey: entry.rowKey,
      table,
    });
    if (decision.conflict) {
      outcome.conflicts.push(decision.conflict);
    }
    if (!decision.write) {
      outcome.skipped += 1;
      continue;
    }
    await db.execute(`DELETE FROM ${table} WHERE ${spec.rowKeySql()} = ?`, [
      entry.rowKey,
    ]);
    await forgetTombstone(db, table, entry.rowKey);
    await db.execute(
      `INSERT INTO sync_tombstones (table_name, row_key, deleted_at, device_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(table_name, row_key) DO UPDATE SET
         deleted_at = excluded.deleted_at,
         device_id  = excluded.device_id`,
      [table, entry.rowKey, entry.deletedAt, entry.deviceId ?? null]
    );
    outcome.applied += 1;
  }
  return outcome;
}
