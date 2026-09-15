import { useEffect, useState } from "react";

import type { ExportDataType } from "../types";

/**
 * Row counts per export type, read from the database.
 *
 * `null` means "not known" and must render as an unknown marker — never as a
 * number, and never as 0, which would claim the table is empty. Audit logs have
 * no table in this schema, so they stay unknown by design.
 */
export type ExportCounts = Record<ExportDataType, number | null>;

const UNKNOWN_COUNTS: ExportCounts = {
  inventory: null,
  logs: null,
  requests: null,
};

export function useExportCounts(): ExportCounts {
  const [counts, setCounts] = useState<ExportCounts>(UNKNOWN_COUNTS);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        const rows = await db.select<{ inventory: number; requests: number }[]>(
          `SELECT (SELECT COUNT(*) FROM inventory_items) AS inventory,
                  (SELECT COUNT(*) FROM requests) AS requests`
        );
        const [row] = rows;
        if (!(cancelled || row === undefined)) {
          setCounts({
            inventory: row.inventory,
            logs: null,
            requests: row.requests,
          });
        }
      } catch {
        // Web previews have no SQLite: the card shows unknown counts instead of
        // inventing them.
      }
    };

    load().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return counts;
}
