import { useCallback, useState } from "react";

import type {
  Category,
  ExpiryWindowDays,
  SettingsState,
  Supplier,
} from "../types";

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
  backup: {
    lastBackupAt: "",
    nextRun: "",
    path: "%APPDATA%/com.cmis.app/backups",
    schedule: "off",
  },
  categories: [],
  general: {
    appName: "cmis",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12-hour",
  },
  suppliers: [],
};

/**
 * CMIS-UI-09 §2 — settings mutations. Every section save is global and
 * immediately visible to all roles, so the caller toasts + the audit log
 * records "Settings changed: [section] by [Admin]" (§2.3 persistence).
 */
export function useSettings(initial: SettingsState = DEFAULT_SETTINGS) {
  const [state, setState] = useState<SettingsState>(initial);

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

  const addCategory = useCallback((category: Category) => {
    setState((prev) => ({
      ...prev,
      categories: [...prev.categories, category],
    }));
  }, []);

  const updateCategory = useCallback((id: string, patch: Partial<Category>) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.map((category) =>
        category.id === id ? { ...category, ...patch } : category
      ),
    }));
  }, []);

  const removeCategory = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.filter((category) => category.id !== id),
    }));
  }, []);

  const triggerBackup = useCallback(() => {
    const at = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      backup: { ...prev.backup, lastBackupAt: at },
    }));
    return at;
  }, []);

  const setBackupSchedule = useCallback(
    (schedule: SettingsState["backup"]["schedule"]) => {
      setState((prev) => ({ ...prev, backup: { ...prev.backup, schedule } }));
    },
    []
  );

  return {
    addCategory,
    addSupplier,
    removeCategory,
    removeSupplier,
    setAlerts,
    setBackupSchedule,
    setOverride,
    state,
    triggerBackup,
    updateCategory,
    updateGeneral,
    updateSupplier,
  } as const;
}
