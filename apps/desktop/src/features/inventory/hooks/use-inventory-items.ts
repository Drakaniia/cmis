import { useQuery } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import type { InventoryItem } from "../types";

interface InventoryRow {
  category: string | null;
  created_at: string;
  daily_sum: number;
  dosage: string;
  dosage_missing: number;
  id: string;
  is_no_stock: number;
  name: string;
  needs_batch: number;
  qty: number;
  sku: string;
  status: string;
  stock_on_hand: number | null;
  stock_remaining: number | null;
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
  const displayName = row.dosage
    ? `${row.name.trim()} ${row.dosage.trim()}`.trim()
    : row.name.trim();
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
    dispensingHistory: [],
    expiry,
    id: row.id,
    name: displayName,
    qty: row.qty,
    sku: row.sku,
    status: row.status as InventoryItem["status"],
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
      const rows = await db.select<InventoryRow[]>(
        "SELECT * FROM inventory_items ORDER BY name COLLATE NOCASE, dosage COLLATE NOCASE"
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
