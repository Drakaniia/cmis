import { useCallback, useEffect, useMemo, useState } from "react";
import { buildLowStockRows } from "../domain/low-stock";
import type {
  InventoryItem,
  LowStockFilters,
  LowStockRow,
  LowStockSortKey,
  LowStockStatus,
  SortDir,
} from "../types";

const DEFAULT_LOW_STOCK_FILTERS: LowStockFilters = {
  category: "All",
  search: "",
  sortDir: "asc",
  sortKey: "gap",
  status: "all", // CMIS-UI-04 §2.1 — default shows Low+Out (actionable)
  supplier: "All",
};

function applyLowStockFilters(
  rows: LowStockRow[],
  filters: LowStockFilters
): LowStockRow[] {
  const q = filters.search.trim().toLowerCase();

  let out = rows.filter((row) => {
    // Category filter
    if (filters.category !== "All" && row.item.category !== filters.category) {
      return false;
    }

    // Supplier filter
    if (filters.supplier !== "All" && row.item.supplier !== filters.supplier) {
      return false;
    }

    // Status filter — CMIS-UI-04 §2.1 default is "all" which means Low+Out
    if (filters.status === "all") {
      // Default: show only actionable items (Out + Low), hide In Stock
      if (row.lowStockStatus === "in-stock") {
        return false;
      }
    } else if (filters.status !== row.lowStockStatus) {
      return false;
    }

    // Search
    if (q) {
      const hay =
        `${row.item.name} ${row.item.sku} ${row.item.supplier} ${row.item.category}`.toLowerCase();
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
      case "qty":
        va = a.currentQty;
        vb = b.currentQty;
        break;
      case "threshold":
        va = a.threshold;
        vb = b.threshold;
        break;
      case "gap":
        // Gap ascending = most urgent first (largest gap first)
        va = a.gap;
        vb = b.gap;
        break;
      case "supplier":
        va = a.item.supplier;
        vb = b.item.supplier;
        break;
      case "status": {
        // Out > Low > In for urgency
        const order = { "in-stock": 2, "low-stock": 1, "out-of-stock": 0 };
        va = order[a.lowStockStatus];
        vb = order[b.lowStockStatus];
        break;
      }
      default:
        va = a.gap;
        vb = b.gap;
    }
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });

  return out;
}

export function useLowStockFilters(items: InventoryItem[]) {
  const allRows = useMemo(() => buildLowStockRows(items), [items]);

  const [filters, setFilters] = useState<LowStockFilters>(
    DEFAULT_LOW_STOCK_FILTERS
  );
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
    () => applyLowStockFilters(allRows, effectiveFilters),
    [allRows, effectiveFilters]
  );

  // CMIS-UI-04 §4 — sidebar badge count (Out + Low)
  const urgentCount = useMemo(
    () =>
      allRows.filter(
        (r) =>
          r.lowStockStatus === "out-of-stock" ||
          r.lowStockStatus === "low-stock"
      ).length,
    [allRows]
  );

  const setSearch = useCallback((v: string) => {
    setFilters((p) => ({ ...p, search: v }));
  }, []);

  const setCategory = useCallback((v: string) => {
    setFilters((p) => ({ ...p, category: v }));
  }, []);

  const setSupplier = useCallback((v: string) => {
    setFilters((p) => ({ ...p, supplier: v }));
  }, []);

  const setStatus = useCallback((v: LowStockFilters["status"]) => {
    setFilters((p) => ({ ...p, status: v }));
  }, []);

  const setSort = useCallback((key: LowStockSortKey) => {
    setFilters((p) => {
      if (p.sortKey === key) {
        const nextDir: SortDir = p.sortDir === "asc" ? "desc" : "asc";
        return { ...p, sortDir: nextDir };
      }
      return { ...p, sortDir: "asc", sortKey: key };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_LOW_STOCK_FILTERS);
    setDebouncedSearch("");
  }, []);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; value: string }[] = [];
    if (filters.supplier !== "All") {
      chips.push({
        key: "supplier",
        label: `Supplier: ${filters.supplier}`,
        value: filters.supplier,
      });
    }
    if (filters.category !== "All") {
      chips.push({
        key: "category",
        label: `Category: ${filters.category}`,
        value: filters.category,
      });
    }
    if (filters.status !== "all") {
      const statusLabels: Record<LowStockStatus, string> = {
        "in-stock": "In Stock",
        "low-stock": "Low",
        "out-of-stock": "Out",
      };
      chips.push({
        key: "status",
        label: `Status: ${statusLabels[filters.status]}`,
        value: filters.status,
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
  }, [filters]);

  const removeChip = useCallback((key: string) => {
    setFilters((p) => {
      if (key === "search") {
        return { ...p, search: "" };
      }
      if (key === "supplier") {
        return { ...p, supplier: "All" };
      }
      if (key === "category") {
        return { ...p, category: "All" };
      }
      if (key === "status") {
        return { ...p, status: "all" };
      }
      return p;
    });
    if (key === "search") {
      setDebouncedSearch("");
    }
  }, []);

  // Distinct suppliers, categories from items
  const distinctSuppliers = useMemo(
    () => [...new Set(items.map((i) => i.supplier))].sort(),
    [items]
  );
  const distinctCategories = useMemo(
    () => [...new Set(items.map((i) => i.category))].sort(),
    [items]
  );

  return {
    activeChips,
    allRows,
    clearFilters,
    distinctCategories,
    distinctSuppliers,
    filtered,
    filters,
    removeChip,
    setCategory,
    setSearch,
    setSort,
    setStatus,
    setSupplier,
    urgentCount,
  } as const;
}
