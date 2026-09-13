export type InventoryStatus = "in" | "low" | "out" | "expiring";

/** CMIS-UI-03 §2.1 — Expiry urgency taxonomy */
export type ExpiryStatus =
  | "expired"
  | "expiring-soon"
  | "expiring-later"
  | "safe";

/** CMIS-UI-03 §2.1 — Global thresholds (defaults 30/90, configurable in Admin Settings) */
export const EXPIRY_THRESHOLDS = {
  later: 90,
  soon: 30,
} as const;

/** CMIS-UI-03 §3.1 — Date range presets */
export type ExpiryDatePreset = "next-30d" | "30-90d" | "expired" | "all";

/** CMIS-UI-03 §3.1 — Expiry filter state */
export interface ExpiryFilters {
  datePreset: ExpiryDatePreset;
  search: string;
  sortDir: SortDir;
  sortKey: SortKey;
  status: ExpiryStatus | "all"; // segmented control value
}

/** CMIS-UI-03 §2.1 — Row-level expiry info */
export interface ExpiryRow {
  batch: InventoryBatch;
  daysUntil: number; // negative = expired
  expiryStatus: ExpiryStatus;
  item: InventoryItem;
}

/** CMIS-UI-03 §3 — Dispose reason */
export type DisposeReason = "Expired" | "Damaged" | "Other";

/** CMIS-UI-03 §3.2 — Minimap bucket */
export interface MinimapBucket {
  count: number;
  label: string; // "Jan", "Feb", etc.
  monthKey: string; // "2026-01"
}

export interface InventoryBatch {
  batch: string;
  expiry: string; // ISO date string
  qty: number;
  supplier: string;
}

export interface DispensingRecord {
  batch: string;
  date: string; // ISO or display
  qty: number;
  requestor: string;
  staff: string;
}

export interface InventoryItem {
  barcode?: string;
  batches: InventoryBatch[];
  category: string; // Analgesic, Antibiotic...
  dispensingHistory: DispensingRecord[];
  expiry: string; // nearest expiry ISO
  id: string;
  name: string; // e.g., "Paracetamol 500mg"
  qty: number; // total across batches
  sku: string; // SKU-001
  status: InventoryStatus;
  supplier: string;
  threshold: number; // low stock threshold
}

export type SortKey =
  | "name"
  | "sku"
  | "batch"
  | "category"
  | "qty"
  | "status"
  | "expiry";
export type SortDir = "asc" | "desc";

export interface InventoryFilters {
  category: string; // "All" or specific
  search: string;
  sortDir: SortDir;
  sortKey: SortKey;
  status: string; // All / In / Low / Out / Expiring
}

export const INVENTORY_CATEGORIES = [
  "Analgesic",
  "Antibiotic",
  "Antiseptic",
  "Supplement",
  "Respiratory",
  "Gastro",
  "First Aid",
] as const;

export const INVENTORY_STATUSES: { label: string; value: string }[] = [
  { label: "All", value: "All" },
  { label: "In Stock", value: "in" },
  { label: "Low Stock", value: "low" },
  { label: "Out of Stock", value: "out" },
  { label: "Expiring", value: "expiring" },
];

export interface StockInPayload {
  batch: string;
  category: string;
  expiry: string;
  identifier: string; // SKU or barcode
  name: string;
  notes?: string;
  qty: number;
  supplier: string;
  unit: string;
}

export interface StockOutPayload {
  batch: string;
  itemId: string;
  notes?: string;
  qty: number;
  reason:
    | "Dispensed"
    | "Disposed (expired)"
    | "Damaged"
    | "Transferred"
    | "Other";
  reasonOther?: string;
}

// ─── CMIS-UI-04 Low-Stock Alerts ────────────────────────────────────────────

/** CMIS-UI-04 §2.1 — Low-stock urgency taxonomy */
export type LowStockStatus = "out-of-stock" | "low-stock" | "in-stock";

/** CMIS-UI-04 §3.3 — Low-stock filter state */
export interface LowStockFilters {
  category: string; // "All" or specific category
  search: string;
  sortDir: SortDir;
  sortKey: LowStockSortKey;
  status: LowStockStatus | "all"; // segmented control value — default "all" (Low+Out)
  supplier: string; // "All" or specific supplier
}

/** CMIS-UI-04 §2 — Row-level low-stock info */
export interface LowStockRow {
  currentQty: number;
  gap: number; // threshold - current (negative means overstock)
  gapPercent: number; // current / threshold * 100, clamped 0–100
  item: InventoryItem;
  lowStockStatus: LowStockStatus;
  suggestedQty: number; // reorder suggestion: max(threshold*2 - current, threshold)
  threshold: number;
}

/** CMIS-UI-04 §3.2 — Supplier with lead time hint */
export interface SupplierInfo {
  leadTimeDays?: number;
  name: string;
}

export type LowStockSortKey =
  | "name"
  | "sku"
  | "qty"
  | "threshold"
  | "gap"
  | "status"
  | "supplier";
