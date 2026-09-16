import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { getDb } from "@/lib/db";
import { deriveStatus } from "../import/inventory-status";

/**
 * Adjust threshold (CMIS-UI-04 §3.1) — the write behind the threshold popover.
 *
 * A threshold is not just a number to store: it is one of the two inputs to
 * `status`, so a row that no longer falls below it has to leave the Low-Stock
 * list immediately rather than at the next import. The status is therefore
 * re-derived here, from the qty the database actually holds — not from the qty
 * the calling row was rendered with, which may be stale by the time this runs.
 *
 * The popover documents an audit entry per spec, and the change is exactly the
 * kind of tuning an admin needs to be able to account for later.
 */

export interface UpdateThresholdInput {
  itemId: string;
  threshold: number;
}

interface ThresholdRow {
  display_name: string | null;
  name: string;
  qty: number;
  threshold: number;
}

export function useUpdateThresholdMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, threshold }: UpdateThresholdInput) => {
      const db = await getDb();
      const rows = await db.select<ThresholdRow[]>(
        "SELECT name, display_name, qty, threshold FROM inventory_items WHERE id = ? LIMIT 1",
        [itemId]
      );
      const [item] = rows;
      if (!item) {
        throw new Error("Item not found");
      }

      const status = deriveStatus(item.qty, threshold);
      const now = new Date().toISOString();
      await db.execute(
        "UPDATE inventory_items SET threshold = ?, status = ?, updated_at = ? WHERE id = ?",
        [threshold, status, now, itemId]
      );

      await recordAudit(
        db,
        {
          action: "settings",
          after: { status, threshold },
          before: {
            status: deriveStatus(item.qty, item.threshold),
            threshold: item.threshold,
          },
          detail: `Low-stock threshold for ${item.display_name || item.name} moved from ${item.threshold} to ${threshold}`,
          targetId: itemId,
          targetKind: "item",
        },
        { bestEffort: true }
      );

      return { id: itemId, status, threshold };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
