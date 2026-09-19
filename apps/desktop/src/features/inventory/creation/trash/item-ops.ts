import { recordAudit } from "@/features/admin/audit/write-audit";

import { deriveStatus } from "../../import/inventory-status";
import type { DbLike } from "../db-like";
import { insertRow, insertRows, type Row } from "../rows";
import {
  nextFreeSku,
  pluralBatches,
  pluralRecords,
  productLabel,
} from "./labels";
import {
  auditExtra,
  insertTrashRecord,
  loadTrashRow,
  parseSnapshot,
} from "./records";
import type { DeleteOptions, DeleteSummary, RestoreResult } from "./types";
import { newId, nowIso, num, text } from "./utils";

/** Which SKUs are already out there, needed to offer a suffixed one on collision. */
async function skuState(
  db: DbLike,
  excludeId: string
): Promise<{ taken: Set<string>; takenBy: Map<string, string> }> {
  const rows = await db.select<{ id: string; name: string; sku: string }[]>(
    "SELECT id, name, sku FROM inventory_items"
  );
  const taken = new Set<string>();
  const takenBy = new Map<string, string>();
  for (const { id, name, sku } of rows) {
    if (id === excludeId) {
      continue;
    }
    taken.add(sku);
    takenBy.set(sku, name);
  }
  return { taken, takenBy };
}

/**
 * Moves a product — its batches and its dispensing history — into Trash.
 *
 * Children are deleted explicitly rather than trusted to `ON DELETE CASCADE`,
 * so the snapshot stays authoritative for what a restore has to put back.
 */
export async function softDeleteItem(
  db: DbLike,
  itemId: string,
  opts: DeleteOptions = {}
): Promise<DeleteSummary> {
  const items = await db.select<Row[]>(
    "SELECT * FROM inventory_items WHERE id = ? LIMIT 1",
    [itemId]
  );
  const [item] = items;
  if (!item) {
    throw new Error("Item not found — it may already be in Trash.");
  }

  const batches = await db.select<Row[]>(
    "SELECT * FROM inventory_batches WHERE item_id = ? ORDER BY expiry, batch",
    [itemId]
  );
  const dispensingEvents = await db.select<Row[]>(
    "SELECT * FROM dispensing_events WHERE item_id = ? ORDER BY date",
    [itemId]
  );

  const label = productLabel(item);
  const totalQty = batches.reduce((sum, row) => sum + num(row.qty), 0);
  const trashId = newId();

  await insertTrashRecord(
    db,
    {
      entityId: itemId,
      itemId,
      kind: "item",
      label,
      reason: opts.reason,
      restoreHint: `SKU was ${text(item.sku)}`,
      snapshot: JSON.stringify({
        batches,
        dispensingEvents,
        item,
        kind: "item",
      }),
      trashId,
    },
    opts.actor
  );

  await db.execute("DELETE FROM dispensing_events WHERE item_id = ?", [itemId]);
  await db.execute("DELETE FROM inventory_batches WHERE item_id = ?", [itemId]);
  await db.execute("DELETE FROM inventory_items WHERE id = ?", [itemId]);

  // Atomic: a deletion must never exist without its audit row (spec §11.3).
  await recordAudit(db, {
    action: "correction",
    before: {
      batches: batches.length,
      category: text(item.category),
      dispensingRecords: dispensingEvents.length,
      name: label,
      qty: num(item.qty),
      sku: text(item.sku),
      status: text(item.status),
    },
    detail: `Deleted ${label} → Trash — ${pluralBatches(batches.length)}, ${pluralRecords(dispensingEvents.length)}${auditExtra(opts.reason)}`,
    reason: (opts.reason ?? "").trim() ? (opts.reason ?? null) : null,
    targetId: itemId,
    targetKind: "item",
  });

  return {
    batchCount: batches.length,
    dispensingCount: dispensingEvents.length,
    label,
    totalQty,
    trashId,
  };
}

/**
 * True undo of a product delete: item → batches → dispensing events (parent
 * first, FK-safe), then the trash row goes away.
 *
 * The stored `qty` is restored as-is; only `status` is re-derived, because
 * rebuilding qty from batches would zero any product that was imported without
 * batches — the same trap §10.3 documents for batch delete.
 */
export async function restoreItem(
  db: DbLike,
  trashId: string,
  opts: { actor?: string; skuOverride?: string } = {}
): Promise<RestoreResult> {
  const record = await loadTrashRow(db, trashId);
  if (!record) {
    return {
      message: "This entry is no longer in Trash.",
      ok: false,
      reason: "not-found",
    };
  }
  if (record.kind !== "item") {
    return {
      message: "Use the batch restore for this entry.",
      ok: false,
      reason: "kind-mismatch",
    };
  }

  const snapshot = parseSnapshot(record.snapshot);
  if (snapshot?.kind !== "item") {
    return {
      message: "This snapshot is unreadable and cannot be restored.",
      ok: false,
      reason: "kind-mismatch",
    };
  }

  const { batches, dispensingEvents, item } = snapshot;
  const itemId = text(item.id);
  const originalSku = text(item.sku);
  const { taken, takenBy } = await skuState(db, itemId);
  const override = opts.skuOverride?.trim();

  if (override && taken.has(override)) {
    return {
      message: `${override} is also in use.`,
      ok: false,
      reason: "sku-taken",
      suggestedSku: nextFreeSku(originalSku, taken),
      takenBy: takenBy.get(override) ?? "another product",
    };
  }
  if (!override && taken.has(originalSku)) {
    const holder = takenBy.get(originalSku) ?? "another product";
    return {
      message: `${originalSku} is in use by "${holder}".`,
      ok: false,
      reason: "sku-taken",
      suggestedSku: nextFreeSku(originalSku, taken),
      takenBy: holder,
    };
  }

  const qty = num(item.qty);
  const threshold = num(item.threshold);
  await insertRow(db, "inventory_items", {
    ...item,
    needs_batch: batches.length === 0 ? 1 : 0,
    qty,
    sku: override ?? originalSku,
    status: deriveStatus(qty, threshold),
    updated_at: nowIso(),
  });
  await insertRows(db, "inventory_batches", batches);
  await insertRows(db, "dispensing_events", dispensingEvents);

  await db.execute("DELETE FROM trash_records WHERE id = ?", [trashId]);

  const { label } = record;
  await recordAudit(db, {
    action: "correction",
    after: {
      batches: batches.length,
      dispensingRecords: dispensingEvents.length,
      qty,
      sku: override ?? originalSku,
    },
    detail: `Restored ${label} from Trash`,
    targetId: itemId,
    targetKind: "item",
  });

  return { kind: "item", label, ok: true };
}
