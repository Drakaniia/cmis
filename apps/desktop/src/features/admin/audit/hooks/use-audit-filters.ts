import { useCallback, useMemo, useState } from "react";

import type {
  AuditActionType,
  AuditDatePreset,
  AuditFilters,
  AuditRow,
} from "../types";
import {
  auditCategoryOf,
  DEFAULT_AUDIT_FILTERS,
  filterAuditRows,
} from "../types";

export type AuditChipKey = "actions" | "preset" | "search" | "user";

/**
 * CMIS-UI-09 §3.3 — audit filter state. Kept in one hook so the filter bar and
 * the table stay declarative, and chips are derived rather than duplicated.
 */
export function useAuditFilters(
  rows: AuditRow[],
  initial: Partial<AuditFilters> = {}
) {
  const [filters, setFilters] = useState<AuditFilters>({
    ...DEFAULT_AUDIT_FILTERS,
    ...initial,
  });

  const filtered = useMemo(
    () => filterAuditRows(rows, filters),
    [rows, filters]
  );

  const users = useMemo(
    () => [...new Set(rows.map((row) => row.user))].sort(),
    [rows]
  );

  const setSearch = useCallback(
    (search: string) => setFilters((prev) => ({ ...prev, search })),
    []
  );

  const setUser = useCallback(
    (user: string) => setFilters((prev) => ({ ...prev, user })),
    []
  );

  const setPreset = useCallback(
    (preset: AuditDatePreset) => setFilters((prev) => ({ ...prev, preset })),
    []
  );

  const toggleAction = useCallback((action: AuditActionType) => {
    setFilters((prev) => ({
      ...prev,
      actions: prev.actions.includes(action)
        ? prev.actions.filter((value) => value !== action)
        : [...prev.actions, action],
    }));
  }, []);

  const clearFilters = useCallback(() => setFilters(DEFAULT_AUDIT_FILTERS), []);

  const activeChips = useMemo(() => {
    const chips: { key: AuditChipKey; label: string }[] = [];
    if (filters.preset !== "30d") {
      chips.push({
        key: "preset",
        label: `Range: ${filters.preset === "all" ? "All time" : filters.preset}`,
      });
    }
    if (filters.user !== "All") {
      chips.push({ key: "user", label: `User: ${filters.user}` });
    }
    for (const action of filters.actions) {
      chips.push({ key: "actions", label: auditCategoryOf(action).label });
    }
    if (filters.search.trim()) {
      chips.push({ key: "search", label: `"${filters.search}"` });
    }
    return chips;
  }, [filters]);

  const removeChip = useCallback(
    (key: AuditChipKey, label?: string) => {
      if (key === "search") {
        setSearch("");
        return;
      }
      if (key === "preset") {
        setPreset("30d");
        return;
      }
      if (key === "user") {
        setUser("All");
        return;
      }
      const match = filters.actions.find(
        (action) => auditCategoryOf(action).label === label
      );
      if (match) {
        toggleAction(match);
      }
    },
    [filters.actions, setPreset, setSearch, setUser, toggleAction]
  );

  return {
    activeChips,
    clearFilters,
    filtered,
    filters,
    removeChip,
    setPreset,
    setSearch,
    setUser,
    toggleAction,
    users,
  } as const;
}
