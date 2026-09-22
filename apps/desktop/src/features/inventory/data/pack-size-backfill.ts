/**
 * Run-once backfill: the leftover `pack_size` text → the structured
 * `pack_qty` / `pack_unit` pair (pack-size-handling F10).
 *
 * The text column is **not** a pack column: `splitDosage` keeps whatever the
 * fixed vocabularies cannot place "verbatim in the last slot it could belong to"
 * (PK28), so a cell may be `(10/box)`, `mg tab (30/box)`, `100’s`,
 * `60ml suspension` or `for injection`. This backfill therefore looks for a
 * recognisable group *inside* the cell rather than assuming the cell is one
 * (D32), and everything it cannot read is reported rather than guessed (D6).
 *
 * Two rules make it safe to run against the clinic's real workbook:
 *
 * 1. **The text is never rewritten.** `pack_size` feeds `identity_key` and
 *    `display_name`, so replacing `(10/box)` with `10/box` would silently create
 *    a second product for every row (PK13, acceptance criterion 1).
 * 2. **A number with no container is half a pair.** `100’s` fills `pack_qty` and
 *    leaves `pack_unit` blank — never `box` by inference and never the base unit,
 *    which would break `unitKind` (D28).
 *
 * Like the strength backfill it runs from TypeScript rather than a `.sql`
 * migration, because the parser lives here and migrations run before any
 * JavaScript exists. The `app_meta` flag is an optimization, not the thing that
 * makes it safe — it writes only where the pair is still empty, so a second run
 * is a no-op.
 */

import type { DbLike } from "../creation/db-like";
import { parsePackSize } from "../domain/pack-size";

/** The marker this run leaves in `app_meta`. */
export const PACK_BACKFILL_META_KEY = "pack_size_backfill";

/** Rows written per statement — keeps bound parameters under SQLite's cap. */
const CHUNK = 40;

/** Why a row is on the review list. */
export type PackReviewReason =
  /** The cell named a number but no container (`100’s`, `(100/tab)`) — D28. */
  | "container not stated"
  /** The cell is prose or a measure — nothing to read (D6). */
  | "not a pack size";

export interface PackReviewRow {
  id: string;
  name: string;
  /** The cell exactly as stored, for the review list. */
  packSize: string;
  reason: PackReviewReason;
}

export interface PackSizeBackfillReport {
  /** Rows with no `pack_size` text at all — nothing to read. */
  blank: number;
  /** Rows read as a number with an unstated container; `pack_qty` filled. */
  numbered: PackReviewRow[];
  /** Rows whose pair now holds a multiple and a container. */
  paired: number;
  /** Rows left completely alone because the cell could not be read. */
  unreadable: PackReviewRow[];
}

interface ItemRow {
  form: string | null;
  id: string;
  name: string;
  pack_qty: number | null;
  pack_size: string | null;
  pack_unit: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function qtyOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

interface PendingWrite {
  id: string;
  packQty: number;
  /** Blank when the container was not stated (D28). */
  packUnit: string;
}

/**
 * One `UPDATE` per chunk of rows, using `CASE id WHEN …` so a full inventory
 * does not cost one IPC round trip per item at startup. Only the two pack
 * columns are touched.
 */
async function writeChunk(db: DbLike, chunk: PendingWrite[]): Promise<void> {
  const ids = chunk.map((row) => row.id);
  const marks = ids.map(() => "?").join(", ");
  const columns: ("packQty" | "packUnit")[] = ["packQty", "packUnit"];
  const columnSql = { packQty: "pack_qty", packUnit: "pack_unit" };

  const sets = columns
    .map((column) => {
      const cases = chunk.map(() => "WHEN ? THEN ?").join(" ");
      return `${columnSql[column]} = CASE id ${cases} ELSE ${columnSql[column]} END`;
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
      [PACK_BACKFILL_META_KEY]
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
      [PACK_BACKFILL_META_KEY, new Date().toISOString()]
    );
  } catch {
    // Best effort: the backfill only writes where the pair is empty, so a
    // missing flag costs one extra scan, not correctness.
  }
}

/** Runs the pair-fill for every row, whether or not the run-once flag is set. */
export async function backfillPackSizeFields(
  db: DbLike,
  opts: { force?: boolean } = {}
): Promise<PackSizeBackfillReport> {
  const report: PackSizeBackfillReport = {
    blank: 0,
    numbered: [],
    paired: 0,
    unreadable: [],
  };

  if (!opts.force && (await readMetaFlag(db))) {
    return report;
  }

  const rows = await db.select<ItemRow[]>(
    `SELECT id, name, form, pack_size, pack_qty, pack_unit
       FROM inventory_items`
  );

  const pending: PendingWrite[] = [];

  for (const row of rows) {
    const existingQty = qtyOf(row.pack_qty);
    const existingUnit = text(row.pack_unit).trim();

    // A row the app already writes, or a previous run already filled, is left
    // alone — and counts as paired, so the report is stable across a re-run.
    if (existingQty > 1 && existingUnit !== "") {
      report.paired += 1;
      continue;
    }

    const packSize = text(row.pack_size).trim();
    if (packSize === "") {
      report.blank += 1;
      continue;
    }

    const parsed = parsePackSize(packSize);
    if (!parsed) {
      report.unreadable.push({
        id: row.id,
        name: row.name,
        packSize,
        reason: "not a pack size",
      });
      continue;
    }

    if (parsed.unit === "") {
      // The number is real, the container is not stated: fill `pack_qty`, leave
      // `pack_unit` blank and flag the row (D28, E23). Never infer `box`.
      pending.push({ id: row.id, packQty: parsed.qty, packUnit: "" });
      report.numbered.push({
        id: row.id,
        name: row.name,
        packSize,
        reason: "container not stated",
      });
      continue;
    }

    // `pack_size` is deliberately left byte-identical (PK13): only the pair is
    // written.
    pending.push({ id: row.id, packQty: parsed.qty, packUnit: parsed.unit });
    report.paired += 1;
  }

  for (let index = 0; index < pending.length; index += CHUNK) {
    // biome-ignore lint/performance/noAwaitInLoops: ordered chunks of one logical write
    await writeChunk(db, pending.slice(index, index + CHUNK));
  }

  await writeMetaFlag(db);
  return report;
}

let backfillPromise: Promise<PackSizeBackfillReport | null> | null = null;

/**
 * The startup entry point. Cached in module state so two callers racing at boot
 * share one run, and resolved to `null` when there is no database behind this
 * window (the browser preview), where there is nothing to migrate.
 */
export function ensurePackSizeBackfill(): Promise<PackSizeBackfillReport | null> {
  if (!backfillPromise) {
    backfillPromise = (async () => {
      try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        return await backfillPackSizeFields(
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
export function resetPackSizeBackfillForTesting(): void {
  backfillPromise = null;
}
