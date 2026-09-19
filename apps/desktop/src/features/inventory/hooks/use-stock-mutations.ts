import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";
import {
  composeDisplayName,
  isDetailsIncomplete,
  type StrengthParts,
} from "../domain/strength";
import { deriveStatus } from "../import/inventory-status";
import type { StockInPayload, StockOutPayload } from "../types";

type Db = Awaited<ReturnType<typeof getDb>>;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Decrements the named batch, clearing it when the take exhausts it. Batches are
 * optional on a stock-out, so nothing happens when the payload names none.
 */
export async function decrementBatch(
  db: Db,
  itemId: string,
  batchName: string,
  qty: number
): Promise<void> {
  const batchRows = await db.select<{ id: string; qty: number }[]>(
    "SELECT id, qty FROM inventory_batches WHERE item_id = ? AND batch = ? LIMIT 1",
    [itemId, batchName]
  );
  const [batch] = batchRows;
  if (!batch) {
    return;
  }
  const newBatchQty = batch.qty - qty;
  if (newBatchQty <= 0) {
    await db.execute("DELETE FROM inventory_batches WHERE id = ?", [batch.id]);
    return;
  }
  await db.execute("UPDATE inventory_batches SET qty = ? WHERE id = ?", [
    newBatchQty,
    batch.id,
  ]);
}

/** Keeps the dispensing log in step with the qty just taken off the shelf. */
export async function recordDispensing(
  db: Db,
  itemId: string,
  qty: number
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const day = new Date().getDate();
  const month = today.slice(0, 7);
  // Atomic daily upsert so two concurrent dispenses for the same item on the
  // same day do not both INSERT or both read 10 and both write 13, losing one
  // take. Requires the unique index on (item_id, date) added in migration
  // 0010 — without it ON CONFLICT has no target. The fallback keeps the old
  // SELECT-then-write working on a build that has not yet migrated.
  try {
    await db.execute(
      `INSERT INTO dispensing_events (item_id, date, day, month, qty) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, date) DO UPDATE SET qty = qty + excluded.qty`,
      [itemId, today, day, month, qty]
    );
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflictUnsupported =
      message.includes("ON CONFLICT") || message.includes("no such column");
    if (!isConflictUnsupported) {
      throw error;
    }
  }
  const existing = await db.select<{ qty: number }[]>(
    "SELECT qty FROM dispensing_events WHERE item_id = ? AND date = ?",
    [itemId, today]
  );
  if (existing.length > 0) {
    await db.execute(
      "UPDATE dispensing_events SET qty = qty + ? WHERE item_id = ? AND date = ?",
      [qty, itemId, today]
    );
    return;
  }
  await db.execute(
    "INSERT INTO dispensing_events (item_id, date, day, month, qty) VALUES (?, ?, ?, ?, ?)",
    [itemId, today, day, month, qty]
  );
}

export function useStockInMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: StockInPayload) => {
      const db = await getDb();
      // Find item by sku or name match
      const rows = await db.select<
        { id: string; qty: number; threshold: number }[]
      >(
        "SELECT id, qty, threshold FROM inventory_items WHERE sku = ? OR lower(trim(name)) = lower(trim(?)) OR lower(trim(display_name)) = lower(trim(?)) LIMIT 1",
        [payload.identifier, payload.name, payload.name]
      );
      if (rows.length === 0) {
        throw new Error(`Item not found: ${payload.identifier}`);
      }
      const [item] = rows;
      const newQty = item.qty + payload.qty;
      const newStatus = deriveStatus(newQty, item.threshold);
      const parts: StrengthParts = {
        form: payload.form,
        packSize: payload.packSize,
        strengthUnit: payload.strengthUnit,
        strengthValue: payload.strengthValue,
      };
      const batchId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `batch-${Date.now()}`;

      const supplierValue =
        payload.supplier === "" ? null : (payload.supplier ?? null);
      await db.execute(
        "INSERT INTO inventory_batches (id, item_id, batch, expiry, qty, supplier) VALUES (?, ?, ?, ?, ?, ?)",
        [
          batchId,
          item.id,
          payload.batch,
          payload.expiry,
          payload.qty,
          supplierValue,
        ]
      );
      // The strength fields are written alongside the quantity: Step 2 prefills
      // them from the item and the operator may correct them, so a stock-in is
      // also the moment a row stops being "details incomplete" (spec §8.4).
      await db.execute(
        `UPDATE inventory_items SET qty = ?, status = ?, needs_batch = 0,
              strength_value = ?, strength_unit = ?, form = ?, pack_size = ?,
              display_name = ?, dosage_missing = ?, updated_at = ?
         WHERE id = ?`,
        [
          newQty,
          newStatus,
          parts.strengthValue,
          parts.strengthUnit,
          parts.form,
          parts.packSize,
          composeDisplayName({ ...parts, name: payload.name }),
          isDetailsIncomplete(parts) ? 1 : 0,
          nowIso(),
          item.id,
        ]
      );
      // A stock-in used to leave no trail at all: the batch and the quantity
      // changed with nothing to say a delivery happened, so the audit log could
      // not answer "what came in this week" and Reports had no inbound series.
      // `received` is the amount that arrived — `qty` is the resulting total.
      // Best effort, so a broken log never loses the delivered stock.
      await recordAudit(
        db,
        {
          action: "stock-in",
          after: {
            qty: newQty,
            received: payload.qty,
            status: newStatus,
          },
          before: { qty: item.qty },
          detail: `${payload.name}: received ${payload.qty} ${payload.qty === 1 ? "unit" : "units"}${payload.batch ? ` (batch ${payload.batch})` : ""} — ${newQty} on hand`,
          targetId: item.id,
          targetKind: "item",
        },
        { bestEffort: true }
      );
      return { id: item.id, qty: newQty };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      qc.invalidateQueries({ queryKey: ["inventory_items_count"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useStockOutMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: StockOutPayload) => {
      const db = await getDb();
      const itemRows = await db.select<
        {
          display_name: string | null;
          id: string;
          name: string;
          qty: number;
          threshold: number;
        }[]
      >(
        "SELECT id, name, display_name, qty, threshold FROM inventory_items WHERE id = ? LIMIT 1",
        [payload.itemId]
      );
      if (itemRows.length === 0) {
        throw new Error("Item not found");
      }
      const [item] = itemRows;
      if (payload.qty > item.qty) {
        throw new Error("Insufficient stock");
      }

      // Decrement batch qty if batch specified, else just item qty
      if (payload.batch) {
        await decrementBatch(db, payload.itemId, payload.batch, payload.qty);
      }

      const newQty = item.qty - payload.qty;
      const newStatus = deriveStatus(newQty, item.threshold);
      const remainingBatches = await db.select<{ c: number }[]>(
        "SELECT COUNT(*) as c FROM inventory_batches WHERE item_id = ?",
        [payload.itemId]
      );
      const needsBatch = (remainingBatches[0]?.c ?? 0) === 0 ? 1 : 0;

      await db.execute(
        "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = ?, updated_at = ? WHERE id = ?",
        [newQty, newStatus, needsBatch, nowIso(), payload.itemId]
      );

      // Record dispensing event for today if reason is Dispensed
      if (payload.reason === "Dispensed") {
        await recordDispensing(db, payload.itemId, payload.qty);
      }

      // A disposal's free-text reason has no other home — `dispensing_events`
      // records what left the shelf as a dispense, and no table records why
      // stock was thrown away. Best effort, so a broken log never loses the
      // write.
      const freeText = payload.reasonOther?.trim();
      await recordAudit(
        db,
        {
          action: "stock-out",
          after: { qty: newQty, status: newStatus },
          before: { qty: item.qty },
          detail: `${item.display_name || item.name}: ${payload.reason} ${payload.qty} ${payload.qty === 1 ? "unit" : "units"}${freeText ? ` — ${freeText}` : ""}${payload.batch ? ` (batch ${payload.batch})` : ""}, ${newQty} left`,
          targetId: payload.itemId,
          targetKind: "item",
        },
        { bestEffort: true }
      );

      return { id: payload.itemId, qty: newQty };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      qc.invalidateQueries({ queryKey: ["inventory_items_count"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
