import { useCallback, useEffect, useState } from "react";

import { setOperatorName } from "@/features/admin/audit/operator";
import {
  DEFAULT_ORANGE_DAYS,
  DEFAULT_RED_DAYS,
} from "@/features/inventory/domain/expiry";
import { DEFAULT_APP_NAME, getAppName, setAppName } from "@/lib/app-name";
import { getExpiryThresholds, setExpiryThresholds } from "../expiry-thresholds";
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
    orangeDays: DEFAULT_ORANGE_DAYS,
    overrides: [],
    redDays: DEFAULT_RED_DAYS,
  },
  general: {
    appName: DEFAULT_APP_NAME,
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
  const [state, setState] = useState<SettingsState>(() => ({
    ...initial,
    alerts: { ...initial.alerts, ...getExpiryThresholds() },
    // The global store owns the persisted name; a stale initial (e.g. the old
    // lowercase default) must never clobber what this device already saved.
    general: { ...initial.general, appName: getAppName() },
  }));

  // Every audit writer reads the name from the module store, so settings keeps
  // it in step the moment the field is saved (spec §8.3).
  const operator = state.general.operatorName;
  useEffect(() => {
    setOperatorName(operator);
  }, [operator]);

  // A rename from another surface (never today — one settings page — but the
  // store is global by design) flows back into this page's local state.
  // Runs once on mount: after that this page is the store's only writer.
  useEffect(() => {
    const stored = getExpiryThresholds();
    setState((prev) =>
      prev.alerts.orangeDays === stored.orangeDays &&
      prev.alerts.redDays === stored.redDays &&
      prev.general.appName === getAppName()
        ? prev
        : {
            ...prev,
            alerts: { ...prev.alerts, ...stored },
            general: { ...prev.general, appName: getAppName() },
          }
    );
  }, []);

  const updateGeneral = useCallback(
    (patch: Partial<SettingsState["general"]>) => {
      if (patch.appName !== undefined) {
        setAppName(patch.appName);
      }
      setState((prev) => ({
        ...prev,
        general: {
          ...prev.general,
          ...patch,
          appName: getAppName(),
        },
      }));
    },
    []
  );

  const setAlerts = useCallback(
    (
      patch: Partial<{
        expiryWindowDays: ExpiryWindowDays;
        globalLowStock: number;
        orangeDays: number;
        redDays: number;
      }>
    ) => {
      if (patch.orangeDays === undefined && patch.redDays === undefined) {
        setState((prev) => ({ ...prev, alerts: { ...prev.alerts, ...patch } }));
        return;
      }
      const stored = setExpiryThresholds({
        ...(patch.orangeDays === undefined
          ? {}
          : { orangeDays: patch.orangeDays }),
        ...(patch.redDays === undefined ? {} : { redDays: patch.redDays }),
      });
      const next = { ...patch, ...stored };
      setState((prev) => ({ ...prev, alerts: { ...prev.alerts, ...next } }));
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
