import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  InventoryFilters,
  InventoryItem,
  SortDir,
  SortKey,
} from "../types";

const DEFAULT_FILTERS: InventoryFilters = {
  category: "All",
  search: "",
  sortDir: "asc",
  sortKey: "name",
  status: "All",
};

function applyFilters(
  items: InventoryItem[],
  filters: InventoryFilters
): InventoryItem[] {
  const q = filters.search.trim().toLowerCase();
  let out = items.filter((it) => {
    if (filters.category !== "All" && it.category !== filters.category) {
      return false;
    }
    if (filters.status !== "All" && it.status !== filters.status) {
      return false;
    }
    if (q) {
      // Search covers all four strength fields plus the stored label (decision
      // 17), so "500", "mg", "tablet", "100/box" and "Paracetamol 500 mg" all
      // find the row — the operator does not have to know which field a token
      // was filed under.
      const hay = [
        it.name,
        it.displayName,
        it.sku,
        it.barcode ?? "",
        it.strengthValue,
        it.strengthUnit,
        it.form,
        it.packSize,
        it.batches.map((b) => b.batch).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }
    return true;
  });

  out = [...out].sort((a, b) => {
    const dir = filters.sortDir === "asc" ? 1 : -1;
    let va: string | number = "";
    let vb: string | number = "";
    switch (filters.sortKey) {
      case "name":
        va = a.name;
        vb = b.name;
        break;
      case "sku":
        va = a.sku;
        vb = b.sku;
        break;
      case "category":
        va = a.category;
        vb = b.category;
        break;
      case "qty":
        va = a.qty;
        vb = b.qty;
        break;
      case "status":
        va = a.status;
        vb = b.status;
        break;
      case "expiry":
        va = a.expiry;
        vb = b.expiry;
        break;
      default:
        va = a.name;
        vb = b.name;
    }
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });

  return out;
}

export function useInventoryFilters(items: InventoryItem[]) {
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  // Debounce search 150ms per spec §2.2
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(filters.search), 150);
    return () => window.clearTimeout(t);
  }, [filters.search]);

  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const filtered = useMemo(
    () => applyFilters(items, effectiveFilters),
    [items, effectiveFilters]
  );

  const setSearch = useCallback((v: string) => {
    setFilters((p) => ({ ...p, search: v }));
  }, []);

  const setCategory = useCallback((v: string) => {
    setFilters((p) => ({ ...p, category: v }));
  }, []);

  const setStatus = useCallback((v: string) => {
    setFilters((p) => ({ ...p, status: v }));
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
    setFilters(DEFAULT_FILTERS);
    setDebouncedSearch("");
  }, []);

  const activeChips = useMemo(() => {
    const chips: {
      key: keyof InventoryFilters;
      label: string;
      value: string;
    }[] = [];
    if (filters.category !== "All") {
      chips.push({
        key: "category",
        label: `Category: ${filters.category}`,
        value: filters.category,
      });
    }
    if (filters.status !== "All") {
      chips.push({
        key: "status",
        label: `Status: ${filters.status}`,
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

  const removeChip = useCallback((key: keyof InventoryFilters) => {
    setFilters((p) => {
      if (key === "search") {
        return { ...p, search: "" };
      }
      if (key === "category") {
        return { ...p, category: "All" };
      }
      if (key === "status") {
        return { ...p, status: "All" };
      }
      return p;
    });
    if (key === "search") {
      setDebouncedSearch("");
    }
  }, []);

  return {
    activeChips,
    clearFilters,
    filtered,
    filters,
    removeChip,
    setCategory,
    setSearch,
    setSort,
    setStatus,
  } as const;
}
