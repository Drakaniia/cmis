/**
 * CMIS-UI-01 — Dashboard mock data (v2).
 *
 * Provides realistic placeholder data for the admin home screen, shaped
 * to match the screenshot design with richer alert rows and contextual
 * stat cards.
 */

import type { StatTone } from "./types";

// ── Stat grid ──────────────────────────────────────────────────────

export interface HomeStat {
  /** Contextual note beneath the label, e.g. "+48 received this week" */
  context: string;
  /** Label beneath the value */
  label: string;
  /** Deep-link destination key */
  link:
    | "audit"
    | "expiry"
    | "health"
    | "inventory"
    | "lowStock"
    | "requests"
    | "users";
  /** 7-day sparkline data (7 values) */
  sparkline: number[];
  /** Traffic-light tone for the status dot */
  tone: StatTone;
  /** Primary display value, e.g. "1,248" */
  value: string;
}

export const mockHomeStats: HomeStat[] = [
  {
    context: "+48 received this week",
    label: "TOTAL ITEMS",
    link: "inventory",
    sparkline: [1120, 1135, 1128, 1160, 1155, 1175, 1248],
    tone: "ok",
    value: "1,248",
  },
  {
    context: "+3 since Friday",
    label: "LOW STOCK",
    link: "lowStock",
    sparkline: [4, 3, 5, 3, 4, 2, 12],
    tone: "warn",
    value: "12",
  },
  {
    context: "Steady all morning",
    label: "PENDING REQUESTS",
    link: "requests",
    sparkline: [8, 6, 5, 9, 7, 11, 7],
    tone: "warn",
    value: "7",
  },
  {
    context: "2 fewer than last week",
    label: "EXPIRING IN 30D",
    link: "expiry",
    sparkline: [3, 5, 4, 7, 6, 8, 5],
    tone: "danger",
    value: "5",
  },
];

// ── Expiry alerts ──────────────────────────────────────────────────

export interface ExpiryAlert {
  batch: string;
  daysUntilExpiry: number;
  expiry: string;
  id: string;
  medicine: string;
  qty: number;
  unit: string;
}

export const mockExpiryAlerts: ExpiryAlert[] = [
  {
    batch: "A-2041",
    daysUntilExpiry: 3,
    expiry: "2026-09-16",
    id: "EXP-001",
    medicine: "Amoxicillin 500mg",
    qty: 24,
    unit: "caps",
  },
  {
    batch: "P-889",
    daysUntilExpiry: 7,
    expiry: "2026-09-20",
    id: "EXP-002",
    medicine: "Paracetamol 250mg Syrup",
    qty: 60,
    unit: "bottles",
  },
  {
    batch: "O-112",
    daysUntilExpiry: 12,
    expiry: "2026-09-25",
    id: "EXP-003",
    medicine: "ORS Sachet",
    qty: 15,
    unit: "packs",
  },
  {
    batch: "C-77",
    daysUntilExpiry: 18,
    expiry: "2026-10-01",
    id: "EXP-004",
    medicine: "Cetirizine 10mg",
    qty: 4,
    unit: "strips",
  },
  {
    batch: "M-403",
    daysUntilExpiry: 26,
    expiry: "2026-10-09",
    id: "EXP-005",
    medicine: "Metformin 500mg",
    qty: 100,
    unit: "tabs",
  },
];

// ── Low-stock alerts ───────────────────────────────────────────────

export interface LowStockAlert {
  category: string;
  id: string;
  medicine: string;
  qty: number;
  threshold: number;
  unit: string;
  updatedAt: string;
}

export const mockLowStockAlerts: LowStockAlert[] = [
  {
    category: "Respiratory",
    id: "LOW-001",
    medicine: "Loperamide 2mg",
    qty: 4,
    threshold: 20,
    unit: "left",
    updatedAt: "2h ago",
  },
  {
    category: "Respiratory",
    id: "LOW-002",
    medicine: "Salbutamol Inhaler",
    qty: 2,
    threshold: 15,
    unit: "left",
    updatedAt: "5h ago",
  },
  {
    category: "Antiseptic",
    id: "LOW-003",
    medicine: "Alcohol 70% 500ml",
    qty: 6,
    threshold: 25,
    unit: "left",
    updatedAt: "1d ago",
  },
  {
    category: "First Aid",
    id: "LOW-004",
    medicine: "Gauze Pads 10x10",
    qty: 9,
    threshold: 30,
    unit: "left",
    updatedAt: "1d ago",
  },
  {
    category: "Supplement",
    id: "LOW-005",
    medicine: "Vitamin B Complex",
    qty: 11,
    threshold: 24,
    unit: "left",
    updatedAt: "2d ago",
  },
];

// ── Dispensing velocity ───────────────────────────────────────────

export interface DispensingCategory {
  color: string;
  count: number;
  label: string;
}

export interface DispensingVelocityData {
  /** Breakdown by category for today */
  categoryBreakdown: DispensingCategory[];
  /** % change vs yesterday (positive = more, negative = less) */
  changePercent: number;
  /** 7-day daily dispensed counts */
  dailyCounts: { count: number; label: string }[];
  /** Total items dispensed today */
  todayTotal: number;
}

export const mockDispensingVelocity: DispensingVelocityData = {
  categoryBreakdown: [
    { color: "bg-primary", count: 18, label: "Analgesics" },
    { color: "bg-blue-500", count: 12, label: "Antibiotics" },
    { color: "bg-emerald-500", count: 8, label: "Vitamins" },
    { color: "bg-amber-500", count: 5, label: "Respiratory" },
    { color: "bg-muted", count: 4, label: "Other" },
  ],
  changePercent: 12,
  dailyCounts: [
    { count: 38, label: "Mon" },
    { count: 42, label: "Tue" },
    { count: 35, label: "Wed" },
    { count: 51, label: "Thu" },
    { count: 47, label: "Fri" },
    { count: 22, label: "Sat" },
    { count: 47, label: "Today" },
  ],
  todayTotal: 47,
};

// ── Stock adjustments ─────────────────────────────────────────────

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

export const mockStockAdjustments: StockAdjustmentsData = {
  discrepancies: {
    count: 4,
    items: [
      {
        detail: "System: 24 · Physical: 18",
        medicine: "Amoxicillin 500mg",
      },
      {
        branch: "South",
        detail: "System: 12 · Physical: 9",
        medicine: "Paracetamol Syrup",
      },
    ],
  },
  flagged: {
    count: 2,
    items: [
      {
        detail: "Damaged packaging · 3 strips",
        medicine: "Cetirizine 10mg",
      },
    ],
  },
  transfers: {
    count: 3,
    items: [
      {
        branch: "Main → South",
        detail: "Requested 2h ago",
        medicine: "Salbutamol Inhaler ×5",
      },
    ],
  },
};

// ── Hourly activity (24 h) ─────────────────────────────────────────

export interface HourlyCount {
  dispensed: number;
  hour: number;
  requests: number;
}

export const mockHourlyActivity: HourlyCount[] = [
  { dispensed: 0, hour: 0, requests: 0 },
  { dispensed: 0, hour: 1, requests: 0 },
  { dispensed: 0, hour: 2, requests: 0 },
  { dispensed: 0, hour: 3, requests: 0 },
  { dispensed: 0, hour: 4, requests: 0 },
  { dispensed: 0, hour: 5, requests: 0 },
  { dispensed: 1, hour: 6, requests: 2 },
  { dispensed: 3, hour: 7, requests: 5 },
  { dispensed: 5, hour: 8, requests: 8 },
  { dispensed: 7, hour: 9, requests: 12 },
  { dispensed: 4, hour: 10, requests: 9 },
  { dispensed: 6, hour: 11, requests: 7 },
  { dispensed: 3, hour: 12, requests: 6 },
  { dispensed: 5, hour: 13, requests: 10 },
  { dispensed: 4, hour: 14, requests: 14 },
  { dispensed: 2, hour: 15, requests: 8 },
  { dispensed: 1, hour: 16, requests: 5 },
  { dispensed: 0, hour: 17, requests: 3 },
  { dispensed: 0, hour: 18, requests: 1 },
  { dispensed: 0, hour: 19, requests: 0 },
  { dispensed: 0, hour: 20, requests: 0 },
  { dispensed: 0, hour: 21, requests: 0 },
  { dispensed: 0, hour: 22, requests: 0 },
  { dispensed: 0, hour: 23, requests: 0 },
];

// ── Activity feed ──────────────────────────────────────────────────

export interface ActivityRow {
  action: string;
  actor: string;
  id: string;
  target: string;
  timestamp: string;
  tone: StatTone;
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export const mockActivity: ActivityRow[] = [
  {
    action: "Dispensed",
    actor: "M. Reyes",
    id: "ACT-001",
    target: "Paracetamol 500mg → Ben Tolentino",
    timestamp: hoursAgo(0.5),
    tone: "ok",
  },
  {
    action: "Denied",
    actor: "M. Reyes",
    id: "ACT-002",
    target: "Cotrimoxazole 480mg — John Dela Cruz",
    timestamp: hoursAgo(1.2),
    tone: "danger",
  },
  {
    action: "Stock in",
    actor: "J. Cruz",
    id: "ACT-003",
    target: "Amoxicillin 500mg ×50 caps",
    timestamp: hoursAgo(2),
    tone: "ok",
  },
  {
    action: "Approved",
    actor: "M. Reyes",
    id: "ACT-004",
    target: "Salbutamol Inhaler → Ben Tolentino",
    timestamp: hoursAgo(2.5),
    tone: "ok",
  },
  {
    action: "Expiry warning",
    actor: "System",
    id: "ACT-005",
    target: "ORS Sachet B-2025-09 — 5 days left",
    timestamp: hoursAgo(4),
    tone: "danger",
  },
  {
    action: "Stock in",
    actor: "A. Lim",
    id: "ACT-006",
    target: "Gauze Pads 10x10 ×20 packs",
    timestamp: hoursAgo(5),
    tone: "ok",
  },
  {
    action: "Low stock",
    actor: "System",
    id: "ACT-007",
    target: "Salbutamol Inhaler — 4 remaining",
    timestamp: hoursAgo(6),
    tone: "warn",
  },
  {
    action: "Dispensed",
    actor: "J. Cruz",
    id: "ACT-008",
    target: "Vitamin B Complex → Liza Paredes",
    timestamp: hoursAgo(8),
    tone: "ok",
  },
  {
    action: "Stock in",
    actor: "M. Reyes",
    id: "ACT-009",
    target: "Paracetamol 500mg ×200 tabs",
    timestamp: hoursAgo(10),
    tone: "ok",
  },
  {
    action: "Request",
    actor: "A. Lim",
    id: "ACT-010",
    target: "Amoxicillin 500mg → Patient #412",
    timestamp: hoursAgo(12),
    tone: "warn",
  },
];
