import { useMemo } from "react";
import { buildExpiryRows } from "../domain/expiry";
import { buildLowStockRows } from "../domain/low-stock";
import type { ExpiryRow, LowStockRow } from "../types";
import { useInventoryItems } from "./use-inventory-items";

export function useLowStockRows(): {
  data: LowStockRow[] | undefined;
  isLoading: boolean;
} {
  const { data: items, isLoading } = useInventoryItems();
  const rows = useMemo(
    () => (items ? buildLowStockRows(items) : undefined),
    [items]
  );
  return { data: rows, isLoading };
}

export function useExpiryRows(): {
  data: ExpiryRow[] | undefined;
  isLoading: boolean;
} {
  const { data: items, isLoading } = useInventoryItems();
  const rows = useMemo(
    () => (items ? buildExpiryRows(items) : undefined),
    [items]
  );
  return { data: rows, isLoading };
}
