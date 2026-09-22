import { useCallback, useEffect, useState } from "react";

import { setOperatorName } from "@/features/admin/audit/operator";
import type { ExpiryWindowDays, SettingsState, Supplier } from "../types";

/**
 * Factory defaults for every settings section. The settings page reads these
 * directly (e.g. `state.general.dateFormat`), so sections must never be
 * `undefined` — an empty state crashes every tab (see CMIS-UI-09 §2).
 */
export const DEFAULT_SETTINGS: SettingsState = {
  alerts: {
    expiryWindowDays: 30,
    globalLowStock: 15,
    overrides: [],
  },
  general: {
    appName: "cmis",
    dateFormat: "MM/DD/YYYY",
    operatorName: "",
    timeFormat: "12-hour",
  },
  suppliers: [],
};

/**
 * CMIS-UI-09 §2 — settings mutations. Every section save is global and
 * immediately visible app-wide, so the caller toasts + the audit log
 * records "Settings changed: [section] by [Admin]" (§2.3 persistence).
 */
export function useSettings(initial: SettingsState = DEFAULT_SETTINGS) {
  const [state, setState] = useState<SettingsState>(initial);

  // Every audit writer reads the name from the module store, so settings keeps
  // it in step the moment the field is saved (spec §8.3).
  const operator = state.general.operatorName;
  useEffect(() => {
    setOperatorName(operator);
  }, [operator]);

  const updateGeneral = useCallback(
    (patch: Partial<SettingsState["general"]>) => {
      setState((prev) => ({ ...prev, general: { ...prev.general, ...patch } }));
    },
    []
  );

  const setAlerts = useCallback(
    (
      patch: Partial<{
        expiryWindowDays: ExpiryWindowDays;
        globalLowStock: number;
      }>
    ) => {
      setState((prev) => ({ ...prev, alerts: { ...prev.alerts, ...patch } }));
    },
    []
  );

  const setOverride = useCallback((id: string, value: number | null) => {
    setState((prev) => ({
      ...prev,
      alerts: {
        ...prev.alerts,
        overrides: prev.alerts.overrides.map((row) =>
          row.id === id ? { ...row, override: value } : row
        ),
      },
    }));
  }, []);

  const addSupplier = useCallback((supplier: Supplier) => {
    setState((prev) => ({ ...prev, suppliers: [...prev.suppliers, supplier] }));
  }, []);

  const updateSupplier = useCallback((id: string, patch: Partial<Supplier>) => {
    setState((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((supplier) =>
        supplier.id === id ? { ...supplier, ...patch } : supplier
      ),
    }));
  }, []);

  const removeSupplier = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      suppliers: prev.suppliers.filter((supplier) => supplier.id !== id),
    }));
  }, []);

  return {
    addSupplier,
    removeSupplier,
    setAlerts,
    setOverride,
    state,
    updateGeneral,
    updateSupplier,
  } as const;
}
