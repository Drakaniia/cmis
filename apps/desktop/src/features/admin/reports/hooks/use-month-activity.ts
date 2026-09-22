import { useQuery } from "@tanstack/react-query";

import { getDb } from "@/lib/db";
import { monthRange } from "@/lib/month";

/**
 * This month's received and dispensed units, category-filtered (F2).
 *
 * Two genuinely different ledgers, as the movement widget established: units
 * arriving are recorded in `audit_log.after_json.received` by every stock-in
 * path, and units leaving are the `dispensing_events` grid. `after.qty` is
 * deliberately not a fallback — it is the resulting on-hand total, so summing it
 * would report every delivery as the whole shelf.
 *
 * `hasActivity` counts rows rather than units: a month whose only movement was a
 * zero-unit row has happened, and it should read `0` rather than an em dash
 * (F2, D15).
 */

export interface MonthActivityData {
  dispensed: number;
  hasActivity: boolean;
  received: number;
}

const INBOUND_ALL = `SELECT COALESCE(SUM(CAST(json_extract(a.after_json, '$.received') AS INTEGER)), 0) AS total,
          COUNT(*) AS rows
     FROM audit_log a
    WHERE a.action = 'stock-in' AND a.at >= ? AND a.at < ?`;

const INBOUND_CATEGORY = `SELECT COALESCE(SUM(CAST(json_extract(a.after_json, '$.received') AS INTEGER)), 0) AS total,
          COUNT(*) AS rows
     FROM audit_log a JOIN inventory_items i ON i.id = a.target_id
    WHERE a.action = 'stock-in' AND a.at >= ? AND a.at < ? AND i.category = ?`;

const OUTBOUND_ALL =
  "SELECT COALESCE(SUM(qty), 0) AS total, COUNT(*) AS rows FROM dispensing_events WHERE month = ?";

const OUTBOUND_CATEGORY =
  "SELECT COALESCE(SUM(d.qty), 0) AS total, COUNT(*) AS rows FROM dispensing_events d JOIN inventory_items i ON d.item_id = i.id WHERE d.month = ? AND i.category = ?";

interface ActivityRow {
  rows: number;
  total: number;
}

export function useMonthActivity(month: string, category: string) {
  const filtered = category !== "All";
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<MonthActivityData> => {
      try {
        const db = await getDb();
        const { end, start } = monthRange(month);
        const [inbound] = await db.select<ActivityRow[]>(
          filtered ? INBOUND_CATEGORY : INBOUND_ALL,
          filtered ? [start, end, category] : [start, end]
        );
        const [outbound] = await db.select<ActivityRow[]>(
          filtered ? OUTBOUND_CATEGORY : OUTBOUND_ALL,
          filtered ? [month, category] : [month]
        );
        const received = inbound?.total ?? 0;
        const dispensed = outbound?.total ?? 0;
        return {
          dispensed,
          hasActivity: (inbound?.rows ?? 0) > 0 || (outbound?.rows ?? 0) > 0,
          received,
        };
      } catch {
        // No audit table or no JSON1 on this build — report no activity rather
        // than taking the summary down.
        return { dispensed: 0, hasActivity: false, received: 0 };
      }
    },
    queryKey: ["reports-month-activity", month, category],
  });
}
