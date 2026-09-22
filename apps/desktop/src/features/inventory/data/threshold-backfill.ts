/**
 * Run-once backfill: the flat default `threshold` → a value derived from the
 * usage the database already holds.
 *
 * `inventory_items.threshold` is `INTEGER NOT NULL DEFAULT 20` (`0002_inventory.sql`)
 * and the importer used to pass a literal `20` for every row, so a database
 * populated before the derivation shipped holds the same reorder point for every
 * medicine. The derivation itself lives in `domain/threshold.ts`; this backfill
 * is the mechanism that reaches rows **already stored**, which an import alone
 * cannot fix — the importer upserts, so a row that is never re-imported would
 * keep its 20 forever.
 *
 * Two rules keep it from trampling deliberate choices:
 *
 * 1. **Only the untouched default is replaced.** A row whose threshold differs
 *    from 20 was set by a person (the item form, or Settings → Alert Thresholds),
 *    and is left exactly as it is (pack-size G5 — no regression to existing
 *    thresholds). 20 is treated as a placeholder, not a value.
 * 2. **`status` follows the threshold.** `status` is stored, not derived on read,
 *    so leaving it alone would strand a row that the new threshold makes "low"
 *    as "in" on the Inventory list. Both columns move together, through the same
 *    `deriveStatus` the import and the deductions use.
 *
 * Like the strength and pack backfills it runs from TypeScript rather than a
 * `.sql` migration, because the rule lives here and migrations run before any
 * JavaScript exists. The `app_meta` flag is an optimization, not what makes it
 * safe: it writes only where the value is still the default, so a second run is
 * a no-op.
 */

import type { DbLike } from "../creation/db-like";
import { DEFAULT_THRESHOLD } from "../creation/draft";
import { THRESHOLD_GRID_DAYS, thresholdForUsage } from "../domain/threshold";
import { deriveStatus } from "../import/inventory-status";

/** The marker this run leaves in `app_meta`. */
export const THRESHOLD_BACKFILL_META_KEY = "threshold_backfill";

/** Rows written per statement — keeps bound parameters under SQLite's cap. */
const CHUNK = 40;

export interface ThresholdBackfillReport {
  /** Rows whose threshold was deliberately set and left alone. */
  kept: number;
  /** Derived rows the month showed no dispensing for, so their threshold is 0. */
  noUsage: number;
  /** Rows replaced with a derived threshold. */
  updated: number;
}

interface ItemRow {
  id: string;
  name: string;
  qty: number | null;
  supplier: string | null;
  threshold: number | null;
}

interface EventRow {
  day: number;
  item_id: string;
  month: string;
  qty: number;
}

function qtyOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The month's dispensing, folded to one total per item (its latest month). */
function usageByItem(events: EventRow[]): Map<string, number> {
  const latest = new Map<string, string>();
  const totals = new Map<string, number>();
  for (const event of events) {
    const month = typeof event.month === "string" ? event.month : "";
    const seen = latest.get(event.item_id);
    if (seen === undefined || month > seen) {
      latest.set(event.item_id, month);
      totals.set(event.item_id, qtyOf(event.qty));
      continue;
    }
    if (month === seen) {
      totals.set(
        event.item_id,
        (totals.get(event.item_id) ?? 0) + qtyOf(event.qty)
      );
    }
  }
  return totals;
}

/**
 * One `UPDATE` per chunk of rows, using `CASE id WHEN …` so a full inventory does
 * not cost one IPC round trip per item at startup. Both the threshold and the
 * status it decides are written together.
 */
async function writeChunk(
  db: DbLike,
  chunk: { id: string; status: string; threshold: number }[]
): Promise<void> {
  const ids = chunk.map((row) => row.id);
  const marks = ids.map(() => "?").join(", ");
  const columns: ("threshold" | "status")[] = ["threshold", "status"];

  const sets = columns
    .map((column) => {
      const cases = chunk.map(() => "WHEN ? THEN ?").join(" ");
      return `${column} = CASE id ${cases} ELSE ${column} END`;
    })
    .join(", ");

  // Bound values follow the statement's own shape: the CASEs are written column
  // by column, so the parameters must be grouped that way too.
  const values: unknown[] = [];
  for (const column of columns) {
    for (const row of chunk) {
      values.push(row.id, row[column]);
    }
  }

  await db.execute(
    `UPDATE inventory_items SET ${sets} WHERE id IN (${marks})`,
    [...values, ...ids]
  );
}

async function readMetaFlag(db: DbLike): Promise<boolean> {
  try {
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_meta WHERE key = ? LIMIT 1",
      [THRESHOLD_BACKFILL_META_KEY]
    );
    return rows.length > 0;
  } catch {
    // `app_meta` does not exist in the browser preview and predates this release
    // on a database that never reached 0005.
    return false;
  }
}

async function writeMetaFlag(db: DbLike): Promise<void> {
  try {
    await db.execute(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)",
      [THRESHOLD_BACKFILL_META_KEY, new Date().toISOString()]
    );
  } catch {
    // Best effort: the backfill only writes where the value is still the default,
    // so a missing flag costs one extra scan, not correctness.
  }
}

/** Runs the derivation for every row, whether or not the run-once flag is set. */
export async function backfillThresholds(
  db: DbLike,
  opts: { force?: boolean } = {}
): Promise<ThresholdBackfillReport> {
  const report: ThresholdBackfillReport = {
    kept: 0,
    noUsage: 0,
    updated: 0,
  };

  if (!opts.force && (await readMetaFlag(db))) {
    return report;
  }

  const items = await db.select<ItemRow[]>(
    "SELECT id, name, qty, supplier, threshold FROM inventory_items"
  );

  let usage = new Map<string, number>();
  try {
    const events = await db.select<EventRow[]>(
      "SELECT item_id, month, day, qty FROM dispensing_events"
    );
    usage = usageByItem(events);
  } catch {
    // No dispensers table on this build: every item counts as no usage, which
    // yields the same threshold the empty grid would.
    usage = new Map();
  }

  const pending: { id: string; status: string; threshold: number }[] = [];

  for (const item of items) {
    const stored = qtyOf(item.threshold);
    // A value that is not the untouched default was chosen deliberately.
    if (stored !== DEFAULT_THRESHOLD) {
      report.kept += 1;
      continue;
    }

    const derived = thresholdForUsage(
      usage.get(item.id) ?? 0,
      THRESHOLD_GRID_DAYS,
      item.supplier
    );
    if (derived === 0) {
      report.noUsage += 1;
    }
    pending.push({
      id: item.id,
      status: deriveStatus(qtyOf(item.qty), derived),
      threshold: derived,
    });
  }

  for (let index = 0; index < pending.length; index += CHUNK) {
    // biome-ignore lint/performance/noAwaitInLoops: ordered chunks of one logical write
    await writeChunk(db, pending.slice(index, index + CHUNK));
  }
  report.updated = pending.length;

  await writeMetaFlag(db);
  return report;
}

let backfillPromise: Promise<ThresholdBackfillReport | null> | null = null;

/**
 * The startup entry point. Cached in module state so two callers racing at boot
 * share one run, and resolved to `null` when there is no database behind this
 * window (the browser preview), where there is nothing to migrate.
 */
export function ensureThresholdBackfill(): Promise<ThresholdBackfillReport | null> {
  if (!backfillPromise) {
    backfillPromise = (async () => {
      try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        return await backfillThresholds(
          db as unknown as import("../creation/db-like").DbLike
        );
      } catch {
        // No Tauri SQL plugin: preload/preview, or the database has not been
        // created yet. Inventory queries will surface their own failure.
        return null;
      }
    })();
  }
  return backfillPromise;
}

/** Test seam — clears the memoized startup run. */
export function resetThresholdBackfillForTesting(): void {
  backfillPromise = null;
}
