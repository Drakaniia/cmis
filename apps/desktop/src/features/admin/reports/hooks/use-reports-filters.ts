import { useCallback, useMemo, useState } from "react";
import type { ReportsFilters, ReportsPreset } from "../types";

export function useReportsFilters(initial?: Partial<ReportsFilters>) {
  const [filters, setFilters] = useState<ReportsFilters>({
    category: initial?.category ?? "All",
    customRange: initial?.customRange,
    preset: initial?.preset ?? "30d",
  });

  const setPreset = useCallback((preset: ReportsPreset) => {
    setFilters((p) => ({ ...p, preset }));
  }, []);

  const setCategory = useCallback((category: string) => {
    setFilters((p) => ({ ...p, category }));
  }, []);

  const presetLabel = useMemo(() => {
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
