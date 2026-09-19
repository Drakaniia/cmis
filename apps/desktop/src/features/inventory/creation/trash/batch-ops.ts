import { recordAudit } from "@/features/admin/audit/write-audit";

import { deriveStatus } from "../../import/inventory-status";
import type { DbLike } from "../db-like";
import { insertRow, type Row } from "../rows";
import { restoreItem } from "./item-ops";
import { productLabel } from "./labels";
import {
  auditExtra,
  insertTrashRecord,
  loadTrashRow,
  parseSnapshot,
} from "./records";
import type {
  BatchDeleteSummary,
  BatchRef,
  DeleteOptions,
  RestoreResult,
} from "./types";
import { newId, nowIso, num, text } from "./utils";

/**
 * Moves one batch into Trash and corrects the product's qty by subtraction
 * (spec §10.3) — the same arithmetic `useStockOutMutation` already applies.
 */
export async function softDeleteBatch(
  db: DbLike,
  ref: BatchRef,
  opts: DeleteOptions = {}
): Promise<BatchDeleteSummary> {
  const batches =
    "batchId" in ref
      ? await db.select<Row[]>(
          "SELECT * FROM inventory_batches WHERE id = ? LIMIT 1",
          [ref.batchId]
        )
      : await db.select<Row[]>(
          "SELECT * FROM inventory_batches WHERE item_id = ? AND batch = ? LIMIT 1",
          [ref.itemId, ref.batchName]
        );
  const [batch] = batches;
  if (!batch) {
    throw new Error("Batch not found — it may already be in Trash.");
  }

  const itemId = text(batch.item_id);
  const items = await db.select<Row[]>(
    "SELECT * FROM inventory_items WHERE id = ? LIMIT 1",
    [itemId]
  );
  const [item] = items;
  if (!item) {
    throw new Error("Product not found for this batch.");
  }

  const batchId = text(batch.id);
  const batchQty = num(batch.qty);
  const qtyBefore = num(item.qty);
  const qtyAfter = Math.max(0, qtyBefore - batchQty);
  const threshold = num(item.threshold);
  const productName = productLabel(item);
  const trashId = newId();

  await insertTrashRecord(
    db,
    {
      entityId: batchId,
      itemId,
      kind: "batch",
      label: `${text(batch.batch)} · ${batchQty} units`,
      reason: opts.reason,
      restoreHint: `Batch of ${productName}`,
      snapshot: JSON.stringify({ batch, item, kind: "batch" }),
      trashId,
    },
    opts.actor
  );

  await db.execute("DELETE FROM inventory_batches WHERE id = ?", [batchId]);

  const remaining = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM inventory_batches WHERE item_id = ?",
    [itemId]
  );
  const needsBatch = (remaining[0]?.c ?? 0) === 0 ? 1 : 0;
  const status = deriveStatus(qtyAfter, threshold);

  await db.execute(
    "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = ?, updated_at = ? WHERE id = ?",
    [qtyAfter, status, needsBatch, nowIso(), itemId]
  );

  await recordAudit(db, {
    action: "correction",
    after: { needsBatch, qty: qtyAfter, status },
    before: { qty: qtyBefore, status: text(item.status) },
    detail: `Deleted batch ${text(batch.batch)} from ${productName} — ${batchQty} units (${qtyBefore} → ${qtyAfter})${auditExtra(opts.reason)}`,
    reason: (opts.reason ?? "").trim() ? (opts.reason ?? null) : null,
    targetId: batchId,
    targetKind: "batch",
  });

  return {
    batchCount: 1,
    dispensingCount: 0,
    itemId,
    label: `${text(batch.batch)} · ${batchQty} units`,
    productName,
    qtyAfter,
    qtyBefore,
    totalQty: batchQty,
    trashId,
  };
}

/**
 * Restores a single batch and puts its qty back on the product — the exact
 * inverse of `softDeleteBatch`. A batch whose product is itself in Trash brings
 * the product back with it (the product snapshot already carries every batch).
 */
export async function restoreBatch(
  db: DbLike,
  trashId: string
): Promise<RestoreResult> {
  const record = await loadTrashRow(db, trashId);
  if (!record) {
    return {
      message: "This entry is no longer in Trash.",
      ok: false,
      reason: "not-found",
    };
  }
  if (record.kind !== "batch") {
    return {
      message: "Use the product restore for this entry.",
      ok: false,
      reason: "kind-mismatch",
    };
  }

  const snapshot = parseSnapshot(record.snapshot);
  if (snapshot?.kind !== "batch") {
    return {
      message: "This snapshot is unreadable and cannot be restored.",
      ok: false,
      reason: "kind-mismatch",
    };
  }

  const { batch } = snapshot;
  const itemId = text(batch.item_id);
  const items = await db.select<Row[]>(
    "SELECT * FROM inventory_items WHERE id = ? LIMIT 1",
    [itemId]
  );
  const [item] = items;

  if (!item) {
    const parentTrash = await db.select<{ id: string }[]>(
      "SELECT id FROM trash_records WHERE kind = 'item' AND entity_id = ? LIMIT 1",
      [itemId]
    );
    const parentId = parentTrash[0]?.id;
    if (!parentId) {
      return {
        message:
          "The product for this batch is no longer in inventory, and it is not in Trash.",
        ok: false,
        reason: "product-missing",
      };
    }
    return await restoreItem(db, parentId);
  }

  await insertRow(db, "inventory_batches", batch);
  await db.execute("DELETE FROM trash_records WHERE id = ?", [trashId]);

  const batchQty = num(batch.qty);
  const qtyBefore = num(item.qty);
  const qty = qtyBefore + batchQty;
  const threshold = num(item.threshold);
  await db.execute(
    "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = 0, updated_at = ? WHERE id = ?",
    [qty, deriveStatus(qty, threshold), nowIso(), itemId]
  );

  const label = `${text(batch.batch)} · ${batchQty} units`;
  await recordAudit(db, {
    action: "correction",
    after: { qty },
    before: { qty: qtyBefore },
    detail: `Restored batch ${label} to ${productLabel(item)} from Trash`,
    targetId: text(batch.id),
    targetKind: "batch",
  });

  return { kind: "batch", label, ok: true };
}
