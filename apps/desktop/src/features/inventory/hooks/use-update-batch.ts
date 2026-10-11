import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";
import { deriveStatus } from "../import/inventory-status";

/**
 * Edit batch — the write behind the batch edit modal.
 *
 * A delivery is often recorded against a lot whose number, expiry, count or
 * supplier is only known once the paperwork catches up, so the batch row has to
 * be correctable after the fact. The four editable columns are the ones the
 * shelf actually reads; the row's `id` never changes, so a rename is a label
 * change rather than a delete-and-reinsert (which would drop the batch's trash
 * snapshot and its link from history).
 *
 * Only the **delta** is applied to the product's qty. `inventory_items.qty` is
 * the running shelf total and may already reflect dispensing that the batch
 * rows do not, so the edit moves it by `new - old` rather than rewriting it as
 * the batches' sum — the same arithmetic `useStockOutMutation` and
 * `softDeleteBatch` use.
 *
 * The audit write is `bestEffort`: the operator's correction is the real work,
 * and a broken log must not lose it (`write-audit.ts` documents the asymmetry).
 */

export interface UpdateBatchInput {
  /** The batch name as stored now — how the row is found. */
  batch: string;
  expiry: string;
  itemId: string;
  /** The corrected name; may equal `batch`. */
  nextBatch: string;
  qty: number;
  supplier: string;
}

interface BatchRow {
  batch: string;
  expiry: string | null;
  id: string;
  qty: number;
  supplier: string | null;
}

interface ItemRow {
  qty: number;
  threshold: number;
}

export function useUpdateBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      batch,
      expiry,
      itemId,
      nextBatch,
      qty,
      supplier,
    }: UpdateBatchInput) => {
      const db = await getDb();
      const rows = await db.select<BatchRow[]>(
        "SELECT id, batch, expiry, qty, supplier FROM inventory_batches WHERE item_id = ? AND batch = ? LIMIT 1",
        [itemId, batch]
      );
      const [row] = rows;
      if (!row) {
        throw new Error(`Batch ${batch} is no longer on this item`);
      }

      const cleanName = nextBatch.trim();
      const cleanExpiry = expiry.trim();
      const cleanSupplier = supplier.trim();

      if (
        cleanName.toLowerCase() !== batch.trim().toLowerCase() &&
        (
          await db.select<{ id: string }[]>(
            "SELECT id FROM inventory_batches WHERE item_id = ? AND batch = ? LIMIT 1",
            [itemId, cleanName]
          )
        ).length > 0
      ) {
        throw new Error(`Another batch already uses the name ${cleanName}`);
      }

      const items = await db.select<ItemRow[]>(
        "SELECT qty, threshold FROM inventory_items WHERE id = ? LIMIT 1",
        [itemId]
      );
      const [item] = items;
      if (!item) {
        throw new Error("Product not found for this batch.");
      }

      const qtyBefore = Number(item.qty ?? 0);
      const delta = qty - Number(row.qty ?? 0);
      const qtyAfter = Math.max(0, qtyBefore + delta);
      const status = deriveStatus(qtyAfter, Number(item.threshold ?? 0));
      const previousExpiry = row.expiry ?? "";
      const previousSupplier = row.supplier ?? "";

      await db.execute(
        "UPDATE inventory_batches SET batch = ?, expiry = ?, qty = ?, supplier = ? WHERE id = ?",
        [cleanName, cleanExpiry, qty, cleanSupplier, row.id]
      );
      await db.execute(
        "UPDATE inventory_items SET qty = ?, status = ?, updated_at = ? WHERE id = ?",
        [qtyAfter, status, new Date().toISOString(), itemId]
      );

      await recordAudit(
        db,
        {
          action: "correction",
          after: {
            batch: cleanName,
            expiry: cleanExpiry,
            qty,
            supplier: cleanSupplier,
          },
          before: {
            batch: row.batch,
            expiry: previousExpiry,
            qty: Number(row.qty ?? 0),
            supplier: previousSupplier,
          },
          detail: `Edited batch ${row.batch} → ${cleanName}: qty ${Number(row.qty ?? 0)} → ${qty}, expiry ${previousExpiry || "no date"} → ${cleanExpiry || "no date"}, supplier ${previousSupplier || "none"} → ${cleanSupplier || "none"}`,
          targetId: row.id,
          targetKind: "batch",
        },
        { bestEffort: true }
      );

      return { batch: cleanName, id: row.id, qty, qtyAfter };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
