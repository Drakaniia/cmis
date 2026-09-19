import { useCallback, useEffect, useMemo, useState } from "react";

import { hiddenFromBoard } from "../drag-rules";
import { endOfDayTimestamp, startOfDay, startOfDayTimestamp } from "../format";
import type { RequestFilters, RequestItem } from "../types";
import { REQUEST_DATE_PRESETS } from "../types";

export const DEFAULT_REQUEST_FILTERS: RequestFilters = {
  category: "All",
  datePreset: "all",
  from: "",
  requestor: "",
  search: "",
  to: "",
};

export interface RequestQuery {
  requestor: string;
  search: string;
}

const SEARCH_DEBOUNCE_MS = 150;
const DAY_MS = 86_400_000;

export function isWithinDateRange(
  submittedAt: string,
  filters: RequestFilters,
  now: number
): boolean {
  const submitted = new Date(submittedAt).getTime();
  switch (filters.datePreset) {
    case "today":
      return submitted >= startOfDay(now);
    case "7d":
      return submitted >= now - 7 * DAY_MS;
    case "30d":
      return submitted >= now - 30 * DAY_MS;
    case "custom": {
      if (!(filters.from || filters.to)) {
        return true;
      }
      const afterStart = filters.from
        ? submitted >= startOfDayTimestamp(filters.from)
        : true;
      const beforeEnd = filters.to
        ? submitted <= endOfDayTimestamp(filters.to)
        : true;
      return afterStart && beforeEnd;
    }
    default:
      return true;
  }
}

/**
 * Filters apply across all columns simultaneously (§5). `query` is passed
 * separately so the debounced text can differ from the controlled input value.
 */
export function applyRequestFilters(
  items: RequestItem[],
  filters: RequestFilters,
  query: RequestQuery,
  now: number
): RequestItem[] {
  const search = query.search.trim().toLowerCase();
  const who = query.requestor.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.category !== "All" && item.category !== filters.category) {
      return false;
    }
    if (!isWithinDateRange(item.submittedAt, filters, now)) {
      return false;
    }
    if (search) {
      const haystack =
        `${item.requestor.name} ${item.requestor.id} ${item.medicine}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    if (who) {
      const requestorText =
        `${item.requestor.name} ${item.requestor.id}`.toLowerCase();
      if (!requestorText.includes(who)) {
        return false;
      }
    }
    return true;
  });
}

export function useRequestFilters(
  items: RequestItem[],
  now: number,
  initial?: Partial<RequestFilters>
) {
  const [filters, setFilters] = useState<RequestFilters>(() => ({
    ...DEFAULT_REQUEST_FILTERS,
    ...initial,
  }));
  const [debounced, setDebounced] = useState<RequestQuery>(() => ({
    requestor: initial?.requestor ?? "",
    search: initial?.search ?? "",
  }));

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setDebounced({ requestor: filters.requestor, search: filters.search }),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [filters.requestor, filters.search]);

  /**
   * The one place a card leaves the board: an explicit archive marker first,
   * then the derived 24h rule (F9.7). Both mechanisms hide; only the explicit
   * one writes, so the count badge and the lane can never disagree.
   */
  const visibleItems = useMemo(
    () => items.filter((item) => !hiddenFromBoard(item, now)),
    [items, now]
  );

  const filteredItems = useMemo(
    () => applyRequestFilters(visibleItems, filters, debounced, now),
    [visibleItems, filters, debounced, now]
  );

  const categories = useMemo(() => {
    const active = new Set(visibleItems.map((item) => item.category));
    return [...active].sort((a, b) => a.localeCompare(b));
  }, [visibleItems]);

  const setSearch = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
  }, []);

  const setRequestor = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, requestor: value }));
  }, []);

  const setCategory = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, category: value }));
  }, []);

  const setDatePreset = useCallback(
    (datePreset: RequestFilters["datePreset"]) => {
      setFilters((prev) => ({ ...prev, datePreset }));
    },
    []
  );

  const setCustomRange = useCallback((from: string, to: string) => {
    setFilters((prev) => ({ ...prev, datePreset: "custom", from, to }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_REQUEST_FILTERS);
    setDebounced({ requestor: "", search: "" });
  }, []);

  const removeChip = useCallback(
    (key: "category" | "datePreset" | "requestor" | "search") => {
      setFilters((prev) => {
        switch (key) {
          case "category":
            return { ...prev, category: "All" };
          case "datePreset":
            return { ...prev, datePreset: "all", from: "", to: "" };
          case "requestor":
            return { ...prev, requestor: "" };
          default:
            return { ...prev, search: "" };
        }
      });
      if (key === "search" || key === "requestor") {
        setDebounced((prev) => ({ ...prev, [key]: "" }));
      }
    },
    []
  );

  const activeChips = useMemo(() => {
    const chips: {
      key: "category" | "datePreset" | "requestor" | "search";
      label: string;
    }[] = [];
    if (filters.datePreset !== "all") {
      const preset = REQUEST_DATE_PRESETS.find(
        (entry) => entry.value === filters.datePreset
      );
      const range =
        filters.datePreset === "custom" && (filters.from || filters.to)
          ? `${filters.from || "…"} → ${filters.to || "…"}`
          : null;
      chips.push({
        key: "datePreset",
        label: `Date: ${range ?? preset?.label ?? filters.datePreset}`,
      });
    }
    if (filters.category !== "All") {
      chips.push({ key: "category", label: `Category: ${filters.category}` });
    }
    if (filters.requestor.trim()) {
      chips.push({
        key: "requestor",
        label: `Requestor: ${filters.requestor}`,
      });
    }
    if (filters.search.trim()) {
      chips.push({ key: "search", label: `Search: ${filters.search}` });
    }
    return chips;
  }, [filters]);

  return {
    activeChips,
    categories,
    clearFilters,
    filteredItems,
    filters,
    removeChip,
    setCategory,
    setCustomRange,
    setDatePreset,
    setRequestor,
    setSearch,
    visibleItems,
  } as const;
}
