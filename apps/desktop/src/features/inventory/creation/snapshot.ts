import type { DbLike } from "./db-like";

/**
 * Table snapshots — the app's substitute for a transaction.
 *
 * `tauri-plugin-sql` serves every statement from whichever connection the sqlx
 * pool has free, so `BEGIN`/`COMMIT` cannot span a write sequence from the
 * frontend (the long note in `import/import.ts` explains the failure mode). A
 * timestamped copy of the affected tables plus a restore-on-throw is what the
 * importer already does, so the creation flow reuses it rather than inventing a
 * second convention.
 *
 * These helpers used to live inside `import/import.ts`; they were moved here when
 * the creation page needed the same policy (spec §15.1 item 10: one retention
 * rule, not two).
 */

const KEEP_BACKUPS = 3;

/**
 * Backup tables are pruned in name order, so the timestamp leads. The random
 * tail matters: two writes inside the same millisecond would otherwise share a
 * name, and `CREATE TABLE IF NOT EXISTS` would silently keep the *stale*
 * snapshot — leaving a rollback with nothing to restore.
 */
export function backupSuffix(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export function backupTableName(table: string, suffix: string): string {
  return `${table}_backup_${suffix}`;
}

/**
 * Clones `table` into a timestamped backup so a failed write can be rolled back.
 *
 * `CREATE TABLE AS SELECT` needs its source to exist, and a fresh database has
 * no `inventory_items` yet, so the fallback clones the empty shape instead.
 */
export async function snapshotTable(
  db: DbLike,
  table: string,
  suffix: string
): Promise<string> {
  const backupTable = backupTableName(table, suffix);
  try {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS "${backupTable}" AS SELECT * FROM ${table}`
    );
  } catch {
    // fallback: create empty backup table from schema if source empty/missing
    await db.execute(
      `CREATE TABLE IF NOT EXISTS "${backupTable}" AS SELECT * FROM ${table} WHERE 1=0`
    );
  }
  return backupTable;
}

/**
 * Drops every `pattern` backup except the three newest, so a clinic that creates
 * stock monthly never accumulates snapshots. Returns how many were kept.
 */
export async function pruneBackups(
  db: DbLike,
  pattern: string
): Promise<number> {
  const rows = await db.select<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '${pattern}_%' ORDER BY name DESC`
  );
  if (rows.length <= KEEP_BACKUPS) {
    return rows.length;
  }
  // Independent DROP TABLEs — the order they land in cannot matter.
  await Promise.all(
    rows
      .slice(KEEP_BACKUPS)
      .map((row) => db.execute(`DROP TABLE IF EXISTS "${row.name}"`))
  );
  return KEEP_BACKUPS;
}

/**
 * Removes every row `table` gained since the snapshot — exact for insert-only
 * work, which is what a creation commit does.
 */
export async function restoreInsertedRows(
  db: DbLike,
  table: string,
  backupTable: string
): Promise<void> {
  await db.execute(
    `DELETE FROM ${table} WHERE id NOT IN (SELECT id FROM "${backupTable}")`
  );
}

/**
 * Copies the snapshot's values back over the named columns for rows the run
 * updated (a batch addition changes `qty`, `status`, `needs_batch`).
 */
export async function restoreUpdatedColumns(
  db: DbLike,
  table: string,
  backupTable: string,
  ids: string[],
  columns: readonly string[]
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const assignments = columns
    .map(
      (column) =>
        `${column} = (SELECT b.${column} FROM "${backupTable}" b WHERE b.id = ${table}.id)`
    )
    .join(", ");
  const marks = ids.map(() => "?").join(", ");
  await db.execute(
    `UPDATE ${table} SET ${assignments} WHERE id IN (${marks})`,
    ids
  );
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
