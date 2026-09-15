/**
 * CMIS-UI-01 — Dashboard domain types.
 *
 * StatTone pairs a visual tone with a text label so colour is never the
 * only signal (§5.3). DashboardRole determines which link set and
 * capability surface the Home screen renders. DashboardLinkKey is the
 * union of every destination the stat cards, alerts band, and health row
 * can deep-link into.
 */

export type StatTone = "danger" | "neutral" | "ok" | "warn";

export type DashboardRole = "admin" | "staff";

export type DashboardLinkKey =
  | "audit"
  | "expiry"
  | "health"
  | "inventory"
  | "lowStock"
  | "requests"
  | "users";

export interface HomeStat {
  context: string;
  label: string;
  link: DashboardLinkKey;
  sparkline: number[];
  tone: StatTone;
  value: string;
}

export interface ExpiryAlert {
  batch: string;
  daysUntilExpiry: number;
  expiry: string;
  id: string;
  medicine: string;
  qty: number;
  unit: string;
}

export interface LowStockAlert {
  category: string;
  id: string;
  medicine: string;
  qty: number;
  threshold: number;
  unit: string;
  updatedAt: string;
}

export interface DispensingCategory {
  color: string;
  count: number;
  label: string;
}

export interface DispensingVelocityData {
  categoryBreakdown: DispensingCategory[];
  changePercent: number;
  dailyCounts: { count: number; label: string }[];
  todayTotal: number;
}

export interface StockAdjustmentItem {
  branch?: string;
  detail: string;
  medicine: string;
}

export interface StockAdjustmentsData {
  discrepancies: { count: number; items: StockAdjustmentItem[] };
  flagged: { count: number; items: StockAdjustmentItem[] };
  transfers: { count: number; items: StockAdjustmentItem[] };
}

export interface HourlyCount {
  dispensed: number;
  hour: number;
  requests: number;
}

export interface ActivityRow {
  action: string;
  actor: string;
  id: string;
  target: string;
  timestamp: string;
  tone: StatTone;
}
