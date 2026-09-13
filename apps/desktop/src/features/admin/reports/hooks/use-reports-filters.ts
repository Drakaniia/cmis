import * as React from "react";
import type { ReportsFilters, ReportsPreset } from "../types";

export function useReportsFilters(initial?: Partial<ReportsFilters>) {
  const [filters, setFilters] = React.useState<ReportsFilters>({
    category: initial?.category ?? "All",
    customRange: initial?.customRange,
    preset: (initial?.preset as ReportsPreset) ?? "30d",
  });

  const setPreset = React.useCallback((preset: ReportsPreset) => {
    setFilters((p) => ({ ...p, preset }));
  }, []);

  const setCategory = React.useCallback((category: string) => {
    setFilters((p) => ({ ...p, category }));
  }, []);

  const presetLabel = React.useMemo(() => {
    switch (filters.preset) {
      case "7d":
        return "Last 7 days";
      case "30d":
        return "Last 30 days";
      case "90d":
        return "Last 90 days";
      case "1y":
        return "Last 12 months";
      default:
        return "Custom";
    }
  }, [filters.preset]);

  return { filters, presetLabel, setCategory, setPreset };
}
