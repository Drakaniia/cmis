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
import {
  type Category,
  newCategoryId,
  normalizeCategoryName,
  validateCategoryName,
} from "../domain/categories";

/**
 * Read and write paths for the shared category list (migration 0006).
 *
 * Three rules shape this module:
 *
 * 1. **The name is the relationship.** `inventory_items.category` stores the
 *    name, so a rename rewrites every item that carries the old text. If that
 *    cascade ever landed without the `categories` row — or the other way round —
 *    items would point at a category no dropdown offers, and the operator would
 *    have to retype it. So the item update runs first and is restored if
 *    anything after it fails.
 *
 * 2. **The audit row is not optional.** A category change is a `settings` event
 *    that affects the whole app, and deletion in particular must never exist
 *    without its log entry — so a failed audit write undoes the data write
 *    rather than leaving an unexplained change behind.
 *
 * 3. **No SQL transactions.** `tauri-plugin-sql` serves each statement from
 *    whichever pooled connection is free, so `BEGIN`/`COMMIT` cannot span a
 *    write sequence; `creation/snapshot.ts` is the app's substitute, and the
 *    rename reuses it rather than inventing a second convention.
 */

/** Column list, kept in one place so a select can never drift from an insert. */
const CATEGORY_SELECT = "SELECT id, name FROM categories";

/** Columns a rename rewrites on the items that carry the old name. */
const ITEM_MUTATED_COLUMNS = ["category", "updated_at"] as const;

interface CategoryRow {
  id: string;
  name: string;
}

interface CountRow {
  c: number;
}

/** How many items carry this category's name right now. */
async function itemCountFor(db: DbLike, name: string): Promise<number> {
  const rows = await db.select<CountRow[]>(
    "SELECT COUNT(*) AS c FROM inventory_items WHERE category = ?",
    [name]
  );
  return rows[0]?.c ?? 0;
}

async function namesIn(db: DbLike): Promise<string[]> {
  const rows = await db.select<{ name: string }[]>(
    `${CATEGORY_SELECT} ORDER BY name COLLATE NOCASE`
  );
  return rows.map((row) => row.name);
}

async function categoryById(
  db: DbLike,
  id: string
): Promise<CategoryRow | null> {
  const rows = await db.select<CategoryRow[]>(
    `${CATEGORY_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Every category with the number of items that currently use it. */
export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    `${CATEGORY_SELECT} ORDER BY name COLLATE NOCASE`
  );
  const counts = await Promise.all(
    rows.map((row) => itemCountFor(db, row.name))
  );
  return rows.map((row, index) => ({
    id: row.id,
    itemCount: counts[index] ?? 0,
    name: row.name,
  }));
}

/**
 * Adds one category. Uniqueness is checked here as well as by the table's
 * index, so the operator gets a sentence instead of a constraint error.
 *
 * The row is deleted again if the audit write fails, keeping rule 2 above: a
 * change nobody can account for must not survive.
 */
export async function createCategory(name: string): Promise<Category> {
  const db = await getDb();
  const clean = normalizeCategoryName(name);
  const problem = validateCategoryName(clean, await namesIn(db));
  if (problem !== null) {
    throw new Error(problem);
  }

  const id = newCategoryId();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, clean, now, now]
  );

  try {
    await recordAudit(db, {
      action: "settings",
      after: { name: clean },
      detail: `Category added: ${clean}`,
      targetId: id,
      targetKind: "settings",
    });
  } catch (error) {
    // Undo the insert rather than leaving a change the log cannot explain. The
    // audit failure is the error the operator needs to see, so a failing undo
    // must not replace it.
    try {
      await db.execute("DELETE FROM categories WHERE id = ?", [id]);
    } catch {
      // nothing useful to add — the original message is reported below
    }
    throw new Error(messageOf(error), { cause: error });
  }

  return { id, itemCount: 0, name: clean };
}

export interface RenameCategoryResult {
  /** How many inventory items were rewritten to the new name. */
  itemsUpdated: number;
}

/**
 * Renames a category and cascades the new name over the items that used it.
 *
 * The item update is rolled back from a snapshot if either the category row or
 * the audit row fails, so a partial rename cannot be observed. `itemsUpdated`
 * is reported so the caller can tell the operator what moved.
 */
export async function renameCategory(
  id: string,
  name: string
): Promise<RenameCategoryResult> {
  const db = await getDb();
  const current = await categoryById(db, id);
  if (current === null) {
    throw new Error("That category no longer exists.");
  }

  const clean = normalizeCategoryName(name);
  if (clean === current.name) {
    return { itemsUpdated: 0 };
  }
  const problem = validateCategoryName(clean, await namesIn(db), {
    ignore: current.name,
  });
  if (problem !== null) {
    throw new Error(problem);
  }

  const suffix = backupSuffix();
  const itemsBackup = await snapshotTable(db, "inventory_items", suffix);
  const affected = await db.select<{ id: string }[]>(
    "SELECT id FROM inventory_items WHERE category = ?",
    [current.name]
  );
  const itemIds = affected.map((row) => row.id);
  const now = new Date().toISOString();

  try {
    if (itemIds.length > 0) {
      await db.execute(
        "UPDATE inventory_items SET category = ?, updated_at = ? WHERE category = ?",
        [clean, now, current.name]
      );
    }
    await db.execute(
      "UPDATE categories SET name = ?, updated_at = ? WHERE id = ?",
      [clean, now, id]
    );
    await recordAudit(db, {
      action: "settings",
      after: { itemsUpdated: itemIds.length, name: clean },
      before: { name: current.name },
      detail: `Category renamed: ${current.name} → ${clean} (${itemIds.length} ${itemIds.length === 1 ? "item" : "items"})`,
      targetId: id,
      targetKind: "settings",
    });
  } catch (error) {
    throw await rollBackRename(db, {
      cause: error,
      id,
      itemIds,
      itemsBackup,
      name: current.name,
      now,
    });
  }

  await pruneBackups(db, "inventory_items_backup");
  return { itemsUpdated: itemIds.length };
}

/**
 * Puts the old name back on the items, and on the category row when the failure
 * happened after it was rewritten. Reports the *original* failure — a rollback
 * error must not replace the error that caused it.
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
  }
): Promise<Error> {
  try {
    await restoreUpdatedColumns(
      db,
      "inventory_items",
      ctx.itemsBackup,
      ctx.itemIds,
      ITEM_MUTATED_COLUMNS
    );
    await db.execute(
      "UPDATE categories SET name = ?, updated_at = ? WHERE id = ?",
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
 * Deletes a category that nothing references.
 *
 * "References" is counted at delete time rather than trusted from the panel's
 * cached row: an item can be stocked in between the list being read and the
 * Delete button being pressed, and a blocked delete is a far better outcome than
 * items pointing at a name that no longer exists.
 */
export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  const current = await categoryById(db, id);
  if (current === null) {
    throw new Error("That category no longer exists.");
  }

  const inUse = await itemCountFor(db, current.name);
  if (inUse > 0) {
    throw new Error(
      `Cannot delete ${current.name} — ${inUse} ${inUse === 1 ? "item uses" : "items use"} it. Reassign them first.`
    );
  }

  await db.execute("DELETE FROM categories WHERE id = ?", [id]);
  try {
    await recordAudit(db, {
      action: "settings",
      before: { name: current.name },
      detail: `Category deleted: ${current.name}`,
      targetId: id,
      targetKind: "settings",
    });
  } catch (error) {
    // The row is put back so the log and the data cannot disagree.
    try {
      await db.execute(
        "INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [id, current.name, new Date().toISOString(), new Date().toISOString()]
      );
    } catch {
      // nothing useful to add — the original message is reported below
    }
    throw new Error(messageOf(error), { cause: error });
  }
}
