import type { ExpiryStatus, LowStockStatus } from "@/features/inventory/types";

/**
 * Stock Report (stock-level-report-spec) — the Reports page answers one
 * question: what medicines do I have, how much, and how healthy is the shelf?
 *
 * The six analytic widget types that used to live here moved with their
 * components to `features/admin/analytics/types.ts` (D25). What remains is the
 * stock snapshot: one row per medicine, plus the summary and grouping shapes the
 * page composes out of those rows.
 */

/** Rendered where a figure or field has no value (F2 D15, F5 degradations). */
export const EM_DASH = "—";

/**
 * One medicine's current standing. A snapshot, not a window: stock is live and
 * the month picker never touches it (D30, pack-size §5 D14 — base units).
 */
export interface StockLevelRow {
  /** How many batches back the on-hand count. */
  batches: number;
  category: string;
  /** ISO date of the nearest expiry, or `""` when none is recorded. */
  expiry: string;
  /** `expiryLabel(item.expiry)`, or an em dash when blank. */
  expiryLabel: string;
  /** Urgency from the shared classifier, or `null` when no expiry is recorded. */
  expiryStatus: ExpiryStatus | null;
  /** `tablet · 500 mg`, or an em dash when both parts are blank. */
  formStrength: string;
  id: string;
  /** Short list label with strength, e.g. `Paracetamol 500 mg`. */
  name: string;
  /** On-hand count in base units. */
  onHand: number;
  /** The packaged string, e.g. `20 sachet (2 box)`, or an em dash when unset. */
  packHint: string;
  sku: string;
  status: LowStockStatus;
  threshold: number;
}

/** `category` is deliberately absent: grouping carries it (F4, open question 4). */
export type StockLevelSortKey = "name" | "onHand" | "threshold" | "status";

export type StockLevelSortDir = "asc" | "desc";

/** The table's active sort column and direction (F4/D11). */
export interface StockLevelSort {
  dir: StockLevelSortDir;
  key: StockLevelSortKey;
}

/** The month summary's three groups of figures (F2). */
export interface StockSummary {
  categories: number;
  expired: number;
  expiringLater: number;
  expiringSoon: number;
  low: number;
  medicines: number;
  out: number;
  unitsOnHand: number;
}

/** A category group's mini-summary (D8), reusable as the grand total. */
export interface GroupSubtotal {
  low: number;
  medicines: number;
  /** `expiryLabel` of the earliest expiry in the group, or an em dash. */
  nearestExpiry: string;
  out: number;
  unitsOnHand: number;
}

/** The closing row: the group subtotal plus the distinct-category count (F5). */
export interface GrandTotal extends GroupSubtotal {
  categories: number;
}

/** One category section of the grouped table (D7). */
export interface CategoryGroup {
  /** The stored category, `""` for the uncategorized bucket. */
  category: string;
  /** Display name — `Uncategorized` for the blank bucket. */
  label: string;
  rows: StockLevelRow[];
  subtotal: GroupSubtotal;
}

/** This month's in/out figures, already resolved to their display strings (F2). */
export interface MonthActivity {
  dispensed: string;
  received: string;
}
