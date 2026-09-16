import {
  backupSuffix,
  pruneBackups,
  snapshotTable,
} from "../creation/snapshot";
import {
  allIdentityKeys,
  identityKey,
  identityKeysOf,
  legacyIdentityKey,
} from "../domain/identity";
import { isDetailsIncomplete, strengthLabel } from "../domain/strength";
import { guessCategory } from "./category-mapper";
import { parseInventoryCsv } from "./csv-parser";
import { deriveStatus } from "./inventory-status";
import { deriveSku } from "./sku";
import type { ImportWarning, ParsedInventoryRow } from "./types";

export interface ImportResult {
  backupsKept: number;
  detailsIncompleteCount: number;
  imported: number;
  inserted: number;
  mismatchCount: number;
  needsBatchCount: number;
  skippedEmptyRows: number;
  updated: number;
  warnings: ImportWarning[];
}

export interface ImportOptions {
  month: string;
}

interface DbLike {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  select: <T>(sql: string, params?: unknown[]) => Promise<T>;
}

/**
 * Why this module never issues `BEGIN` / `COMMIT` / `ROLLBACK`.
 *
 * The desktop database is reached through `tauri-plugin-sql`, which hands every
 * `execute` call to whichever connection the sqlx pool has free (sqlx defaults
 * to ten). SQL-level transaction control is therefore impossible from the
 * frontend: `BEGIN` opens a transaction on one pooled connection, the statements
 * that follow can be served by another, and the closing `ROLLBACK` fails with
 * "cannot rollback - no transaction is active" — which is the error that used to
 * reach the user, masking whatever had actually gone wrong.
 *
 * Atomicity is instead built from a snapshot: both tables are copied into
 * backup tables before the first write, the import runs in autocommit like every
 * other write in this app, and a throw restores that snapshot (see
 * `restoreSnapshot`).
 */

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Columns an imported row's strength split lives in, as the importer reads them.
 * Kept in one list so the SELECT and the row type cannot drift apart.
 */
const EXISTING_COLUMNS =
  "id, name, dosage, sku, category, display_name, strength_value, strength_unit, form, pack_size";

interface ExistingItemRow {
  category: string | null;
  display_name: string | null;
  /** Backfill input, still present until the deferred drop ships (§6.2 B). */
  dosage: string | null;
  form: string | null;
  id: string;
  name: string;
  pack_size: string | null;
  sku: string;
  strength_unit: string | null;
  strength_value: string | null;
}

function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Columns the import overwrites on an existing row — the ones a restore puts back. */
const MUTATED_COLUMNS = [
  "category",
  "daily_sum",
  "dosage_missing",
  "is_no_stock",
  "needs_batch",
  "qty",
  "status",
  "stock_on_hand",
  "stock_remaining",
  "supplier",
  "total_dispensed",
  "total_mismatch",
  "updated_at",
] as const;

interface ImportMutationLog {
  backupTable: string;
  dispBackupTable: string;
  insertedIds: string[];
  month: string;
  updatedIds: string[];
}

/**
 * One multi-row INSERT per item: up to 31 IPC round trips collapse into one.
 * Each statement stays far below SQLite's bound-variable limit.
 */
async function insertDispensingEvents(
  db: DbLike,
  itemId: string,
  daily: number[],
  month: string
): Promise<void> {
  const tuples: string[] = [];
  const values: unknown[] = [];

  for (let index = 0; index < daily.length; index += 1) {
    const qty = daily[index];
    if (qty === 0) {
      continue;
    }
    const day = index + 1;
    tuples.push("(?, ?, ?, ?, ?)");
    values.push(
      itemId,
      `${month}-${String(day).padStart(2, "0")}`,
      day,
      month,
      qty
    );
  }

  if (tuples.length === 0) {
    return;
  }

  await db.execute(
    `INSERT INTO dispensing_events (item_id, date, day, month, qty) VALUES ${tuples.join(", ")}`,
    values
  );
}

/**
 * Undoes an interrupted import from the snapshots taken at its start, touching
 * only the rows the import wrote.
 */
async function restoreSnapshot(
  db: DbLike,
  log: ImportMutationLog
): Promise<void> {
  const touched = [...log.insertedIds, ...log.updatedIds];
  if (touched.length === 0) {
    return;
  }

  // 1) Rows this import created did not exist before — drop them, and their
  //    dispensing events explicitly rather than relying on ON DELETE CASCADE
  //    being enabled on the connection that serves this statement.
  if (log.insertedIds.length > 0) {
    const marks = placeholders(log.insertedIds.length);
    await db.execute(
      `DELETE FROM dispensing_events WHERE item_id IN (${marks})`,
      log.insertedIds
    );
    await db.execute(
      `DELETE FROM inventory_items WHERE id IN (${marks})`,
      log.insertedIds
    );
  }

  // 2) Rows this import updated: copy the pre-import values back out of the
  //    snapshot. Every id here existed before the import, so the correlated
  //    subquery always finds a row.
  if (log.updatedIds.length > 0) {
    const marks = placeholders(log.updatedIds.length);
    const assignments = MUTATED_COLUMNS.map(
      (column) =>
        `${column} = (SELECT b.${column} FROM "${log.backupTable}" b WHERE b.id = inventory_items.id)`
    ).join(", ");
    await db.execute(
      `UPDATE inventory_items SET ${assignments} WHERE id IN (${marks})`,
      log.updatedIds
    );
  }

  // 3) The month's dispensing grid, rebuilt from the event snapshot.
  const marks = placeholders(touched.length);
  await db.execute(
    `DELETE FROM dispensing_events WHERE month = ? AND item_id IN (${marks})`,
    [log.month, ...touched]
  );
  await db.execute(
    `INSERT INTO dispensing_events (item_id, date, day, month, qty)
       SELECT item_id, date, day, month, qty FROM "${log.dispBackupTable}"
        WHERE month = ? AND item_id IN (${marks})`,
    [log.month, ...touched]
  );
}

/**
 * Restores the snapshot and reports the *original* failure — a rollback that
 * fails must never replace the reason the import stopped.
 */
async function rollBackImport(
  db: DbLike,
  log: ImportMutationLog,
  cause: unknown
): Promise<Error> {
  try {
    await restoreSnapshot(db, log);
    return cause instanceof Error ? cause : new Error(messageOf(cause));
  } catch (rollbackError) {
    return new Error(
      `${messageOf(cause)} — the automatic rollback failed too (${messageOf(rollbackError)}), so the import may be partial. Restore the latest backup from Data → Backups.`
    );
  }
}

/**
 * Every column a snapshot is restored from, named rather than `SELECT *`.
 *
 * Named because a snapshot may hold a schema the live table no longer has: the
 * strength backfill leaves `dosage` in place for now (spec §6.2 option B), and
 * the follow-up `0006_drop_dosage.sql` will have to remove it from this list at
 * the same time as it drops the column.
 */
const RESTORABLE_COLUMNS =
  "id, sku, name, dosage, strength_value, strength_unit, form, pack_size, display_name, dosage_missing, stock_on_hand, total_dispensed, stock_remaining, daily_sum, total_mismatch, qty, status, needs_batch, category, supplier, threshold, is_no_stock, notes, created_at, updated_at";

let activeImport: Promise<unknown> | null = null;

/**
 * Imports snapshot and rewrite the same tables, and the pool may serve two of
 * them from different connections — so a second import queues behind the first
 * instead of interleaving with it.
 */
function withImportLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = activeImport;
  const run = previous ? previous.then(task, task) : task();
  activeImport = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function importInventoryCsv(
  csvText: string,
  db: DbLike,
  opts: ImportOptions
): Promise<ImportResult> {
  return withImportLock(() => runInventoryImport(csvText, db, opts));
}

async function runInventoryImport(
  csvText: string,
  db: DbLike,
  opts: ImportOptions
): Promise<ImportResult> {
  const parsed = parseInventoryCsv(csvText, opts.month);

  // 1) Auto backup snapshots — keep the last 3 of each
  const ts = backupSuffix();
  const backupTable = await snapshotTable(db, "inventory_items", ts);
  const backupsKept = await pruneBackups(db, "inventory_items_backup");

  // Backup dispensing_events similarly (optional sidecar)
  const dispBackup = await snapshotTable(db, "dispensing_events", ts);
  await pruneBackups(db, "dispensing_events_backup");

  // Collect existing SKUs for collision handling
  const existingSkuRows = await db.select<{ sku: string }[]>(
    "SELECT sku FROM inventory_items"
  );
  const existingSkus = new Set(existingSkuRows.map((r) => r.sku));

  // Load existing items by every identity key they could be recognised by. Rows
  // already on this device have been backfilled by the time an import can run, so
  // their four columns describe them exactly; the label key is the forgiving
  // half, for the case where the backfill's split and the template's columns
  // placed a token in different slots (spec §7.1).
  const existingRows = await db.select<ExistingItemRow[]>(
    `SELECT ${EXISTING_COLUMNS} FROM inventory_items`
  );
  const keyToRow = new Map<
    string,
    { id: string; sku: string; category: string | null }
  >();
  for (const r of existingRows) {
    const match = { category: r.category, id: r.id, sku: r.sku };
    const storedDosage = text(r.dosage);
    const keys = [
      ...identityKeysOf({
        form: r.form ?? "",
        name: r.name,
        packSize: r.pack_size ?? "",
        strengthUnit: r.strength_unit ?? "",
        strengthValue: r.strength_value ?? "",
      }),
      // A row the backfill has not rewritten is only described by its legacy
      // text, and missing it would insert a duplicate rather than update. The
      // stored text is used as-is rather than recomposed, because a row that
      // predates the split may not have been spaced the way the composer does.
      ...(storedDosage === "" ? [] : [legacyIdentityKey(r.name, storedDosage)]),
    ];
    for (const key of keys) {
      // First row wins, matching `loadIdentityIndex`.
      if (!keyToRow.has(key)) {
        keyToRow.set(key, match);
      }
    }
  }

  const ctx: ImportContext = {
    db,
    existingSkus,
    keyToRow,
    month: opts.month,
    mutationLog: {
      backupTable,
      dispBackupTable: dispBackup,
      insertedIds: [],
      month: opts.month,
      updatedIds: [],
    },
  };

  try {
    await applyRows(ctx, parsed.rows);
  } catch (err) {
    throw await rollBackImport(db, ctx.mutationLog, err);
  }

  return {
    backupsKept,
    detailsIncompleteCount: parsed.detailsIncompleteCount,
    imported: parsed.rows.length,
    inserted: ctx.mutationLog.insertedIds.length,
    mismatchCount: parsed.mismatchCount,
    needsBatchCount: parsed.rows.length, // spec: needs_batch=1 everywhere on import
    skippedEmptyRows: parsed.skippedEmptyRows,
    updated: ctx.mutationLog.updatedIds.length,
    warnings: parsed.warnings,
  };
}

/**
 * Everything one import run needs while it walks the parsed rows: the writes
 * themselves, the SKUs already handed out, and the log the rollback restores
 * from.
 */
interface ImportContext {
  db: DbLike;
  existingSkus: Set<string>;
  keyToRow: Map<string, { category: string | null; id: string; sku: string }>;
  month: string;
  mutationLog: ImportMutationLog;
}

/**
 * Writes every parsed row, one after the other.
 *
 * Sequential by design rather than by accident: each statement has to land
 * before the next is issued, because a mid-import failure is recovered by
 * restoring the snapshot in the order it was written.
 */
async function applyRows(
  ctx: ImportContext,
  rows: ParsedInventoryRow[]
): Promise<void> {
  await rows.reduce<Promise<void>>(
    (previous, row) => previous.then(() => applyRow(ctx, row)),
    Promise.resolve()
  );
}

/** Writes one row — an update when name+dosage already exists, an insert otherwise. */
async function applyRow(
  ctx: ImportContext,
  row: ParsedInventoryRow
): Promise<void> {
  const { db, existingSkus, keyToRow, month, mutationLog } = ctx;
  const parts = {
    form: row.form,
    name: row.name,
    packSize: row.packSize,
    strengthUnit: row.strengthUnit,
    strengthValue: row.strengthValue,
  };
  const keys = allIdentityKeys(parts);
  const ck = identityKey(parts);
  const { displayName } = row;
  const qty = row.stockOnHand ?? 0;
  const status = deriveStatus(qty, 20);
  const detailsIncomplete = isDetailsIncomplete(parts) ? 1 : 0;
  const isNoStock = qty === 0 ? 1 : 0;
  const totalDispensed = row.totalDispensed ?? 0;
  const { dailySum, stockRemaining } = row;
  const totalMismatch = row.totalMismatch ? 1 : 0;

  const needsBatch = 1; // no batches on import, spec §3.7
  const guessed = guessCategory(row.name, strengthLabel(parts));
  // Spec §5.3: category from sheet overrides guessCategory if non-blank and not "Other"
  const effectiveCategory =
    row.category !== null &&
    row.category.trim() !== "" &&
    row.category !== "Other"
      ? row.category
      : guessed;
  const effectiveSupplier =
    row.supplier !== null && row.supplier.trim() !== ""
      ? row.supplier.trim()
      : null;

  const existing = keys.map((key) => keyToRow.get(key)).find(Boolean);

  if (existing) {
    // Preserve existing category if effective is null, else use effective
    const categoryToSet = effectiveCategory ?? existing.category ?? null;

    await db.execute(
      `UPDATE inventory_items SET
            dosage_missing = ?, stock_on_hand = ?, total_dispensed = ?, stock_remaining = ?,
            daily_sum = ?, total_mismatch = ?, qty = ?, status = ?, needs_batch = ?,
            category = COALESCE(?, category), supplier = COALESCE(?, supplier), threshold = threshold,
            is_no_stock = ?, display_name = ?, updated_at = ?
           WHERE id = ?`,
      [
        detailsIncomplete,
        row.stockOnHand,
        totalDispensed,
        stockRemaining,
        dailySum,
        totalMismatch,
        qty,
        status,
        needsBatch,
        categoryToSet,
        effectiveSupplier,
        isNoStock,
        displayName,
        nowIso(),
        existing.id,
      ]
    );
    mutationLog.updatedIds.push(existing.id);

    // Replace dispensing_events for this item+month
    await db.execute(
      "DELETE FROM dispensing_events WHERE item_id = ? AND month = ?",
      [existing.id, month]
    );
    await insertDispensingEvents(db, existing.id, row.daily, month);
    return;
  }

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sku = deriveSku(row.name, row.strengthValue, existingSkus);
  existingSkus.add(sku);

  await db.execute(
    `INSERT INTO inventory_items
            (id, sku, name, strength_value, strength_unit, form, pack_size, display_name, dosage_missing, stock_on_hand, total_dispensed, stock_remaining, daily_sum, total_mismatch, qty, status, needs_batch, category, supplier, threshold, is_no_stock, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sku,
      row.name.trim(),
      row.strengthValue.trim(),
      row.strengthUnit.trim(),
      row.form.trim(),
      row.packSize.trim(),
      displayName,
      detailsIncomplete,
      row.stockOnHand,
      totalDispensed,
      stockRemaining,
      dailySum,
      totalMismatch,
      qty,
      status,
      needsBatch,
      effectiveCategory,
      effectiveSupplier,
      20,
      isNoStock,
      nowIso(),
      nowIso(),
    ]
  );
  mutationLog.insertedIds.push(id);
  const match = { category: effectiveCategory, id, sku };
  for (const key of keys) {
    keyToRow.set(key, match);
  }
  keyToRow.set(ck, match);

  await insertDispensingEvents(db, id, row.daily, month);
}

export async function restoreLastBackup(db: DbLike): Promise<void> {
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'inventory_items_backup_%' ORDER BY name DESC LIMIT 1"
  );
  if (rows.length === 0) {
    throw new Error("No backup found");
  }
  const latest = rows[0].name;
  // Columns are named rather than `SELECT *`: a snapshot taken before the
  // strength backfill dropped `dosage` has one column more than the live table,
  // and a positional copy would fail on exactly the backups worth restoring.
  await db.execute("DELETE FROM inventory_items");
  await db.execute(
    `INSERT INTO inventory_items (${RESTORABLE_COLUMNS})
       SELECT ${RESTORABLE_COLUMNS} FROM "${latest}"`
  );
  const dispRows = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dispensing_events_backup_%' ORDER BY name DESC LIMIT 1"
  );
  if (dispRows.length > 0) {
    await db.execute("DELETE FROM dispensing_events");
    await db.execute(
      `INSERT INTO dispensing_events SELECT * FROM "${dispRows[0].name}"`
    );
  }
}
