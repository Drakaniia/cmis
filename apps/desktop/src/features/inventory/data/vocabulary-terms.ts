import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";
import type { DbLike } from "../creation/db-like";
import {
  backupSuffix,
  messageOf,
  pruneBackups,
  restoreUpdatedColumns,
  snapshotTable,
} from "../creation/snapshot";
import { composeDisplayName } from "../domain/strength";
import { packSizeText } from "../domain/pack-size";
import {
  newTermId,
  normalizeTermName,
  seedTermId,
  validateTermName,
  type VocabularyTerm,
} from "../domain/vocabulary-terms";
import {
  setVocabulary,
  vocabulary,
} from "../domain/vocabulary-store";
import {
  type VocabularyKind,
  VOCABULARY_KINDS,
  VOCABULARY_NOUN,
} from "../domain/vocabulary";

/**
 * Read and write paths for the shared vocabulary tables (migration 0013).
 *
 * Four rules shape this module, and the first two are what make a rename
 * different from `data/categories.ts`:
 *
 * 1. **The name is the relationship, and the name is *composed* into other
 *    columns.** `inventory_items` stores the term itself, but `display_name`
 *    is a rendered copy of it (`name + strength_value + strength_unit + form +
 *    pack_size`) and `pack_size` is derived from the `pack_qty`/`pack_unit`
 *    pair. Rewriting only the term column would leave the label disagreeing
 *    with its own parts, and every read that matches on `display_name` —
 *    `domain/medicine-match.ts`, the stock-in duplicate probe, the request
 *    board — would stop finding the row. So a rename recomposes both, in JS,
 *    using the same `composeDisplayName` and `packSizeText` the writers use.
 *
 * 2. **A rename has one text-dependent reader left, and it has to be repaired
 *    by hand.** `requests.item_id` (migration 0009) is the stable link, so
 *    every request created since is safe automatically. Rows created before it
 *    carry `item_id IS NULL` and are matched purely by normalised text
 *    (`REQUEST_HISTORY_WHERE_SQL`), so a rename silently detaches their
 *    history unless the copied `medicine` text is rewritten too. That is the
 *    one cascade beyond `inventory_items`, and it is best-effort by nature: if
 *    two items' old labels collide on one string the rewrite is skipped and
 *    counted rather than guessed at.
 *
 * 3. **The audit row is not optional.** A vocabulary change is a `settings`
 *    event that affects the whole app, so a failed audit write undoes the data
 *    write rather than leaving an unexplained change behind.
 *
 * 4. **No SQL transactions.** `tauri-plugin-sql` serves each statement from
 *    whichever pooled connection is free, so `BEGIN`/`COMMIT` cannot span a
 *    write sequence; `creation/snapshot.ts` is the app's substitute, and the
 *    rename reuses it rather than inventing a second convention.
 */

/** Column list, kept in one place so a select can never drift from an insert. */
const TERM_SELECT = "SELECT id, kind, name FROM vocabulary_terms";

/** The `inventory_items` column each kind is stored in. */
const ITEM_COLUMN: Record<VocabularyKind, string> = {
  form: "form",
  pack_unit: "pack_unit",
  strength_unit: "strength_unit",
};

/**
 * Which item columns a rename has to recompose, and whether the pack pair
 * changed.
 *
 * Only a `pack_unit` rename moves `pack_size`, because `pack_size` is written
 * from the pair alone. A `form` or `strength_unit` rename leaves the pair alone
 * and only the label moves.
 */
interface CascadePlan {
  /** Columns the rollback must be able to put back. */
  restoreColumns: readonly string[];
  /** True when `pack_size` was regenerated and so is part of the snapshot. */
  packChanged: boolean;
}

function cascadePlanFor(kind: VocabularyKind): CascadePlan {
  return {
    packChanged: kind === "pack_unit",
    restoreColumns: ["pack_size", "display_name"],
  };
}

interface TermRow {
  id: string;
  kind: VocabularyKind;
  name: string;
}

interface CountRow {
  c: number;
}

interface ItemRow {
  display_name: string;
  id: string;
  name: string;
  pack_qty: number | null;
  pack_size: string;
  pack_unit: string | null;
  strength_value: string;
  strength_unit: string;
  form: string;
}

/** How many items carry this term's name right now. */
async function usageCountFor(
  db: DbLike,
  kind: VocabularyKind,
  name: string
): Promise<number> {
  const rows = await db.select<CountRow[]>(
    `SELECT COUNT(*) AS c FROM inventory_items WHERE ${ITEM_COLUMN[kind]} = ?`,
    [name]
  );
  return rows[0]?.c ?? 0;
}

async function namesIn(
  db: DbLike,
  kind: VocabularyKind
): Promise<string[]> {
  const rows = await db.select<{ name: string }[]>(
    `${TERM_SELECT} WHERE kind = ? ORDER BY name COLLATE NOCASE`,
    [kind]
  );
  return rows.map((row) => row.name);
}

async function termById(db: DbLike, id: string): Promise<TermRow | null> {
  const rows = await db.select<TermRow[]>(
    `${TERM_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Pushes one kind's list into the snapshot the synchronous domain reads. */
function publish(kind: VocabularyKind, names: readonly string[]): void {
  setVocabulary(kind, names);
}

/** Every term of one kind, each with the number of items that use it. */
export async function listVocabularyTerms(
  kind: VocabularyKind
): Promise<VocabularyTerm[]> {
  const db = await getDb();
  const rows = await db.select<TermRow[]>(
    `${TERM_SELECT} WHERE kind = ? ORDER BY name COLLATE NOCASE`,
    [kind]
  );
  const counts = await Promise.all(
    rows.map((row) => usageCountFor(db, kind, row.name))
  );
  return rows.map((row, index) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    usageCount: counts[index] ?? 0,
  }));
}

/**
 * All three lists in one query, for the startup hydration.
 *
 * Resolves to `null` when the table is not there — a database that predates
 * migration 0013 and has not been migrated, or the browser preview — so the
 * caller can leave the seed snapshot in place rather than emptying the
 * dropdowns.
 */
export async function loadAllVocabularyTerms(): Promise<
  Record<VocabularyKind, string[]> | null
> {
  const db = await getDb();
  let rows: TermRow[];
  try {
    rows = await db.select<TermRow[]>(
      `${TERM_SELECT} ORDER BY kind, name COLLATE NOCASE`
    );
  } catch {
    return null;
  }
  const grouped: Record<VocabularyKind, string[]> = {
    form: [],
    pack_unit: [],
    strength_unit: [],
  };
  for (const row of rows) {
    if (VOCABULARY_KINDS.includes(row.kind)) {
      grouped[row.kind].push(row.name);
    }
  }
  return grouped;
}

/** Replaces the snapshot from a full read. The startup entry point. */
export async function hydrateVocabulary(): Promise<boolean> {
  const grouped = await loadAllVocabularyTerms();
  if (grouped === null) {
    return false;
  }
  for (const kind of VOCABULARY_KINDS) {
    // An empty list would blank a dropdown the seed had just filled, so a kind
    // that came back with nothing keeps the shipped tokens.
    if (grouped[kind].length > 0) {
      publish(kind, grouped[kind]);
    }
  }
  return true;
}

/**
 * Adds one term. Uniqueness is checked here as well as by the table's
 * `(kind, name)` constraint, so the operator gets a sentence instead of a
 * constraint error.
 *
 * The row is deleted again if the audit write fails, keeping rule 3: a change
 * nobody can account for must not survive.
 */
export async function createVocabularyTerm(
  kind: VocabularyKind,
  name: string
): Promise<VocabularyTerm> {
  const db = await getDb();
  const clean = normalizeTermName(name);
  const problem = validateTermName(clean, await namesIn(db, kind));
  if (problem !== null) {
    throw new Error(problem);
  }

  const id = newTermId();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO vocabulary_terms (id, kind, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [id, kind, clean, now, now]
  );

  try {
    await recordAudit(db, {
      action: "settings",
      after: { kind, name: clean },
      detail: `${capitalize(VOCABULARY_NOUN[kind])} added: ${clean}`,
      targetId: id,
      targetKind: "settings",
    });
  } catch (error) {
    try {
      await db.execute("DELETE FROM vocabulary_terms WHERE id = ?", [id]);
    } catch {
      // nothing useful to add — the original message is reported below
    }
    throw new Error(messageOf(error), { cause: error });
  }

  publish(kind, [...vocabulary(kind), clean]);
  return { id, kind, name: clean, usageCount: 0 };
}

export interface RenameTermResult {
  /** How many inventory items were rewritten to the new name. */
  itemsUpdated: number;
  /**
   * Pre-0009 request rows whose copied `medicine` text could not be repaired
   * because two items' old labels collided on the same string. Reported so the
   * caller can say so rather than leave the operator to discover it.
   */
  requestsUnresolved: number;
}

/**
 * Renames a term and recomposes everything that carried it.
 *
 * The whole sequence runs inside a snapshot envelope: if the term row, the item
 * rewrite, the request repair or the audit row fails, the items are restored
 * from the snapshot and the original error is thrown. A partial rename would be
 * worse than no rename — the term would say one thing and the items another.
 */
export async function renameVocabularyTerm(
  id: string,
  name: string
): Promise<RenameTermResult> {
  const db = await getDb();
  const current = await termById(db, id);
  if (current === null) {
    throw new Error("That term no longer exists.");
  }
  const { kind } = current;

  const clean = normalizeTermName(name);
  if (clean === current.name) {
    return { itemsUpdated: 0, requestsUnresolved: 0 };
  }
  const problem = validateTermName(clean, await namesIn(db, kind), {
    ignore: current.name,
  });
  if (problem !== null) {
    throw new Error(problem);
  }

  const plan = cascadePlanFor(kind);
  const column = ITEM_COLUMN[kind];
  const suffix = backupSuffix();
  const itemsBackup = await snapshotTable(db, "inventory_items", suffix);

  const before = await db.select<ItemRow[]>(
    `SELECT id, name, strength_value, strength_unit, form, pack_size, pack_qty, pack_unit, display_name
       FROM inventory_items WHERE ${column} = ?`,
    [current.name]
  );
  const itemIds = before.map((row) => row.id);
  const now = new Date().toISOString();

  try {
    // The term column first: `display_name` and `pack_size` are recomposed from
    // the new value below, so writing the items before the term would leave a
    // window where the list and the items disagree.
    await db.execute(
      `UPDATE inventory_items SET ${column} = ?, updated_at = ? WHERE ${column} = ?`,
      [clean, now, current.name]
    );
    await rewriteItems(db, before, column, clean, plan);
    const requestsUnresolved = await repairRequestText(db, before, column, clean);
    await db.execute(
      "UPDATE vocabulary_terms SET name = ?, updated_at = ? WHERE id = ?",
      [clean, now, id]
    );
    await recordAudit(db, {
      action: "settings",
      after: { itemsUpdated: itemIds.length, kind, name: clean },
      before: { name: current.name },
      detail: `${capitalize(VOCABULARY_NOUN[kind])} renamed: ${current.name} → ${clean} (${itemIds.length} ${itemIds.length === 1 ? "item" : "items"})`,
      targetId: id,
      targetKind: "settings",
    });
    await pruneBackups(db, "inventory_items_backup");
    publish(kind, swap(vocabulary(kind), current.name, clean));
    return { itemsUpdated: itemIds.length, requestsUnresolved };
  } catch (error) {
    throw await rollBackRename(db, {
      cause: error,
      id,
      itemIds,
      itemsBackup,
      name: current.name,
      now,
      restoreColumns: plan.restoreColumns,
    });
  }
}

/**
 * Recomposes `pack_size` and `display_name` for every affected row.
 *
 * Done in JS rather than SQL because both are built by functions that already
 * exist and are already trusted — reusing `composeDisplayName` and
 * `packSizeText` is what guarantees a renamed term produces exactly the label
 * an item edit would have produced, rather than a second string-building rule
 * that drifts.
 */
async function rewriteItems(
  db: DbLike,
  before: readonly ItemRow[],
  column: string,
  clean: string,
  plan: CascadePlan
): Promise<void> {
  for (const row of before) {
    const strengthUnit = column === "strength_unit" ? clean : row.strength_unit;
    const form = column === "form" ? clean : row.form;
    const packUnit = column === "pack_unit" ? clean : (row.pack_unit ?? "");
    const packSize = plan.packChanged
      ? packSizeText({ packQty: row.pack_qty ?? 0, packUnit }) || row.pack_size
      : row.pack_size;
    const displayName = composeDisplayName({
      form,
      name: row.name,
      packSize,
      strengthUnit,
      strengthValue: row.strength_value,
    });
    await db.execute(
      "UPDATE inventory_items SET pack_size = ?, display_name = ? WHERE id = ?",
      [packSize, displayName, row.id]
    );
  }
}

/**
 * Rewrites the copied `medicine` text on requests that have no `item_id`.
 *
 * Pre-0009 rows are matched by normalised text alone, so a rename moves the
 * label out from under them. An `old → new` map is built first; a string that
 * maps to two different new labels is ambiguous, and guessing which item the
 * operator meant is worse than leaving the text and reporting the count.
 */
async function repairRequestText(
  db: DbLike,
  before: readonly ItemRow[],
  column: string,
  clean: string
): Promise<number> {
  const relabelled = new Map<string, string>();
  const ambiguous = new Set<string>();

  for (const row of before) {
    const strengthUnit = column === "strength_unit" ? clean : row.strength_unit;
    const form = column === "form" ? clean : row.form;
    const packUnit = column === "pack_unit" ? clean : (row.pack_unit ?? "");
    const packSize = packSizeText({ packQty: row.pack_qty ?? 0, packUnit })
      ? packSizeText({ packQty: row.pack_qty ?? 0, packUnit })
      : row.pack_size;
    const next = composeDisplayName({
      form,
      name: row.name,
      packSize,
      strengthUnit,
      strengthValue: row.strength_value,
    });
    const existing = relabelled.get(row.display_name);
    if (existing !== undefined && existing !== next) {
      ambiguous.add(row.display_name);
    } else {
      relabelled.set(row.display_name, next);
    }
  }

  for (const old of ambiguous) {
    relabelled.delete(old);
  }

  for (const [old, next] of relabelled) {
    if (old === "" || next === "") {
      continue;
    }
    await db.execute(
      "UPDATE requests SET medicine = ? WHERE item_id IS NULL AND lower(trim(medicine)) = lower(trim(?))",
      [next, old]
    );
  }

  return ambiguous.size;
}

/**
 * Puts the old values back on the items, and on the term row when the failure
 * happened after it was rewritten. Reports the **original** failure — a
 * rollback error must not replace the error that caused it.
 */
async function rollBackRename(
  db: DbLike,
  ctx: {
    cause: unknown;
    id: string;
    itemIds: string[];
    itemsBackup: string;
    name: string;
    now: string;
    restoreColumns: readonly string[];
  }
): Promise<Error> {
  try {
    await restoreUpdatedColumns(
      db,
      "inventory_items",
      ctx.itemsBackup,
      ctx.itemIds,
      ctx.restoreColumns
    );
    await db.execute(
      "UPDATE vocabulary_terms SET name = ?, updated_at = ? WHERE id = ?",
      [ctx.name, ctx.now, ctx.id]
    );
    return ctx.cause instanceof Error
      ? ctx.cause
      : new Error(messageOf(ctx.cause));
  } catch (rollbackError) {
    return new Error(
      `${messageOf(ctx.cause)} — the automatic rollback failed too (${messageOf(rollbackError)}), so the rename may be partial.`
    );
  }
}

/**
 * Deletes a term that nothing references.
 *
 * "References" is counted at delete time rather than trusted from the panel's
 * cached row: an item can be stocked in between the list being read and the
 * Delete button being pressed, and a blocked delete is a far better outcome than
 * items pointing at a name that no longer exists.
 */
export async function deleteVocabularyTerm(id: string): Promise<void> {
  const db = await getDb();
  const current = await termById(db, id);
  if (current === null) {
    throw new Error("That term no longer exists.");
  }

  const inUse = await usageCountFor(db, current.kind, current.name);
  if (inUse > 0) {
    const noun = VOCABULARY_NOUN[current.kind];
    throw new Error(
      `Cannot delete ${current.name} — ${inUse} ${inUse === 1 ? "item uses" : "items use"} it. Reassign them first.`
    );
  }

  await db.execute("DELETE FROM vocabulary_terms WHERE id = ?", [id]);
  try {
    await recordAudit(db, {
      action: "settings",
      before: { kind: current.kind, name: current.name },
      detail: `${capitalize(VOCABULARY_NOUN[current.kind])} deleted: ${current.name}`,
      targetId: id,
      targetKind: "settings",
    });
  } catch (error) {
    try {
      await db.execute(
        "INSERT INTO vocabulary_terms (id, kind, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [
          id,
          current.kind,
          current.name,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    } catch {
      // nothing useful to add — the original message is reported below
    }
    throw new Error(messageOf(error), { cause: error });
  }

  publish(
    current.kind,
    vocabulary(current.kind).filter((term) => term !== current.name)
  );
}

/**
 * The seed rows a settings wipe puts back, so a reset database opens with the
 * same dropdowns a first launch does. Mirrors the INSERT in
 * `0013_vocabulary_terms.sql` through `seedTermId`, so ids match.
 */
export function seedVocabularyRows(): {
  created_at: string;
  id: string;
  kind: VocabularyKind;
  name: string;
  updated_at: string;
}[] {
  const now = new Date().toISOString();
  return VOCABULARY_KINDS.flatMap((kind) =>
    (vocabulary(kind) as readonly string[]).map((name) => ({
      created_at: now,
      id: seedTermId(kind, name),
      kind,
      name,
      updated_at: now,
    }))
  );
}

/** Replaces one name in a list, keeping the order the operator saw. */
function swap(
  list: readonly string[],
  from: string,
  to: string
): string[] {
  return list.map((term) => (term === from ? to : term));
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
