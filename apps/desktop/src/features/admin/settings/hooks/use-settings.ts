import * as React from "react";

import { mockSettings } from "../mock";
import type {
  Category,
  ExpiryWindowDays,
  SettingsState,
  Supplier,
} from "../types";

/**
 * CMIS-UI-09 §2 — settings mutations. Every section save is global and
 * immediately visible to all roles, so the caller toasts + the audit log
 * records "Settings changed: [section] by [Admin]" (§2.3 persistence).
 */
export function useSettings(initial: SettingsState = mockSettings) {
  const [state, setState] = React.useState<SettingsState>(initial);

  const updateGeneral = React.useCallback(
    (patch: Partial<SettingsState["general"]>) => {
      setState((prev) => ({ ...prev, general: { ...prev.general, ...patch } }));
    },
    []
  );

  const setAlerts = React.useCallback(
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

  const setOverride = React.useCallback((id: string, value: number | null) => {
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

  const addSupplier = React.useCallback((supplier: Supplier) => {
    setState((prev) => ({ ...prev, suppliers: [...prev.suppliers, supplier] }));
  }, []);

  const updateSupplier = React.useCallback(
    (id: string, patch: Partial<Supplier>) => {
      setState((prev) => ({
        ...prev,
        suppliers: prev.suppliers.map((supplier) =>
          supplier.id === id ? { ...supplier, ...patch } : supplier
        ),
      }));
    },
    []
  );

  const removeSupplier = React.useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      suppliers: prev.suppliers.filter((supplier) => supplier.id !== id),
    }));
  }, []);

  const addCategory = React.useCallback((category: Category) => {
    setState((prev) => ({
      ...prev,
      categories: [...prev.categories, category],
    }));
  }, []);

  const updateCategory = React.useCallback(
    (id: string, patch: Partial<Category>) => {
      setState((prev) => ({
        ...prev,
        categories: prev.categories.map((category) =>
          category.id === id ? { ...category, ...patch } : category
        ),
      }));
    },
    []
  );

  const removeCategory = React.useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.filter((category) => category.id !== id),
    }));
  }, []);

  const triggerBackup = React.useCallback(() => {
    const at = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      backup: { ...prev.backup, lastBackupAt: at },
    }));
    return at;
  }, []);

  const setBackupSchedule = React.useCallback(
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
