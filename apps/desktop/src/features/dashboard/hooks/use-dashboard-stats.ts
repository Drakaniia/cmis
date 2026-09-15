import { useQuery } from "@tanstack/react-query";
import { getDb } from "@/lib/db";

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

export function useDispensingVelocity(month = "2026-08") {
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

export function useHourlyActivity(_month = "2026-08") {
  return useQuery({
    queryFn: () => {
      // Until hourly timestamps exist, derive daily granularity placeholder
      // Return 24 zeros with note handled at component level
      return Array.from({ length: 24 }, (_, hour) => ({
        dispensed: 0,
        hour,
        requests: 0,
      }));
    },
    queryKey: ["hourly-activity"],
  });
}
