import { useCallback, useEffect, useMemo, useState } from "react";
import { buildExpiryRows } from "../domain/expiry";
import type {
  ExpiryDatePreset,
  ExpiryFilters,
  ExpiryRow,
  InventoryItem,
  SortDir,
  SortKey,
} from "../types";

const DEFAULT_EXPIRY_FILTERS: ExpiryFilters = {
  datePreset: "all",
  search: "",
  sortDir: "asc",
  sortKey: "expiry",
  status: "all",
};

function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function matchesDatePreset(
  daysUntil: number,
  preset: ExpiryDatePreset
): boolean {
  switch (preset) {
    case "expired":
      return daysUntil < 0;
    case "next-30d":
      return daysUntil >= 0 && daysUntil <= 30;
    case "30-90d":
      return daysUntil >= 30 && daysUntil <= 90;
    default:
      return true;
  }
}

function matchesSearch(row: ExpiryRow, query: string): boolean {
  if (query.length === 0) {
    return true;
  }
  const hay =
    `${row.item.name} ${row.item.sku} ${row.batch.batch} ${row.item.barcode ?? ""}`.toLowerCase();
  return hay.includes(query);
}

function matchesExpiryFilters(
  row: ExpiryRow,
  filters: ExpiryFilters,
  query: string,
  activeMonth: string | null
): boolean {
  // Status filter
  if (filters.status !== "all" && row.expiryStatus !== filters.status) {
    return false;
  }
  // Date preset filter
  if (
    filters.datePreset !== "all" &&
    !matchesDatePreset(row.daysUntil, filters.datePreset)
  ) {
    return false;
  }
  // Minimap month filter — CMIS-UI-03 §3.2
  if (activeMonth && monthKeyOf(row.batch.expiry) !== activeMonth) {
    return false;
  }
  return matchesSearch(row, query);
}

function sortValueOf(row: ExpiryRow, key: SortKey): string | number {
  switch (key) {
    case "name":
      return row.item.name;
    case "sku":
      return row.item.sku;
    case "batch":
      return row.batch.batch;
    case "qty":
      return row.batch.qty;
    default:
      return row.daysUntil;
  }
}

function compareExpiryRows(
  a: ExpiryRow,
  b: ExpiryRow,
  filters: ExpiryFilters
): number {
  const dir = filters.sortDir === "asc" ? 1 : -1;
  const va = sortValueOf(a, filters.sortKey);
  const vb = sortValueOf(b, filters.sortKey);
  if (typeof va === "number" && typeof vb === "number") {
    return (va - vb) * dir;
  }
  return String(va).localeCompare(String(vb)) * dir;
}

function applyExpiryFilters(
  rows: ExpiryRow[],
  filters: ExpiryFilters,
  activeMonth: string | null
): ExpiryRow[] {
  const q = filters.search.trim().toLowerCase();
  const matched = rows.filter((row) =>
    matchesExpiryFilters(row, filters, q, activeMonth)
  );
  return [...matched].sort((a, b) => compareExpiryRows(a, b, filters));
}

export function useExpiryFilters(
  items: InventoryItem[],
  activeMonth: string | null,
  onMonthClear?: () => void
) {
  const allRows = useMemo(() => buildExpiryRows(items), [items]);

  const [filters, setFilters] = useState<ExpiryFilters>(DEFAULT_EXPIRY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  // Debounce search 150ms
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(filters.search), 150);
    return () => window.clearTimeout(t);
  }, [filters.search]);

  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const filtered = useMemo(
    () => applyExpiryFilters(allRows, effectiveFilters, activeMonth),
    [allRows, effectiveFilters, activeMonth]
  );

  // Counts for sidebar badge — CMIS-UI-03 §4 (Expired + Expiring Soon)
  const urgentCount = useMemo(
    () =>
      allRows.filter(
        (r) =>
          r.expiryStatus === "expired" || r.expiryStatus === "expiring-soon"
      ).length,
    [allRows]
  );

  const setSearch = useCallback((v: string) => {
    setFilters((p) => ({ ...p, search: v }));
  }, []);

  const setStatus = useCallback((v: ExpiryFilters["status"]) => {
    setFilters((p) => ({ ...p, status: v }));
  }, []);

  const setDatePreset = useCallback((v: ExpiryDatePreset) => {
    setFilters((p) => ({ ...p, datePreset: v }));
  }, []);

  const setSort = useCallback((key: SortKey) => {
    setFilters((p) => {
      if (p.sortKey === key) {
        const nextDir: SortDir = p.sortDir === "asc" ? "desc" : "asc";
        return { ...p, sortDir: nextDir };
      }
      return { ...p, sortDir: "asc", sortKey: key };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_EXPIRY_FILTERS);
    setDebouncedSearch("");
  }, []);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; value: string }[] = [];
    // Minimap month chip — CMIS-UI-03 §3.2
    if (activeMonth) {
      const [year, month] = activeMonth.split("-");
      const monthLabel = new Date(
        Number(year),
        Number(month) - 1
      ).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      chips.push({
        key: "month",
        label: `Month: ${monthLabel}`,
        value: activeMonth,
      });
    }
    if (filters.status !== "all") {
      chips.push({
        key: "status",
        label: `Status: ${filters.status}`,
        value: filters.status,
      });
    }
    if (filters.datePreset !== "all") {
      const presetLabels: Record<ExpiryDatePreset, string> = {
        "30-90d": "30–90 days",
        all: "All dates",
        expired: "Expired",
        "next-30d": "Next 30 days",
      };
      chips.push({
        key: "datePreset",
        label: `Date: ${presetLabels[filters.datePreset]}`,
        value: filters.datePreset,
      });
    }
    if (filters.search.trim()) {
      chips.push({
        key: "search",
        label: `Search: ${filters.search}`,
        value: filters.search,
      });
    }
    return chips;
  }, [filters, activeMonth]);

  const removeChip = useCallback(
    (key: string) => {
      if (key === "month") {
        onMonthClear?.();
        return;
      }
      setFilters((p) => {
        if (key === "search") {
          return { ...p, search: "" };
        }
        if (key === "status") {
          return { ...p, status: "all" };
        }
        if (key === "datePreset") {
          return { ...p, datePreset: "all" };
        }
        return p;
      });
      if (key === "search") {
        setDebouncedSearch("");
      }
    },
    [onMonthClear]
  );

  return {
    activeChips,
    allRows,
    clearFilters,
    filtered,
    filters,
    removeChip,
    setDatePreset,
    setSearch,
    setSort,
    setStatus,
    urgentCount,
  } as const;
}
