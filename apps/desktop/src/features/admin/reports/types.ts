/**
 * CMIS-UI-07 — Reports & Analytics types (Admin-only).
 * Revise: no staff/viewer persona split — single Admin scope
 * (all branches, selectable horizon). All widgets share one
 * filter source of truth.
 */

export type ReportsPreset = "7d" | "30d" | "90d" | "1y" | "custom";

export interface ReportsFilters {
  category: string; // "All" or INVENTORY_CATEGORIES value
  customRange?: { from: string; to: string };
  preset: ReportsPreset;
}

export interface StockMovementPoint {
  date: string; // ISO yyyy-mm-dd
  in: number;
  label: string; // "Sep 08"
  out: number;
}

export interface LowStockPoint {
  count: number;
  date: string;
  label: string;
}

export interface ExpiryBucket {
  count: number;
  label: string; // "Sep 2026"
  monthKey: string;
  urgency: "danger" | "warn" | "caution";
}

export interface CategoryUsage {
  category: string;
  color: string; // css var like var(--chart-1)
  value: number;
}

export interface FulfillmentPoint {
  category: string;
  dispensed: number;
  label: string;
  requested: number;
}

export interface TopDispensedRow {
  category: string;
  id: string;
  name: string;
  qty: number;
  sku: string;
}
