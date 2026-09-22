import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import type { ItemUpdateValues } from "../domain/item-update";

/**
 * Persists an edited item (spec §8.3, decision 16).
 *
 * The column values are computed by `domain/item-update.ts` rather than here, so
 * what a save *means* — the recomputed `display_name`, the repurposed
 * `dosage_missing`, the derived `status` — is unit-tested without a database.
 * This hook only writes them and refreshes the lists.
 *
 * SKUs are written from the draft as typed and never regenerated: the spec
 * forbids renumbering an existing product (decision 10), so the form is the only
 * thing that may change one.
 */

/**
 * Every column `ItemUpdateValues` names, and nothing else.
 *
 * `dosage` is deliberately absent: it is `NOT NULL` with a `''` default today,
 * and the run-once backfill reads it and then drops the column (0005 §6.2) — so
 * naming it here would either write a NULL the schema rejects or blow up once
 * the column is gone. The strength columns are the source of truth.
 */
const UPDATE_COLUMNS = [
  "category",
  "display_name",
  "dosage_missing",
  "form",
  "name",
  "pack_qty",
  "pack_size",
  "pack_unit",
  "qty",
  "sku",
  "status",
  "strength_unit",
  "strength_value",
  "supplier",
  "threshold",
] as const satisfies readonly (keyof ItemUpdateValues)[];

type UpdateValues = ItemUpdateValues & { id: string };

export function useItemUpdateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: UpdateValues) => {
      const db = await getDb();
      const assignments = UPDATE_COLUMNS.map((column) => `${column} = ?`).join(
        ", "
      );
      await db.execute(
        `UPDATE inventory_items SET ${assignments}, updated_at = ? WHERE id = ?`,
        [
          ...UPDATE_COLUMNS.map(
            (column) => values[column as keyof ItemUpdateValues]
          ),
          new Date().toISOString(),
          id,
        ]
      );
      return { id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      qc.invalidateQueries({ queryKey: ["inventory_items_count"] });
      // The detail's dispensing history matches on `display_name`, which a save
      // may have just recomputed.
      qc.invalidateQueries({ queryKey: ["item_history"] });
    },
  });
}
