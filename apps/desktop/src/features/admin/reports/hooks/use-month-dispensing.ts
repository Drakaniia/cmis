import { useQuery } from "@tanstack/react-query";

import { getDb } from "@/lib/db";
import { daysInMonth } from "@/lib/month";

/**
 * The selected month's dispensing grid, per item per day — the source the Stock
 * Report's export writes into the day columns (spec stock-report-export E6).
 *
 * `useMonthActivity` answers the *total* question the summary block asks; this
 * answers the *shape* question the template needs, from the same
 * `dispensing_events` rows. Each array is `daysInMonth(month)` long, indexed by
 * `day - 1`, so a 30-day month never reserves a phantom 31st column (E2/E19).
 */

interface DispensingRow {
  day: number;
  item_id: string;
  qty: number;
}

export function useMonthDispensing(month: string) {
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<Map<string, number[]>> => {
      const dayCount = daysInMonth(month);
      if (dayCount <= 0) {
        return new Map();
      }
      try {
        const db = await getDb();
        const rows = await db.select<DispensingRow[]>(
          "SELECT item_id, day, qty FROM dispensing_events WHERE month = ?",
          [month]
        );
        const byItem = new Map<string, number[]>();
        for (const row of rows) {
          let daily = byItem.get(row.item_id);
          if (!daily) {
            daily = Array.from({ length: dayCount }, () => 0);
            byItem.set(row.item_id, daily);
          }
          if (row.day >= 1 && row.day <= dayCount) {
            daily[row.day - 1] = (daily[row.day - 1] ?? 0) + row.qty;
          }
        }
        return byItem;
      } catch {
        // No `dispensing_events` table (or a pristine test DB): the export writes
        // blank day cells rather than failing the whole save.
        return new Map<string, number[]>();
      }
    },
    queryKey: ["reports-month-dispensing", month],
  });
}
