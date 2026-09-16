import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";

/**
 * Extend expiry (CMIS-UI-03 §3) — the write behind the Extend Expiry modal.
 *
 * An item's expiry is derived from its batches when the inventory is read, so
 * moving the batch is the whole change: no `inventory_items` row is written and
 * the nearest expiry follows on the next refetch.
 *
 * The modal requires a note explaining the extension, and `inventory_batches`
 * has no column to hold it — the audit log is the note's only home. That write
 * is therefore `bestEffort`: the operator's extension is the real work, and a
 * broken log must not lose it (the same asymmetry `write-audit.ts` documents).
 */

export interface ExtendExpiryInput {
  batch: string;
  itemId: string;
  newExpiry: string;
  note: string;
}

export function useExtendExpiryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      batch,
      itemId,
      newExpiry,
      note,
    }: ExtendExpiryInput) => {
      const db = await getDb();
      const rows = await db.select<{ expiry: string | null; id: string }[]>(
        "SELECT id, expiry FROM inventory_batches WHERE item_id = ? AND batch = ? LIMIT 1",
        [itemId, batch]
      );
      const [row] = rows;
      if (!row) {
        throw new Error(`Batch ${batch} is no longer on this item`);
      }
      const previousExpiry = row.expiry ?? "";

      await db.execute("UPDATE inventory_batches SET expiry = ? WHERE id = ?", [
        newExpiry,
        row.id,
      ]);

      await recordAudit(
        db,
        {
          action: "correction",
          after: { batch, expiry: newExpiry },
          before: { batch, expiry: previousExpiry },
          detail: `Expiry extended for ${batch} from ${previousExpiry || "no date"} to ${newExpiry}`,
          reason: note,
          targetId: row.id,
          targetKind: "batch",
        },
        { bestEffort: true }
      );

      return { batch, expiry: newExpiry, id: row.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
