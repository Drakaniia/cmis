/**
 * CMIS-UI-09 §2 — System Settings domain types.
 * Settings are global defaults plus per-item overrides; every save is audited
 * ("Settings changed: [section] by [Admin]") because it applies app-wide.
 *
 * Categories are deliberately *not* part of this state. They are stored rows
 * (migration 0006) that the inventory forms read directly — see
 * `features/inventory/domain/categories.ts` — so a second copy in a React state
 * would be a copy that silently disagrees with them.
 */

export type SettingsTabId =
  | "general"
  | "thresholds"
  | "suppliers"
  | "categories"
  | "audit"
  | "data"
  | "health"
  | "backup"
  | "updates";

export interface SettingsTabMeta {
  description: string;
  id: SettingsTabId;
  label: string;
}

export const SETTINGS_TABS: SettingsTabMeta[] = [
  {
    description: "App identity and date/time format",
    id: "general",
    label: "General",
  },
  {
    description: "Global defaults and per-item overrides",
    id: "thresholds",
    label: "Alert Thresholds",
  },
  {
    description: "Vendors, contacts and lead times",
    id: "suppliers",
    label: "Suppliers",
  },
  {
    description: "Medicine groupings and item counts",
    id: "categories",
    label: "Categories",
  },
  {
    description: "Append-only activity history and corrections",
    id: "audit",
    label: "Audit Logs",
  },
  {
    description: "Backup, export and import data",
    id: "data",
    label: "Data Export/Import",
  },
  {
    description: "DB status, sync status and system metrics",
    id: "health",
    label: "System Health",
  },
  {
    description: "Automatic daily copies, location and restore",
    id: "backup",
    label: "Backup",
  },
  {
    description: "Check for updates, version and preferences",
    id: "updates",
    label: "Updates",
  },
];

export function isSettingsTabId(value: string): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export interface Supplier {
  contact: string;
  id: string;
  leadTimeDays: number;
  name: string;
}

export type ExpiryWindowDays = 30 | 60 | 90;

export interface ThresholdOverride {
  global: number;
  id: string;
  itemName: string;
  /** `null` means the row inherits the global default. */
  override: number | null;
}

export interface GeneralSettings {
  appName: string;
  dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY";
  /** Credited as the actor on every audit row; blank falls back to "Local user". */
  operatorName: string;
  timeFormat: "12-hour" | "24-hour";
}

export interface AlertSettings {
  expiryWindowDays: ExpiryWindowDays;
  globalLowStock: number;
  overrides: ThresholdOverride[];
}

export interface SettingsState {
  alerts: AlertSettings;
  general: GeneralSettings;
  suppliers: Supplier[];
}
