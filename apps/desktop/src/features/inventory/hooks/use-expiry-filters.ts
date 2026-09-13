import * as React from "react";
import { buildExpiryRows } from "../mock-expiry";
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

function applyExpiryFilters(
  rows: ExpiryRow[],
  filters: ExpiryFilters,
  activeMonth: string | null
): ExpiryRow[] {
  const q = filters.search.trim().toLowerCase();

  let out = rows.filter((row) => {
    // Status filter
    if (filters.status !== "all" && row.expiryStatus !== filters.status) {
      return false;
    }

    // Date preset filter
    if (filters.datePreset !== "all") {
      const d = row.daysUntil;
      if (filters.datePreset === "expired" && d >= 0) {
        return false;
      }
      if (filters.datePreset === "next-30d" && (d < 0 || d > 30)) {
        return false;
      }
      if (filters.datePreset === "30-90d" && (d < 30 || d > 90)) {
        return false;
      }
    }

    // Minimap month filter — CMIS-UI-03 §3.2
    if (activeMonth) {
      const exp = new Date(row.batch.expiry);
      const rowMonthKey = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, "0")}`;
      if (rowMonthKey !== activeMonth) {
        return false;
      }
    }

    // Search
    if (q) {
      const hay =
        `${row.item.name} ${row.item.sku} ${row.batch.batch} ${row.item.barcode ?? ""}`.toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }

    return true;
  });

  // Sort
  out = [...out].sort((a, b) => {
    const dir = filters.sortDir === "asc" ? 1 : -1;
    let va: string | number = "";
    let vb: string | number = "";
    switch (filters.sortKey) {
      case "name":
        va = a.item.name;
        vb = b.item.name;
        break;
      case "sku":
        va = a.item.sku;
        vb = b.item.sku;
        break;
      case "batch":
        va = a.batch.batch;
        vb = b.batch.batch;
        break;
      case "qty":
        va = a.batch.qty;
        vb = b.batch.qty;
        break;
      case "expiry":
        va = a.daysUntil;
        vb = b.daysUntil;
        break;
      default:
        va = a.daysUntil;
        vb = b.daysUntil;
    }
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });

  return out;
}

export function useExpiryFilters(
  items: InventoryItem[],
  activeMonth: string | null,
  onMonthClear?: () => void
) {
  const allRows = React.useMemo(() => buildExpiryRows(items), [items]);

  const [filters, setFilters] = React.useState<ExpiryFilters>(
    DEFAULT_EXPIRY_FILTERS
  );
  const [debouncedSearch, setDebouncedSearch] = React.useState(filters.search);

  // Debounce search 150ms
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(filters.search), 150);
    return () => window.clearTimeout(t);
  }, [filters.search]);

  const effectiveFilters = React.useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const filtered = React.useMemo(
    () => applyExpiryFilters(allRows, effectiveFilters, activeMonth),
    [allRows, effectiveFilters, activeMonth]
  );

  // Counts for sidebar badge — CMIS-UI-03 §4 (Expired + Expiring Soon)
  const urgentCount = React.useMemo(
    () =>
      allRows.filter(
        (r) =>
          r.expiryStatus === "expired" || r.expiryStatus === "expiring-soon"
      ).length,
    [allRows]
  );

  const setSearch = React.useCallback((v: string) => {
    setFilters((p) => ({ ...p, search: v }));
  }, []);

  const setStatus = React.useCallback((v: ExpiryFilters["status"]) => {
    setFilters((p) => ({ ...p, status: v }));
  }, []);

  const setDatePreset = React.useCallback((v: ExpiryDatePreset) => {
    setFilters((p) => ({ ...p, datePreset: v }));
  }, []);

  const setSort = React.useCallback((key: SortKey) => {
    setFilters((p) => {
      if (p.sortKey === key) {
        const nextDir: SortDir = p.sortDir === "asc" ? "desc" : "asc";
        return { ...p, sortDir: nextDir };
      }
      return { ...p, sortDir: "asc", sortKey: key };
    });
  }, []);

  const clearFilters = React.useCallback(() => {
    setFilters(DEFAULT_EXPIRY_FILTERS);
    setDebouncedSearch("");
  }, []);

  const activeChips = React.useMemo(() => {
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

  const removeChip = React.useCallback(
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
