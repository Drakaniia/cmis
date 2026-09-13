/**
 * CMIS-UI-09 §2 — System Settings domain types.
 * Settings are global defaults plus per-item overrides; every save is audited
 * ("Settings changed: [section] by [Admin]") because it affects all roles.
 */

export type SettingsTabId =
  | "general"
  | "users"
  | "thresholds"
  | "suppliers"
  | "categories"
  | "audit"
  | "data"
  | "health"
  | "backup";

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
    description: "Create, edit, deactivate accounts and assign roles",
    id: "users",
    label: "Users",
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
    description: "Schedule, location and restore",
    id: "backup",
    label: "Backup",
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

export interface Category {
  id: string;
  itemCount: number;
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
  timeFormat: "12-hour" | "24-hour";
}

export interface AlertSettings {
  expiryWindowDays: ExpiryWindowDays;
  globalLowStock: number;
  overrides: ThresholdOverride[];
}

export interface BackupSettings {
  lastBackupAt: string;
  nextRun: string;
  path: string;
  schedule: "off" | "daily" | "weekly";
}

export interface SettingsState {
  alerts: AlertSettings;
  backup: BackupSettings;
  categories: Category[];
  general: GeneralSettings;
  suppliers: Supplier[];
}
