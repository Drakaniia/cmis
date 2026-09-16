import { useQuery } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import { composeDisplayName } from "../domain/strength";
import type { InventoryItem } from "../types";

/**
 * `dosage` is deliberately absent: the backfill drops it and the four strength
 * columns become the source of truth (decisions 5 + 24). Selecting a column that
 * no longer exists would fail the whole query, not just one field.
 */
interface InventoryRow {
  category: string | null;
  created_at: string;
  daily_sum: number;
  display_name: string | null;
  dosage_missing: number;
  form: string | null;
  id: string;
  is_no_stock: number;
  name: string;
  needs_batch: number;
  pack_size: string | null;
  qty: number;
  sku: string;
  status: string;
  stock_on_hand: number | null;
  stock_remaining: number | null;
  strength_unit: string | null;
  strength_value: string | null;
  supplier: string | null;
  threshold: number;
  total_dispensed: number;
  total_mismatch: number;
  updated_at: string;
}

interface BatchRow {
  batch: string;
  expiry: string | null;
  id: string;
  item_id: string;
  qty: number;
  supplier: string | null;
}

function mapRowToItem(row: InventoryRow, batches: BatchRow[]): InventoryItem {
  const name = row.name.trim();
  const parts = {
    form: row.form ?? "",
    name,
    packSize: row.pack_size ?? "",
    strengthUnit: row.strength_unit ?? "",
    strengthValue: row.strength_value ?? "",
  };
  // The stored label is authoritative — dispense requests match against exactly
  // this string. The composed fallback only covers a row the backfill has not
  // reached yet.
  const displayName =
    (row.display_name ?? "").trim() || composeDisplayName(parts);
  // derive nearest expiry from batches
  const expiry =
    batches.length > 0
      ? ([...batches].sort((a, b) =>
          (a.expiry ?? "").localeCompare(b.expiry ?? "")
        )[0].expiry ?? "")
      : "";
  return {
    batches: batches.map((b: BatchRow) => ({
      batch: b.batch,
      expiry: b.expiry ?? "",
      qty: b.qty,
      supplier: b.supplier ?? "",
    })),
    category: row.category ?? "Uncategorized",
    // `dosage_missing` is now "details incomplete" (§6.4).
    detailsIncomplete: row.dosage_missing === 1,
    dispensingHistory: [],
    displayName,
    expiry,
    // The strength columns exist from migration 0004 but rows written before
    // it carry the default ''. Blank is a valid state.
    form: row.form ?? "",
    id: row.id,
    // The bare name: the list renders `composeListLabel` and the detail header
    // renders `displayName`, so nothing needs the two glued together here.
    name,
    packSize: row.pack_size ?? "",
    qty: row.qty,
    sku: row.sku,
    status: row.status as InventoryItem["status"],
    strengthUnit: row.strength_unit ?? "",
    strengthValue: row.strength_value ?? "",
    supplier: row.supplier ?? "",
    threshold: row.threshold,
  };
}

export function useInventoryItems() {
  return useQuery({
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<InventoryItem[]> => {
      const db = await getDb();
      // Ordered by the strength pair rather than the dropped `dosage` column, so
      // the list keeps a stable, human order for same-named products.
      const rows = await db.select<InventoryRow[]>(
        "SELECT * FROM inventory_items ORDER BY name COLLATE NOCASE, strength_value COLLATE NOCASE, form COLLATE NOCASE"
      );
      // Fetch batches for all items in one query if table exists
      const batchMap = new Map<string, BatchRow[]>();
      try {
        const batchRows = await db.select<BatchRow[]>(
          "SELECT * FROM inventory_batches"
        );
        for (const b of batchRows) {
          const arr = batchMap.get(b.item_id) ?? [];
          arr.push(b);
          batchMap.set(b.item_id, arr);
        }
      } catch {
        // batches table may not exist yet during tests
      }
      return rows.map((r: InventoryRow) =>
        mapRowToItem(r, batchMap.get(r.id) ?? [])
      );
    },
    queryKey: ["inventory_items"],
    retry: false,
    staleTime: 30_000,
  });
}

export function useInventoryItemsCount() {
  return useQuery({
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.select<{ c: number }[]>(
        "SELECT COUNT(*) as c FROM inventory_items"
      );
      return rows[0]?.c ?? 0;
    },
    queryKey: ["inventory_items_count"],
    retry: false,
    staleTime: 30_000,
  });
}
