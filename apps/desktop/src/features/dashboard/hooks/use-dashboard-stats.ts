import { useQuery } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import { monthKey } from "@/lib/month";
import type { HourlyCount, StockAdjustmentsData } from "../types";

export interface DashboardStats {
  expiring30d: number;
  lowStock: number;
  needsBatch: number;
  pendingRequests: number;
  sparkline: number[];
  totalItems: number;
}

export function useDashboardStats() {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<DashboardStats> => {
      const db = await getDb();
      const [totalRows, lowRows, pendingRows, expiringRows, needsBatchRows] =
        await Promise.all([
          db.select<{ c: number }[]>(
            "SELECT COUNT(*) as c FROM inventory_items"
          ),
          db.select<{ c: number }[]>(
            "SELECT COUNT(*) as c FROM inventory_items WHERE status='low'"
          ),
          db
            .select<{ c: number }[]>(
              "SELECT COUNT(*) as c FROM requests WHERE status='pending'"
            )
            .catch(() => [{ c: 0 }]),
          db
            .select<{ c: number }[]>(
              "SELECT COUNT(*) as c FROM inventory_batches WHERE julianday(expiry) - julianday('now') <= 30"
            )
            .catch(() => [{ c: 0 }]),
          db.select<{ c: number }[]>(
            "SELECT COUNT(*) as c FROM inventory_items WHERE needs_batch=1"
          ),
        ]);
      // Sparkline: 7-day trend from dispensing_events grouped by date
      let sparkline: number[] = [];
      try {
        const daily = await db.select<{ date: string; total: number }[]>(
          "SELECT date, SUM(qty) as total FROM dispensing_events GROUP BY date ORDER BY date DESC LIMIT 7"
        );
        sparkline = daily
          .map((d: { date: string; total: number }) => d.total)
          .reverse();
        while (sparkline.length < 7) {
          sparkline.unshift(0);
        }
      } catch {
        sparkline = [0, 0, 0, 0, 0, 0, 0];
      }
      return {
        expiring30d: expiringRows[0]?.c ?? 0,
        lowStock: lowRows[0]?.c ?? 0,
        needsBatch: needsBatchRows[0]?.c ?? 0,
        pendingRequests: pendingRows[0]?.c ?? 0,
        sparkline,
        totalItems: totalRows[0]?.c ?? 0,
      };
    },
    queryKey: ["dashboard-stats"],
  });
}

export interface DispensingVelocity {
  categoryBreakdown: { color: string; count: number; label: string }[];
  changePercent: number;
  dailyCounts: { count: number; label: string }[];
  todayTotal: number;
}

type Db = Awaited<ReturnType<typeof getDb>>;
interface DailyCount {
  count: number;
  label: string;
}
type CategorySlice = DispensingVelocity["categoryBreakdown"][number];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Last seven days of dispensing in the month, padded to a full week. */
async function loadDailyCounts(db: Db, month: string): Promise<DailyCount[]> {
  const rows = await db.select<{ date: string; total: number }[]>(
    "SELECT date, SUM(qty) as total FROM dispensing_events WHERE month = ? GROUP BY date ORDER BY date",
    [month]
  );
  const counts = rows.slice(-7).map((row) => {
    const date = new Date(row.date);
    return { count: row.total, label: DAY_NAMES[date.getDay()] ?? row.date };
  });
  while (counts.length < 7) {
    counts.unshift({ count: 0, label: "-" });
  }
  return counts;
}

function emptyWeek(): DailyCount[] {
  return Array.from({ length: 7 }, () => ({ count: 0, label: "-" }));
}

/** Dispensed totals per category, sorted by volume. */
async function loadCategoryBreakdown(
  db: Db,
  month: string
): Promise<CategorySlice[]> {
  const rows = await db.select<{ category: string | null; total: number }[]>(
    "SELECT i.category as category, SUM(d.qty) as total FROM dispensing_events d JOIN inventory_items i ON d.item_id = i.id WHERE d.month = ? GROUP BY i.category ORDER BY total DESC",
    [month]
  );
  const breakdown = rows.map((row) => ({
    color: CATEGORY_COLORS[row.category ?? "Uncategorized"] ?? "bg-muted",
    count: row.total,
    label: row.category ?? "Uncategorized",
  }));
  return breakdown.length > 0 ? breakdown : NO_DATA_SLICE;
}

const NO_DATA_SLICE: CategorySlice[] = [
  { color: "bg-muted", count: 0, label: "No data" },
];

/** Percent change between two days; a jump from zero reads as +100%. */
function percentChange(today: number, yesterday: number): number {
  if (yesterday === 0) {
    return today > 0 ? 100 : 0;
  }
  return Math.round(((today - yesterday) / yesterday) * 100);
}

const CATEGORY_COLORS: Record<string, string> = {
  Analgesic: "bg-primary",
  Antibiotic: "bg-blue-500",
  Antiseptic: "bg-amber-500",
  "First Aid": "bg-muted",
  Gastro: "bg-orange-500",
  Respiratory: "bg-sky-500",
  Supplement: "bg-emerald-500",
  Uncategorized: "bg-muted",
};

export function useDispensingVelocity(month = monthKey()) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<DispensingVelocity> => {
      const db = await getDb();
      // Daily counts for last 7 days within month
      let dailyCounts: DailyCount[] = [];
      let todayTotal = 0;
      try {
        dailyCounts = await loadDailyCounts(db, month);
        todayTotal = dailyCounts.at(-1)?.count ?? 0;
      } catch {
        dailyCounts = emptyWeek();
      }

      // Category breakdown: SUM per category
      let categoryBreakdown: DispensingVelocity["categoryBreakdown"] = [];
      try {
        categoryBreakdown = await loadCategoryBreakdown(db, month);
      } catch {
        categoryBreakdown = NO_DATA_SLICE;
      }

      // Change percent: compare today vs yesterday
      let changePercent = 0;
      if (dailyCounts.length >= 2) {
        changePercent = percentChange(
          dailyCounts.at(-1)?.count ?? 0,
          dailyCounts.at(-2)?.count ?? 0
        );
      }

      return { categoryBreakdown, changePercent, dailyCounts, todayTotal };
    },
    queryKey: ["dispensing-velocity", month],
  });
}

/**
 * Activity over the last 24 hours, bucketed by local hour.
 *
 * Two tables carry a real timestamp — `dispensing_records.at` for a hand-over
 * and `requests.submitted_at` for a request — so the card is wired to those
 * rather than the zeros it used to return unconditionally. Hours are resolved in
 * JS because SQLite's `strftime` reads the stored `Z` timestamps as UTC, which
 * would file an 11:00 hand-over under 09:00 for a UTC+2 clinic.
 */
export function useHourlyActivity() {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<HourlyCount[]> => {
      const empty = Array.from({ length: 24 }, (_, hour) => ({
        dispensed: 0,
        hour,
        requests: 0,
      }));
      try {
        const db = await getDb();
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [handOvers, submissions] = await Promise.all([
          db.select<{ at: string }[]>(
            "SELECT at FROM dispensing_records WHERE at >= ?",
            [since]
          ),
          db.select<{ submitted_at: string }[]>(
            "SELECT submitted_at FROM requests WHERE submitted_at >= ?",
            [since]
          ),
        ]);
        for (const row of handOvers) {
          const bucket = empty[new Date(row.at).getHours()];
          if (bucket) {
            bucket.dispensed += 1;
          }
        }
        for (const row of submissions) {
          const bucket = empty[new Date(row.submitted_at).getHours()];
          if (bucket) {
            bucket.requests += 1;
          }
        }
        return empty;
      } catch {
        return empty;
      }
    },
    queryKey: ["hourly-activity"],
  });
}

const EMPTY_ADJUSTMENTS: StockAdjustmentsData = {
  discrepancies: { count: 0, items: [] },
  flagged: { count: 0, items: [] },
  transfers: { count: 0, items: [] },
};

/**
 * The three adjustment categories, each from a column that actually records it:
 * a count that disagreed with the dispensing grid (`total_mismatch`), a hand-over
 * logged as a transfer (`audit_log.detail`), and a batch at or past its expiry
 * window.
 */
export function useStockAdjustments() {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<StockAdjustmentsData> => {
      try {
        const db = await getDb();
        const [mismatchRows, transferRows, flaggedRows] = await Promise.all([
          db.select<
            { daily_sum: number; name: string; total_dispensed: number }[]
          >(
            `SELECT name, total_dispensed, daily_sum FROM inventory_items
              WHERE total_mismatch = 1 ORDER BY name COLLATE NOCASE LIMIT 3`
          ),
          db.select<{ detail: string; medicine: string | null }[]>(
            `SELECT a.detail AS detail, COALESCE(NULLIF(trim(i.name), ''), 'Unknown item') AS medicine
               FROM audit_log a LEFT JOIN inventory_items i ON i.id = a.target_id
              WHERE a.detail LIKE '%Transferred%' ORDER BY a.at DESC LIMIT 3`
          ),
          db.select<{ days_until: number; medicine: string }[]>(
            `SELECT COALESCE(NULLIF(trim(i.display_name), ''), i.name) AS medicine,
                    CAST(julianday(b.expiry) - julianday('now') AS INTEGER) AS days_until
               FROM inventory_batches b JOIN inventory_items i ON i.id = b.item_id
              WHERE b.expiry IS NOT NULL AND b.expiry != ''
                AND julianday(b.expiry) - julianday('now') <= 30
              ORDER BY b.expiry LIMIT 3`
          ),
        ]);
        const [mismatchCount, transferCount, flaggedCount] = await Promise.all([
          db.select<{ c: number }[]>(
            "SELECT COUNT(*) AS c FROM inventory_items WHERE total_mismatch = 1"
          ),
          db.select<{ c: number }[]>(
            "SELECT COUNT(*) AS c FROM audit_log WHERE detail LIKE '%Transferred%'"
          ),
          db.select<{ c: number }[]>(
            `SELECT COUNT(*) AS c FROM inventory_batches
              WHERE expiry IS NOT NULL AND expiry != ''
                AND julianday(expiry) - julianday('now') <= 30`
          ),
        ]);
        return {
          discrepancies: {
            count: mismatchCount[0]?.c ?? 0,
            items: mismatchRows.map((row) => ({
              detail: `counted ${row.daily_sum}, system ${row.total_dispensed}`,
              medicine: row.name,
            })),
          },
          flagged: {
            count: flaggedCount[0]?.c ?? 0,
            items: flaggedRows.map((row) => ({
              detail:
                row.days_until < 0
                  ? `expired ${Math.abs(row.days_until)}d ago`
                  : `expires in ${row.days_until}d`,
              medicine: row.medicine,
            })),
          },
          transfers: {
            count: transferCount[0]?.c ?? 0,
            items: transferRows.map((row) => ({
              detail: row.detail,
              medicine: row.medicine ?? "Unknown item",
            })),
          },
        };
      } catch {
        return EMPTY_ADJUSTMENTS;
      }
    },
    queryKey: ["stock-adjustments"],
  });
}
