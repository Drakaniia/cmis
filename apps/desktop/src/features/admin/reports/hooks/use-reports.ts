import { useQuery } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import type {
  CategoryUsage,
  ExpiryBucket,
  StockMovementPoint,
  TopDispensedRow,
} from "../types";

export function useStockMovement(month: string, category: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<StockMovementPoint[]> => {
      const db = await getDb();
      // Aggregate dispensing_events by date for movement; 'in' is stock_on_hand trend placeholder
      const rows = await db.select<{ date: string; total: number }[]>(
        "SELECT date, SUM(qty) as total FROM dispensing_events WHERE month = ? GROUP BY date ORDER BY date",
        [month]
      );
      // If no data, return empty to show empty state per spec §7.3
      if (rows.length === 0) {
        return [];
      }
      // Join with category filter if needed
      if (category !== "All") {
        const catRows = await db.select<{ date: string; total: number }[]>(
          "SELECT d.date as date, SUM(d.qty) as total FROM dispensing_events d JOIN inventory_items i ON d.item_id=i.id WHERE d.month=? AND i.category=? GROUP BY d.date ORDER BY d.date",
          [month, category]
        );
        return catRows.map((r: { date: string; total: number }) => ({
          date: r.date,
          in: 0,
          label: r.date.slice(5),
          out: r.total,
        }));
      }
      return rows.map((r: { date: string; total: number }) => ({
        date: r.date,
        in: 0,
        label: r.date.slice(5),
        out: r.total,
      }));
    },
    queryKey: ["reports-stock-movement", month, category],
  });
}

export function useTopDispensed(month: string, category: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<TopDispensedRow[]> => {
      const db = await getDb();
      let sql =
        "SELECT i.id as id, i.name || ' ' || i.dosage as name, i.sku as sku, i.category as category, SUM(d.qty) as qty FROM dispensing_events d JOIN inventory_items i ON d.item_id=i.id WHERE d.month=? GROUP BY i.id ORDER BY qty DESC LIMIT 5";
      let params: unknown[] = [month];
      if (category !== "All") {
        sql =
          "SELECT i.id as id, i.name || ' ' || i.dosage as name, i.sku as sku, i.category as category, SUM(d.qty) as qty FROM dispensing_events d JOIN inventory_items i ON d.item_id=i.id WHERE d.month=? AND i.category=? GROUP BY i.id ORDER BY qty DESC LIMIT 5";
        params = [month, category];
      }
      try {
        const rows = await db.select<TopDispensedRow[] & { qty: number }[]>(
          sql,
          params
        );
        return rows;
      } catch {
        return [];
      }
    },
    queryKey: ["reports-top-dispensed", month, category],
  });
}

export function useExpiryBuckets(_category: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<ExpiryBucket[]> => {
      const db = await getDb();
      try {
        const rows = await db.select<{ expiry: string }[]>(
          "SELECT expiry FROM inventory_batches WHERE expiry IS NOT NULL AND expiry != ''"
        );
        if (rows.length === 0) {
          return [];
        }
        const buckets = new Map<string, number>();
        for (const r of rows) {
          const d = new Date(r.expiry);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        const now = new Date();
        const result: ExpiryBucket[] = [];
        for (let i = 0; i < 6; i += 1) {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const label = d.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          });
          const count = buckets.get(key) ?? 0;
          let urgency: ExpiryBucket["urgency"] = "caution";
          if (i <= 1) {
            urgency = "danger";
          } else if (i <= 3) {
            urgency = "warn";
          }
          result.push({ count, label, monthKey: key, urgency });
        }
        return result;
      } catch {
        return [];
      }
    },
    queryKey: ["reports-expiry-buckets"],
  });
}

export function useUsageByCategory(month: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<CategoryUsage[]> => {
      const db = await getDb();
      try {
        const rows = await db.select<
          { category: string | null; total: number }[]
        >(
          "SELECT i.category as category, SUM(d.qty) as total FROM dispensing_events d JOIN inventory_items i ON d.item_id=i.id WHERE d.month=? GROUP BY i.category",
          [month]
        );
        if (rows.length === 0) {
          return [];
        }
        const colors = [
          "var(--chart-1)",
          "var(--chart-2)",
          "var(--chart-3)",
          "var(--chart-4)",
          "var(--chart-5)",
        ];
        return rows.map(
          (r: { category: string | null; total: number }, i: number) => ({
            category: r.category ?? "Uncategorized",
            color: colors[i % colors.length],
            value: r.total,
          })
        );
      } catch {
        return [];
      }
    },
    queryKey: ["reports-usage-by-category", month],
  });
}
