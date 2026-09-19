import { recordAudit } from "@/features/admin/audit/write-audit";

import type { DbLike } from "../db-like";
import { loadTrashRow, parseSnapshot } from "./records";
import type { PurgeSummary } from "./types";

/**
 * Permanent removal of a single Trash entry.
 *
 * A purged batch does **not** touch `item.qty` again: the subtraction already
 * happened when it was deleted, so repeating it here would double-count.
 */
async function purgeOne(db: DbLike, trashId: string): Promise<PurgeSummary> {
  const record = await loadTrashRow(db, trashId);
  const summary: PurgeSummary = {
    batches: 0,
    dispensingRecords: 0,
    products: 0,
  };
  if (!record) {
    return summary;
  }
  const snapshot = parseSnapshot(record.snapshot);

  if (record.kind === "batch") {
    await db.execute("DELETE FROM inventory_batches WHERE id = ?", [
      record.entity_id,
    ]);
    summary.batches = 1;
  } else {
    const itemId = record.entity_id;
    const isItemSnapshot = snapshot?.kind === "item";
    await db.execute("DELETE FROM dispensing_events WHERE item_id = ?", [
      itemId,
    ]);
    await db.execute("DELETE FROM inventory_batches WHERE item_id = ?", [
      itemId,
    ]);
    await db.execute("DELETE FROM inventory_items WHERE id = ?", [itemId]);
    summary.products = 1;
    summary.batches = isItemSnapshot ? snapshot.batches.length : 0;
    summary.dispensingRecords = isItemSnapshot
      ? snapshot.dispensingEvents.length
      : 0;
  }

  await db.execute("DELETE FROM trash_records WHERE id = ?", [trashId]);

  await recordAudit(db, {
    action: "correction",
    detail: `Permanently deleted ${record.label} — removed from Trash for good`,
    targetId: record.entity_id,
    targetKind: record.kind === "batch" ? "batch" : "item",
  });

  return summary;
}

export async function purgeTrash(
  db: DbLike,
  trashIds: string[]
): Promise<PurgeSummary> {
  // Independent entries, so they can go in parallel — inside one entry the
  // order stays children-before-parent, which is what `purgeOne` guarantees.
  const parts = await Promise.all(trashIds.map((id) => purgeOne(db, id)));
  return parts.reduce<PurgeSummary>(
    (total, part) => ({
      batches: total.batches + part.batches,
      dispensingRecords: total.dispensingRecords + part.dispensingRecords,
      products: total.products + part.products,
    }),
    { batches: 0, dispensingRecords: 0, products: 0 }
  );
}
