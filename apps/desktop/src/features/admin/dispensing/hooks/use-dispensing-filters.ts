import * as React from "react";

import type {
  DispensingDatePreset,
  DispensingFilters,
  DispensingRow,
  DispensingStatus,
} from "../types";
import { DEFAULT_DISPENSING_FILTERS, filterDispensingRows } from "../types";

export type DispensingChipKey =
  | "branch"
  | "medicine"
  | "preset"
  | "requestor"
  | "search"
  | "staff"
  | "status";

/**
 * CMIS-UI-06 §3.3 — dispensing filter state. Kept in one hook so the filter
 * bar and the table stay declarative, and chips are derived rather than
 * duplicated.
 */
export function useDispensingFilters(
  rows: DispensingRow[],
  initial: Partial<DispensingFilters> = {}
) {
  const [filters, setFilters] = React.useState<DispensingFilters>({
    ...DEFAULT_DISPENSING_FILTERS,
    ...initial,
  });

  const filtered = React.useMemo(
    () => filterDispensingRows(rows, filters),
    [rows, filters]
  );

  const staffList = React.useMemo(
    () => [...new Set(rows.map((row) => row.staff))].sort(),
    [rows]
  );

  const branches = React.useMemo(
    () => [...new Set(rows.map((row) => row.branch))].sort(),
    [rows]
  );

  const medicines = React.useMemo(
    () => [...new Set(rows.map((row) => row.medicine))].sort(),
    [rows]
  );

  const setSearch = React.useCallback(
    (search: string) => setFilters((prev) => ({ ...prev, search })),
    []
  );

  const setRequestor = React.useCallback(
    (requestor: string) => setFilters((prev) => ({ ...prev, requestor })),
    []
  );

  const setStaff = React.useCallback(
    (staff: string) => setFilters((prev) => ({ ...prev, staff })),
    []
  );

  const setBranch = React.useCallback(
    (branch: string) => setFilters((prev) => ({ ...prev, branch })),
    []
  );

  const setMedicine = React.useCallback(
    (medicine: string) => setFilters((prev) => ({ ...prev, medicine })),
    []
  );

  const setPreset = React.useCallback(
    (preset: DispensingDatePreset) =>
      setFilters((prev) => ({ ...prev, preset })),
    []
  );

  const setStatus = React.useCallback(
    (status: "all" | DispensingStatus) =>
      setFilters((prev) => ({ ...prev, status })),
    []
  );

  const clearFilters = React.useCallback(
    () => setFilters(DEFAULT_DISPENSING_FILTERS),
    []
  );

  const activeChips = React.useMemo(() => {
    const chips: { key: DispensingChipKey; label: string }[] = [];
    if (filters.preset !== "30d") {
      const presetLabel =
        filters.preset === "all"
          ? "All time"
          : `Last ${filters.preset.replace("d", " days")}`;
      chips.push({ key: "preset", label: `Range: ${presetLabel}` });
    }
    if (filters.status !== "all") {
      chips.push({
        key: "status",
        label: `Status: ${filters.status === "dispensed" ? "Dispensed" : "Denied"}`,
      });
    }
    if (filters.staff !== "All") {
      chips.push({ key: "staff", label: `Staff: ${filters.staff}` });
    }
    if (filters.branch !== "All") {
      chips.push({ key: "branch", label: `Location: ${filters.branch}` });
    }
    if (filters.medicine !== "All") {
      chips.push({ key: "medicine", label: `Medicine: ${filters.medicine}` });
    }
    if (filters.requestor.trim()) {
      chips.push({
        key: "requestor",
        label: `Requestor: ${filters.requestor}`,
      });
    }
    if (filters.search.trim()) {
      chips.push({ key: "search", label: `"${filters.search}"` });
    }
    return chips;
  }, [filters]);

  const removeChip = React.useCallback(
    (key: DispensingChipKey) => {
      if (key === "search") {
        setSearch("");
        return;
      }
      if (key === "requestor") {
        setRequestor("");
        return;
      }
      if (key === "preset") {
        setPreset("30d");
        return;
      }
      if (key === "status") {
        setStatus("all");
        return;
      }
      if (key === "staff") {
        setStaff("All");
        return;
      }
      if (key === "branch") {
        setBranch("All");
        return;
      }
      if (key === "medicine") {
        setMedicine("All");
      }
    },
    [
      setBranch,
      setMedicine,
      setPreset,
      setSearch,
      setStaff,
      setStatus,
      setRequestor,
    ]
  );

  return {
    activeChips,
    branches,
    clearFilters,
    filtered,
    filters,
    medicines,
    removeChip,
    setBranch,
    setMedicine,
    setPreset,
    setRequestor,
    setSearch,
    setStaff,
    setStatus,
    staffList,
  } as const;
}
