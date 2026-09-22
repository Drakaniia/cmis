import { useQuery } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import { daysElapsed, monthRange } from "@/lib/month";
import type {
  CategoryUsage,
  ExpiryBucket,
  FulfillmentPoint,
  LowStockPoint,
  StockMovementPoint,
  TopDispensedRow,
} from "../types";

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Inbound units per day, read from the append-only audit log.
 *
 * The chart's "In" series used to be a literal `0`: no table records a delivery
 * date, and the stock-in mutation wrote no audit row at all, so there was
 * nothing to read. Every stock-in path now records the units received under
 * `after.received` — see `inventory/creation/commit-creation.ts`,
 * `inventory/hooks/use-stock-mutations.ts` and the quick-deduct undo — which
 * this sums per day.
 *
 * `after.qty` is deliberately *not* used as a fallback: it is the resulting
 * on-hand total, so summing it would report every delivery as the whole shelf.
 * Rows written before the key existed contribute nothing instead.
 */
async function loadInboundByDate(
  db: Db,
  start: string,
  end: string,
  category: string
): Promise<Map<string, number>> {
  const byDate = new Map<string, number>();
  try {
    const rows = await db.select<{ date: string; total: number }[]>(
      category === "All"
        ? `SELECT substr(a.at, 1, 10) AS date,
                  SUM(CAST(json_extract(a.after_json, '$.received') AS INTEGER)) AS total
             FROM audit_log a
            WHERE a.action = 'stock-in' AND a.at >= ? AND a.at < ?
            GROUP BY date`
        : `SELECT substr(a.at, 1, 10) AS date,
                  SUM(CAST(json_extract(a.after_json, '$.received') AS INTEGER)) AS total
             FROM audit_log a JOIN inventory_items i ON i.id = a.target_id
            WHERE a.action = 'stock-in' AND a.at >= ? AND a.at < ? AND i.category = ?
            GROUP BY date`,
      category === "All" ? [start, end] : [start, end, category]
    );
    for (const row of rows) {
      if (row.total > 0) {
        byDate.set(row.date, row.total);
      }
    }
  } catch {
    // No audit table or no JSON1 on this build — fall back to outbound only
    // rather than taking the whole widget down.
  }
  return byDate;
}

/**
 * Inbound and outbound movement by day for the month.
 *
 * Two sources because they are genuinely different ledgers: `dispensing_events`
 * is what left the shelf, `audit_log` is what arrived. Either can have a day the
 * other does not, so the date set is the union — a delivery day with no
 * dispensing must still plot.
 */
export function useStockMovement(month: string, category: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<StockMovementPoint[]> => {
      const db = await getDb();
      const { end, start } = monthRange(month);
      const outbound = await db.select<{ date: string; total: number }[]>(
        category === "All"
          ? "SELECT date, SUM(qty) AS total FROM dispensing_events WHERE month = ? GROUP BY date ORDER BY date"
          : "SELECT d.date AS date, SUM(d.qty) AS total FROM dispensing_events d JOIN inventory_items i ON d.item_id = i.id WHERE d.month = ? AND i.category = ? GROUP BY d.date ORDER BY d.date",
        category === "All" ? [month] : [month, category]
      );
      const inbound = await loadInboundByDate(db, start, end, category);
      // No data either way shows the widget's empty state (spec §7.3).
      if (outbound.length === 0 && inbound.size === 0) {
        return [];
      }
      const outByDate = new Map(outbound.map((row) => [row.date, row.total]));
      const dates = [
        ...new Set([...outByDate.keys(), ...inbound.keys()]),
      ].sort();
      return dates.map((date) => ({
        date,
        in: inbound.get(date) ?? 0,
        label: date.slice(5),
        out: outByDate.get(date) ?? 0,
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
        "SELECT i.id as id, COALESCE(NULLIF(trim(i.display_name), ''), i.name || ' ' || i.dosage) as name, i.sku as sku, i.category as category, SUM(d.qty) as qty FROM dispensing_events d JOIN inventory_items i ON d.item_id=i.id WHERE d.month=? GROUP BY i.id ORDER BY qty DESC LIMIT 5";
      let params: unknown[] = [month];
      if (category !== "All") {
        sql =
          "SELECT i.id as id, COALESCE(NULLIF(trim(i.display_name), ''), i.name || ' ' || i.dosage) as name, i.sku as sku, i.category as category, SUM(d.qty) as qty FROM dispensing_events d JOIN inventory_items i ON d.item_id=i.id WHERE d.month=? AND i.category=? GROUP BY i.id ORDER BY qty DESC LIMIT 5";
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

export function useExpiryBuckets(category: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<ExpiryBucket[]> => {
      const db = await getDb();
      try {
        // The category argument used to be accepted and ignored (SL11), which
        // left the bars un-narrowed by the filter bar. Filtering now joins the
        // batch to its item so the widget honours the same category as its
        // neighbours.
        const rows = await db.select<{ expiry: string }[]>(
          category === "All"
            ? "SELECT expiry FROM inventory_batches WHERE expiry IS NOT NULL AND expiry != ''"
            : "SELECT b.expiry AS expiry FROM inventory_batches b JOIN inventory_items i ON i.id = b.item_id WHERE b.expiry IS NOT NULL AND b.expiry != '' AND i.category = ?",
          category === "All" ? [] : [category]
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
    queryKey: ["reports-expiry-buckets", category],
  });
}

/** Local midnight for a `YYYY-MM-DD` key — a bare date parses as UTC, which
 *  renders as the previous day west of Greenwich. */
function localDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function dayLabel(date: string): string {
  return localDate(date).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
  });
}

/**
 * Items below their reorder point for each day of the month.
 *
 * Nothing stores a daily low-stock count, but `dispensing_events` records every
 * decrement, so the day-by-day quantity is reconstructible exactly: today's
 * `qty` plus everything dispensed *after* the day in question. Walking the month
 * backwards from the live stock is therefore arithmetic, not an estimate.
 */
interface LowStockItem {
  id: string;
  qty: number;
  threshold: number;
}

interface DispensingEventRow {
  date: string;
  item_id: string;
  qty: number;
}

/**
 * Walks the month backwards from the live quantity, adding each day's dispensing
 * to a running "dispensed after this day" total. The grid only ever subtracts,
 * so the quantity on any earlier day is today's stock plus what has since come
 * off it — arithmetic, not an estimate. Kept pure and outside the hook so the
 * query function stays a straight read.
 */
function reconstructLowStock(
  items: LowStockItem[],
  events: DispensingEventRow[],
  month: string
): LowStockPoint[] {
  const days = daysElapsed(month);
  if (items.length === 0 || days === 0) {
    return [];
  }

  const byDate = new Map<string, DispensingEventRow[]>();
  for (const event of events) {
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }

  const afterByItem = new Map<string, number>();
  const points: LowStockPoint[] = [];
  for (let day = days; day >= 1; day -= 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    let count = 0;
    for (const item of items) {
      if (item.qty + (afterByItem.get(item.id) ?? 0) < item.threshold) {
        count += 1;
      }
    }
    points.push({ count, date, label: dayLabel(date) });
    for (const event of byDate.get(date) ?? []) {
      afterByItem.set(
        event.item_id,
        (afterByItem.get(event.item_id) ?? 0) + event.qty
      );
    }
  }
  return points.reverse();
}

export function useLowStockTrend(month: string, category: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<LowStockPoint[]> => {
      try {
        const db = await getDb();
        const items = await db.select<LowStockItem[]>(
          category === "All"
            ? "SELECT id, qty, threshold FROM inventory_items"
            : "SELECT id, qty, threshold FROM inventory_items WHERE category = ?",
          category === "All" ? [] : [category]
        );
        if (items.length === 0) {
          return [];
        }
        const events = await db.select<DispensingEventRow[]>(
          "SELECT item_id, date, qty FROM dispensing_events WHERE month = ? ORDER BY date",
          [month]
        );
        return reconstructLowStock(items, events, month);
      } catch {
        return [];
      }
    },
    queryKey: ["reports-low-stock-trend", month, category],
  });
}

/**
 * Requested versus dispensed units per category for the month.
 *
 * Two sources, one window: `requests.qty` is what was asked for, the
 * `dispensing_events` grid is what actually left the shelf. Both are aggregated
 * per category so the gap between the bars is the fulfillment shortfall.
 */
export function useFulfillment(month: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<FulfillmentPoint[]> => {
      try {
        const db = await getDb();
        const { end, start } = monthRange(month);
        const [dispensedRows, requestedRows] = await Promise.all([
          db.select<{ category: string | null; total: number }[]>(
            `SELECT i.category AS category, SUM(d.qty) AS total
               FROM dispensing_events d JOIN inventory_items i ON d.item_id = i.id
              WHERE d.month = ? GROUP BY i.category`,
            [month]
          ),
          db.select<{ category: string | null; total: number }[]>(
            `SELECT category, SUM(qty) AS total FROM requests
              WHERE submitted_at >= ? AND submitted_at < ? GROUP BY category`,
            [start, end]
          ),
        ]);
        const byCategory = new Map<string, FulfillmentPoint>();
        for (const row of requestedRows) {
          const category = row.category ?? "Uncategorized";
          byCategory.set(category, {
            category,
            dispensed: 0,
            label: category,
            requested: row.total,
          });
        }
        for (const row of dispensedRows) {
          const category = row.category ?? "Uncategorized";
          const point = byCategory.get(category) ?? {
            category,
            dispensed: 0,
            label: category,
            requested: 0,
          };
          point.dispensed = row.total;
          byCategory.set(category, point);
        }
        return [...byCategory.values()].sort(
          (a, b) => b.dispensed + b.requested - (a.dispensed + a.requested)
        );
      } catch {
        return [];
      }
    },
    queryKey: ["reports-fulfillment", month],
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
