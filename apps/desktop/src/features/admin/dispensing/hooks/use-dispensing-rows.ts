import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { REQUESTS_CHANGED_EVENT } from "@/features/requests/persistence";
import { getDb } from "@/lib/db";
import {
  buildDispensingRows,
  type DispensingItemSource,
  type DispensingRecordSource,
  type DispensingRequestSource,
} from "../rows";
import type { DispensingRow } from "../types";

/**
 * CMIS-UI-06 §2 — the log's data source.
 *
 * The page used to hold an empty array, so the log could never show anything: a
 * hand-over written by the queue, by the batch dispense or by `Ctrl+D` was
 * invisible here even though the record existed. This reads the three tables the
 * log needs and hands the mapping to the pure `buildDispensingRows`.
 *
 * It re-reads on `REQUESTS_CHANGED_EVENT`, the same signal the board uses: a
 * deduction made from another screen writes straight to SQLite, and the log
 * would otherwise only catch up on a remount.
 */

export const DISPENSING_ROWS_KEY = ["dispensing_records"] as const;

export function useDispensingRows() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: async (): Promise<DispensingRow[]> => {
      const db = await getDb();
      const [records, requests, items] = await Promise.all([
        db.select<DispensingRecordSource[]>(
          "SELECT id, request_id, at, batch, qty, staff FROM dispensing_records"
        ),
        db.select<DispensingRequestSource[]>(
          "SELECT id, medicine, requestor_id, requestor_name, source FROM requests"
        ),
        db.select<DispensingItemSource[]>(
          "SELECT sku, name, display_name FROM inventory_items"
        ),
      ]);
      return buildDispensingRows(records, requests, items);
    },
    queryKey: DISPENSING_ROWS_KEY,
    retry: false,
    staleTime: 15_000,
  });

  useEffect(() => {
    const onChanged = () => {
      queryClient
        .invalidateQueries({ queryKey: DISPENSING_ROWS_KEY })
        .catch(() => undefined);
    };
    window.addEventListener(REQUESTS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(REQUESTS_CHANGED_EVENT, onChanged);
    };
  }, [queryClient]);

  return {
    /** The read failed — an unreadable log must not read as an empty one. */
    hasError: query.isError,
    isLoading: query.isLoading,
    rows: query.data ?? [],
  } as const;
}
