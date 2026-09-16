/**
 * Run-once backfill: legacy `dosage` text → the four structured strength columns
 * (spec §6.3, decisions 21 + 22 + 23 + 24).
 *
 * Why it runs from TypeScript rather than from a `.sql` migration: migrations are
 * handed to the SQL plugin in Rust and run before any JavaScript exists, and the
 * split needs the vocabulary and the label rules that live in `domain/strength.ts`.
 * Splitting in SQL would mean a second implementation of the same rule — exactly
 * the drift this spec is about.
 *
 * The backfill is deliberately **idempotent**: it reads `dosage` and rewrites the
 * four columns from it, so running it twice produces identical rows. The
 * `app_meta` flag is an optimization (do not pay for the scan on every launch),
 * not the thing that makes it safe — which is why a database whose `app_meta`
 * table is missing or unwritable still gets a correct result.
 *
 * **`dosage` is deliberately not dropped** (spec §6.2 option B, the option §12
 * recommends). It is left in place, unread by the writes above and by the UI, so
 * that a `0006_drop_dosage.sql` can ship in a following release once this
 * backfill has been observed to complete cleanly on real databases. Nothing in
 * this module or the app writes it any more, so the column is inert.
 */

import type { DbLike } from "../creation/db-like";
import {
  composeDisplayName,
  isDetailsIncomplete,
  type StrengthParts,
  splitDosage,
} from "../domain/strength";

/** The marker this run leaves in `app_meta`. */
export const BACKFILL_META_KEY = "strength_backfill_v1";

/** Rows written per statement — keeps bound parameters well under SQLite's cap. */
const CHUNK = 40;

export interface UncertainRow {
  /** What the split produced, for the review list. */
  displayName: string;
  dosage: string;
  id: string;
  name: string;
  parts: StrengthParts;
}

export interface StrengthBackfillReport {
  /** Rows that held no dosage text at all — nothing to split. */
  blank: number;
  /** Rows the split could not place cleanly (decision 22 — surface these). */
  uncertain: UncertainRow[];
  /** Rows rewritten with the four columns + `display_name`. */
  written: number;
}

interface ItemRow {
  display_name: string | null;
  dosage: string | null;
  form: string | null;
  id: string;
  name: string;
  pack_size: string | null;
  strength_unit: string | null;
  strength_value: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * A stored, non-empty field wins over the split.
 *
 * Products created in the app already carry accurate columns, and the vocabulary
 * list is narrower than what a human may have typed (`bottle`, say) — re-splitting
 * such a row from its own `dosage` would *lose* the part the vocabulary could not
 * place. Only genuinely empty slots are filled from the legacy text.
 */
function effectiveParts(row: ItemRow): {
  parts: StrengthParts;
  uncertain: boolean;
} {
  const split = splitDosage(text(row.dosage));
  const parts: StrengthParts = {
    form: text(row.form).trim() || split.form,
    packSize: text(row.pack_size).trim() || split.packSize,
    strengthUnit: text(row.strength_unit).trim() || split.strengthUnit,
    strengthValue: text(row.strength_value).trim() || split.strengthValue,
  };
  const alreadyComplete =
    text(row.strength_value).trim() !== "" &&
    text(row.strength_unit).trim() !== "" &&
    text(row.form).trim() !== "" &&
    text(row.pack_size).trim() !== "";
  // A row that was already complete is not a guess, whatever the splitter thinks.
  return { parts, uncertain: alreadyComplete ? false : split.uncertain };
}

/**
 * One `UPDATE` per chunk of rows, using `CASE id WHEN …` so a backup of several
 * hundred items does not cost several hundred IPC round trips at startup.
 */
async function writeChunk(
  db: DbLike,
  chunk: {
    displayName: string;
    dosageMissing: number;
    id: string;
    parts: StrengthParts;
  }[]
): Promise<void> {
  const ids = chunk.map((row) => row.id);
  const marks = ids.map(() => "?").join(", ");
  const assignments: Record<string, string> = {
    display_name: "display_name",
    dosage_missing: "dosage_missing",
    form: "form",
    pack_size: "pack_size",
    strength_unit: "strength_unit",
    strength_value: "strength_value",
  };
  const valueOf = (
    row: (typeof chunk)[number],
    column: keyof typeof assignments
  ): unknown => {
    switch (column) {
      case "display_name":
        return row.displayName;
      case "dosage_missing":
        return row.dosageMissing;
      case "form":
        return row.parts.form;
      case "pack_size":
        return row.parts.packSize;
      case "strength_unit":
        return row.parts.strengthUnit;
      default:
        return row.parts.strengthValue;
    }
  };

  const sets = Object.keys(assignments)
    .map((column) => {
      const cases = chunk.map(() => "WHEN ? THEN ?").join(" ");
      return `${column} = CASE id ${cases} ELSE ${column} END`;
    })
    .join(", ");

  // Bound values follow the statement's own shape: the CASEs are written column
  // by column, so the parameters must be grouped that way too — rows outer would
  // bind the next row's first value to this row's second column.
  const values: unknown[] = [];
  for (const column of Object.keys(
    assignments
  ) as (keyof typeof assignments)[]) {
    for (const row of chunk) {
      values.push(row.id, valueOf(row, column));
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
      [BACKFILL_META_KEY]
    );
    return rows.length > 0;
  } catch {
    // `app_meta` predates this migration on a database that never reached 0005,
    // and does not exist at all in the browser preview.
    return false;
  }
}

async function writeMetaFlag(db: DbLike): Promise<void> {
  try {
    await db.execute(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)",
      [BACKFILL_META_KEY, new Date().toISOString()]
    );
  } catch {
    // Best effort: the backfill is idempotent, so a missing flag costs one extra
    // scan next launch rather than correctness.
  }
}

/** Runs the split for every row, whether or not the run-once flag is set. */
export async function backfillStrengthFields(
  db: DbLike,
  opts: { force?: boolean } = {}
): Promise<StrengthBackfillReport> {
  const report: StrengthBackfillReport = {
    blank: 0,
    uncertain: [],
    written: 0,
  };

  if (!opts.force && (await readMetaFlag(db))) {
    return report;
  }

  const rows = await db.select<ItemRow[]>(
    `SELECT id, name, dosage, display_name, strength_value, strength_unit, form, pack_size
       FROM inventory_items`
  );

  const pending: {
    displayName: string;
    dosageMissing: number;
    id: string;
    parts: StrengthParts;
  }[] = [];

  for (const row of rows) {
    const { parts, uncertain } = effectiveParts(row);
    const displayName = composeDisplayName({ ...parts, name: row.name });
    if (text(row.dosage).trim() === "") {
      report.blank += 1;
    }
    if (uncertain) {
      report.uncertain.push({
        displayName,
        dosage: text(row.dosage),
        id: row.id,
        name: row.name,
        parts,
      });
    }
    pending.push({
      displayName,
      dosageMissing: isDetailsIncomplete(parts) ? 1 : 0,
      id: row.id,
      parts,
    });
  }

  for (let index = 0; index < pending.length; index += CHUNK) {
    // biome-ignore lint/performance/noAwaitInLoops: ordered chunks of one logical write
    await writeChunk(db, pending.slice(index, index + CHUNK));
  }
  report.written = pending.length;

  // `dosage` is intentionally left in place — see the module note. Its index
  // (`idx_inventory_name_dosage`) stays with it, which costs one small index and
  // keeps the deferred drop migration a one-liner.
  await writeMetaFlag(db);
  return report;
}

let backfillPromise: Promise<StrengthBackfillReport | null> | null = null;

/**
 * The startup entry point. Cached in module state so two callers racing at boot
 * share one run, and resolved to `null` when there is no database behind this
 * window (the browser preview), where there is nothing to migrate.
 */
export function ensureStrengthBackfill(): Promise<StrengthBackfillReport | null> {
  if (!backfillPromise) {
    backfillPromise = (async () => {
      try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        return await backfillStrengthFields(
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
export function resetStrengthBackfillForTesting(): void {
  backfillPromise = null;
}
