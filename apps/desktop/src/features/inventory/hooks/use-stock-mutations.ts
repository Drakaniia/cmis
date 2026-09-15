import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
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
async function decrementBatch(
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
async function recordDispensing(
  db: Db,
  itemId: string,
  qty: number
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const day = new Date().getDate();
  const month = today.slice(0, 7);
  // Upsert daily event: insert or add
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
        "SELECT id, qty, threshold FROM inventory_items WHERE sku = ? OR lower(name) = lower(trim(?)) LIMIT 1",
        [payload.identifier, payload.name]
      );
      if (rows.length === 0) {
        throw new Error(`Item not found: ${payload.identifier}`);
      }
      const [item] = rows;
      const newQty = item.qty + payload.qty;
      const newStatus = deriveStatus(newQty, item.threshold);
      const batchId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `batch-${Date.now()}`;

      await db.execute(
        "INSERT INTO inventory_batches (id, item_id, batch, expiry, qty, supplier) VALUES (?, ?, ?, ?, ?, ?)",
        [
          batchId,
          item.id,
          payload.batch,
          payload.expiry,
          payload.qty,
          payload.supplier,
        ]
      );
      await db.execute(
        "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = 0, updated_at = ? WHERE id = ?",
        [newQty, newStatus, nowIso(), item.id]
      );
      return { id: item.id, qty: newQty };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
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
        { id: string; qty: number; threshold: number }[]
      >("SELECT id, qty, threshold FROM inventory_items WHERE id = ? LIMIT 1", [
        payload.itemId,
      ]);
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

      return { id: payload.itemId, qty: newQty };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
