import { recordAudit } from "@/features/admin/audit/write-audit";
import { isPackIncomplete } from "../domain/pack-size";
import { isDetailsIncomplete } from "../domain/strength";
import { deriveStatus } from "../import/inventory-status";
import type { DbLike } from "./db-like";
import {
  type BatchDraft,
  batchQty,
  type CreationDraft,
  displayNameOf,
  type ProductDraft,
  packPartsOf,
  packSizeTextOf,
  thresholdOf,
} from "./draft";
import { insertRow, insertRows, type Row } from "./rows";
import {
  backupSuffix,
  messageOf,
  pruneBackups,
  restoreInsertedRows,
  restoreUpdatedColumns,
  snapshotTable,
} from "./snapshot";
import { activeRows } from "./validate-draft";

/**
 * Commits a whole creation draft, or nothing (spec §7.5, §10.5).
 *
 * The draft is validated before it gets here, so every failure below is either a
 * write error or a race — and both mean the same thing: put the database back
 * the way it was found and tell the operator what actually went wrong. The
 * rollback reports the *original* error, never its own, which is the lesson
 * `import/import.ts` learned the hard way.
 */

export interface CommitCreationResult {
  addedBatches: number;
  /** Every batch written, new products plus additions. */
  batches: number;
  createdItems: number;
  units: number;
}

export interface CommitCreationOptions {
  now?: string;
}

/** Columns a batch addition rewrites on an existing product. */
const ITEM_MUTATED_COLUMNS = [
  "needs_batch",
  "qty",
  "status",
  "updated_at",
] as const;

interface CommitContext {
  batchesBackup: string;
  itemsBackup: string;
  updatedItemIds: string[];
}

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === "function") {
    return uuid.call(globalThis.crypto);
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function supplierOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The batch rows a draft actually writes: blank rows are not stock. */
export function writableRows(draft: ProductDraft): BatchDraft[] {
  return activeRows(draft.batches, { allowIncomplete: draft.zeroStock });
}

export function buildBatchRow(
  draft: BatchDraft,
  opts: { fallbackSupplier: string; id: string; itemId: string }
): Row {
  return {
    batch: draft.batch.trim(),
    expiry: draft.expiry,
    id: opts.id,
    item_id: opts.itemId,
    notes: supplierOrNull(draft.notes),
    qty: batchQty(draft),
    supplier: supplierOrNull(draft.supplier || opts.fallbackSupplier),
  };
}

export function buildItemRow(
  draft: ProductDraft,
  opts: { id: string; now: string; sku: string }
): Row {
  const rows = writableRows(draft);
  const qty = rows.reduce((sum, row) => sum + batchQty(row), 0);
  const threshold = thresholdOf(draft);
  // The text is derived from the pair when there is one, so the label, the
  // identity key and the export column all read `10/box` without hand typing
  // (D24, acceptance criterion 1).
  const packSize = packSizeTextOf(draft);
  return {
    category: draft.category.trim(),
    created_at: opts.now,
    daily_sum: 0,
    display_name: displayNameOf({ ...draft, packSize }),
    // The four strength fields are the record, plus the pack pair for a
    // pack-forming item (V7). `` without a `dosage` column.
    dosage_missing:
      isDetailsIncomplete(draft) ||
      isPackIncomplete({ ...packPartsOf(draft), form: draft.form.trim() })
        ? 1
        : 0,
    form: draft.form.trim(),
    id: opts.id,
    is_no_stock: qty === 0 ? 1 : 0,
    name: draft.name.trim(),
    needs_batch: rows.length === 0 ? 1 : 0,
    notes: supplierOrNull(draft.notes),
    pack_qty: draft.packQty === "" ? 0 : draft.packQty,
    pack_size: packSize,
    pack_unit: draft.packUnit.trim(),
    qty,
    sku: opts.sku,
    status: deriveStatus(qty, threshold),
    stock_on_hand: qty,
    stock_remaining: qty,
    strength_unit: draft.strengthUnit.trim(),
    strength_value: draft.strengthValue.trim(),
    supplier: supplierOrNull(draft.supplier),
    threshold,
    total_dispensed: 0,
    total_mismatch: 0,
    updated_at: opts.now,
  };
}

/**
 * A SKU can be taken between the form being filled in and the commit landing
 * (a CSV import is one keystroke away), so the value is re-checked here rather
 * than trusted from the draft.
 */
async function assertSkusFree(db: DbLike, skus: string[]): Promise<void> {
  const rows = await db.select<{ sku: string }[]>(
    "SELECT sku FROM inventory_items"
  );
  const taken = new Set(rows.map((row) => row.sku.toLowerCase()));
  for (const sku of skus) {
    if (taken.has(sku.toLowerCase())) {
      throw new Error(
        `${sku} was taken while you were filling the form — pick another stock code.`
      );
    }
  }
}

interface ExistingItem {
  name: string;
  qty: number;
  threshold: number;
}

async function loadItem(db: DbLike, itemId: string): Promise<ExistingItem> {
  const rows = await db.select<ExistingItem[]>(
    "SELECT name, qty, threshold FROM inventory_items WHERE id = ? LIMIT 1",
    [itemId]
  );
  const [item] = rows;
  if (!item) {
    throw new Error("That product is no longer in inventory.");
  }
  return item;
}

/**
 * Restores the snapshot and reports the original failure. The snapshot is
 * authoritative for what to undo: rows absent from it were inserted by this
 * commit, and the columns of every touched row are copied back from it.
 */
async function rollBack(
  db: DbLike,
  ctx: CommitContext,
  cause: unknown
): Promise<Error> {
  try {
    await restoreInsertedRows(db, "inventory_batches", ctx.batchesBackup);
    await restoreInsertedRows(db, "inventory_items", ctx.itemsBackup);
    await restoreUpdatedColumns(
      db,
      "inventory_items",
      ctx.itemsBackup,
      ctx.updatedItemIds,
      ITEM_MUTATED_COLUMNS
    );
    return cause instanceof Error ? cause : new Error(messageOf(cause));
  } catch (rollbackError) {
    return new Error(
      `${messageOf(cause)} — the automatic rollback failed too (${messageOf(rollbackError)}), so the creation may be partial.`
    );
  }
}

export async function commitCreation(
  db: DbLike,
  draft: CreationDraft,
  opts: CommitCreationOptions = {}
): Promise<CommitCreationResult> {
  const now = opts.now ?? new Date().toISOString();
  const suffix = backupSuffix(new Date(now));

  // Snapshot first: from here on, any throw is recoverable.
  const itemsBackup = await snapshotTable(db, "inventory_items", suffix);
  const batchesBackup = await snapshotTable(db, "inventory_batches", suffix);
  const ctx: CommitContext = {
    batchesBackup,
    itemsBackup,
    updatedItemIds: [],
  };

  const result: CommitCreationResult = {
    addedBatches: 0,
    batches: 0,
    createdItems: 0,
    units: 0,
  };

  try {
    await assertSkusFree(
      db,
      draft.newProducts.map((product) => product.sku.trim())
    );

    for (const product of draft.newProducts) {
      const itemId = newId();
      const itemRow = buildItemRow(product, {
        id: itemId,
        now,
        sku: product.sku.trim(),
      });
      // biome-ignore lint/performance/noAwaitInLoops: each product writes its item, batches and audit row in order, inside one transaction
      await insertRow(db, "inventory_items", itemRow);

      const rows = writableRows(product).map((row) =>
        buildBatchRow(row, {
          fallbackSupplier: "",
          id: newId(),
          itemId,
        })
      );
      await insertRows(db, "inventory_batches", rows);

      const units = rows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0);
      await recordAudit(db, {
        action: "stock-in",
        after: {
          batches: rows.length,
          category: String(itemRow.category),
          qty: units,
          // The units that arrived, which is what the Reports "Stock Movement"
          // chart sums per day. `qty` is the resulting on-hand total on an
          // addition, so it cannot serve as the inbound amount.
          received: units,
          sku: String(itemRow.sku),
        },
        detail: `Created ${String(itemRow.display_name) || String(itemRow.name)} (${String(itemRow.sku)}) — ${rows.length} ${rows.length === 1 ? "batch" : "batches"}, ${units} units`,
        targetId: itemId,
        targetKind: "item",
      });

      result.createdItems += 1;
      result.batches += rows.length;
      result.units += units;
    }

    for (const addition of draft.additions) {
      // biome-ignore lint/performance/noAwaitInLoops: each addition reads the product's current qty before it writes, and the batch rows must land in order
      const item = await loadItem(db, addition.itemId);
      const rows = addition.batches.map((row) =>
        buildBatchRow(row, {
          fallbackSupplier: "",
          id: newId(),
          itemId: addition.itemId,
        })
      );
      await insertRows(db, "inventory_batches", rows);

      const units = rows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0);
      const newQty = item.qty + units;
      const status = deriveStatus(newQty, item.threshold);
      await db.execute(
        "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = 0, updated_at = ? WHERE id = ?",
        [newQty, status, now, addition.itemId]
      );
      ctx.updatedItemIds.push(addition.itemId);

      await recordAudit(db, {
        action: "stock-in",
        after: { batches: rows.length, qty: newQty, received: units, status },
        before: { qty: item.qty },
        detail: `Added ${rows.length} ${rows.length === 1 ? "batch" : "batches"} to ${item.name} — ${units} units`,
        targetId: addition.itemId,
        targetKind: "item",
      });

      result.addedBatches += rows.length;
      result.batches += rows.length;
      result.units += units;
    }

    // Keep the same three-snapshot retention the importer uses.
    await pruneBackups(db, "inventory_items_backup");
    await pruneBackups(db, "inventory_batches_backup");
    return result;
  } catch (error) {
    throw await rollBack(db, ctx, error);
  }
}
