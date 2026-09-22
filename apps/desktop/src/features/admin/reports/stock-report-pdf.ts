/**
 * The Stock Level Report's PDF payload (stock-level-report spec F10).
 *
 * Pure builders so the document the Rust command draws can be unit-tested
 * without a database, in the style of `stock-report-summary.ts`. Rust never
 * touches SQLite: all the SQL stays in the TS query layer and the command is a
 * pure renderer — this module is the single place the payload shape lives.
 */

import type {
  CategoryGroup,
  GrandTotal,
  MonthActivity,
  StockSummary,
} from "./types";

export interface StockReportPdfRow {
  batches: number;
  form_strength: string;
  medicine: string;
  nearest_expiry: string;
  on_hand: number;
  pack_hint: string;
  sku: string;
  status: string;
  threshold: number;
}

export interface StockReportPdfGroup {
  category: string;
  rows: StockReportPdfRow[];
}

export interface StockReportPdfPayload {
  as_of: string;
  category_label: string;
  generated_at: string;
  grand_total: {
    categories: number;
    low: number;
    medicines: number;
    nearest_expiry: string;
    out: number;
    units_on_hand: number;
  };
  groups: StockReportPdfGroup[];
  location: string;
  month: string;
  month_activity: { dispensed: string; received: string };
  month_label: string;
  operator: string;
  summary: {
    categories: number;
    expired: number;
    expiring_later: number;
    expiring_soon: number;
    low: number;
    medicines: number;
    out: number;
    units_on_hand: number;
  };
}

/** The location literal — no facility setting exists (spec §11.1). */
export const STOCK_REPORT_LOCATION = "Local";

export interface BuildStockReportPdfInput {
  activity: MonthActivity;
  asOf: string;
  category: string;
  generatedAt: string;
  grandTotal: GrandTotal;
  groups: CategoryGroup[];
  month: string;
  monthLabel: string;
  operator: string;
  summary: StockSummary;
}

/**
 * Assembles the payload the Rust `generate_stock_report_pdf` command draws.
 * Group order is the on-screen order (alphabetical, `Uncategorized` last) and
 * row order within each group is the on-screen sort — both arrive already
 * ordered via `groupByCategory`, so this function maps shapes without
 * re-sorting.
 */
export function buildStockReportPdfPayload(
  input: BuildStockReportPdfInput
): StockReportPdfPayload {
  return {
    as_of: input.asOf,
    category_label:
      input.category === "All" ? "All categories" : input.category,
    generated_at: input.generatedAt,
    grand_total: {
      categories: input.grandTotal.categories,
      low: input.grandTotal.low,
      medicines: input.grandTotal.medicines,
      nearest_expiry: input.grandTotal.nearestExpiry,
      out: input.grandTotal.out,
      units_on_hand: input.grandTotal.unitsOnHand,
    },
    groups: input.groups.map((group) => ({
      category: group.label,
      rows: group.rows.map((row) => ({
        batches: row.batches,
        form_strength: row.formStrength,
        medicine: row.name,
        nearest_expiry: row.expiryLabel,
        on_hand: row.onHand,
        pack_hint: row.packHint,
        sku: row.sku,
        status: row.status,
        threshold: row.threshold,
      })),
    })),
    location: STOCK_REPORT_LOCATION,
    month: input.month,
    month_activity: {
      dispensed: input.activity.dispensed,
      received: input.activity.received,
    },
    month_label: input.monthLabel,
    operator: input.operator,
    summary: {
      categories: input.summary.categories,
      expired: input.summary.expired,
      expiring_later: input.summary.expiringLater,
      expiring_soon: input.summary.expiringSoon,
      low: input.summary.low,
      medicines: input.summary.medicines,
      out: input.summary.out,
      units_on_hand: input.summary.unitsOnHand,
    },
  };
}

/** Filename prefix the Rust command writes — `cmis-stock-report-YYYY-MM-…`. */
export function stockReportPdfFilenamePrefix(month: string): string {
  return `cmis-stock-report-${month}-`;
}
