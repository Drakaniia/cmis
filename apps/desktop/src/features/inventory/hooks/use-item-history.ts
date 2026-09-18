import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getDb } from "@/lib/db";
import {
  REQUEST_HISTORY_WHERE_SQL,
  requestHistoryParams,
} from "../domain/medicine-match";
import type { InventoryItem } from "../types";

/**
 * Stock detail modal §11 — the real dispensing history (decision 18).
 *
 * Two sources, because neither alone answers the question (decision 18):
 * `dispensing_events` is the daily aggregate the app writes on every stock-out,
 * so it is where the totals live; `dispensing_records` joined to `requests` is
 * where a row's requestor and staff live. The rows are matched to the item by
 * the same normalizer the stock checks use (decision 19, `medicine-match.ts`).
 *
 * Decision 20 — a recent window with a load-more, not the whole table: first
 * page 10, each load-more adds 20.
 */

export const HISTORY_FIRST_PAGE = 10;
export const HISTORY_PAGE_STEP = 20;

export interface ItemHistoryTotals {
  first: string | null;
  last: string | null;
  records: number;
  units: number;
}

export interface ItemHistoryEntry {
  at: string;
  batch: string;
  qty: number;
  requestor: string;
  staff: string;
}

export interface ItemHistory {
  hasMore: boolean;
  isError: boolean;
  isLoading: boolean;
  loadMore: () => void;
  refetch: () => void;
  rows: ItemHistoryEntry[];
  totals: ItemHistoryTotals;
}

const EMPTY_TOTALS: ItemHistoryTotals = {
  first: null,
  last: null,
  records: 0,
  units: 0,
};

interface TotalsRow {
  first: string | null;
  last: string | null;
  records: number;
  units: number;
}

interface HistoryRow {
  at: string;
  batch: string | null;
  qty: number;
  requestor_name: string | null;
  staff: string | null;
}

export function useItemHistory(
  item: InventoryItem | null,
  enabled: boolean
): ItemHistory {
  const itemId = item?.id ?? null;
  const displayName = item?.displayName ?? item?.name ?? "";
  // Deriving the limit from the item it belongs to resets the paging when the
  // modal moves to another product, without a state-resetting effect.
  const [paging, setPaging] = useState({
    itemId,
    limit: HISTORY_FIRST_PAGE,
  });
  const limit = paging.itemId === itemId ? paging.limit : HISTORY_FIRST_PAGE;

  const query = useQuery({
    enabled: enabled && itemId !== null,
    queryFn: async () => {
      const db = await getDb();
      const totalsRows = await db.select<TotalsRow[]>(
        "SELECT COUNT(*) AS records, COALESCE(SUM(qty), 0) AS units, MIN(date) AS first, MAX(date) AS last FROM dispensing_events WHERE item_id = ?",
        [itemId]
      );
      const recordRows = await db.select<HistoryRow[]>(
        `SELECT d.at, d.batch, d.qty, d.staff, r.requestor_name FROM dispensing_records d JOIN requests r ON r.id = d.request_id WHERE ${REQUEST_HISTORY_WHERE_SQL} ORDER BY d.at DESC LIMIT ? OFFSET ?`,
        [...requestHistoryParams(itemId ?? "", displayName), limit, 0]
      );
      return {
        rows: recordRows.map((row) => ({
          at: row.at,
          batch: row.batch ?? "",
          qty: row.qty,
          requestor: row.requestor_name ?? "",
          staff: row.staff ?? "",
        })),
        totals: totalsRows[0] ?? EMPTY_TOTALS,
      };
    },
    queryKey: ["item_history", itemId, displayName, limit],
    retry: false,
  });

  const rows = query.data?.rows ?? [];
  const totals = query.data?.totals ?? EMPTY_TOTALS;

  return {
    hasMore: rows.length < totals.records,
    isError: query.isError,
    isLoading: query.isLoading,
    loadMore: () => setPaging({ itemId, limit: limit + HISTORY_PAGE_STEP }),
    refetch: () => {
      query.refetch();
    },
    rows,
    totals,
  };
}
