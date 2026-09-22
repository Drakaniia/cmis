/**
 * The Stock Report's export payload — pure builders so the workbook the operator
 * saves can be unit-tested without a database, in the style of
 * `stock-level-rows.ts` and `stock-report-summary.ts` (spec stock-report-export
 * E22).
 *
 * Two rules here are easy to get wrong and are documented where they live: the
 * exported row order is the **on-screen ordered** order (filtered, then grouped,
 * then sorted within each group — E7), and a blank category is written blank, not
 * `Uncategorized` (E-F3).
 */

import type {
  InventoryExportRow,
  InventoryExportSheet,
} from "@/features/inventory/import/export-xlsx";
import type { InventoryItem } from "@/features/inventory/types";

import { filterStockLevelRows } from "./stock-level-rows";
import { groupByCategory } from "./stock-report-groups";
import {
  EM_DASH,
  type MonthActivity,
  type StockLevelRow,
  type StockLevelSortDir,
  type StockLevelSortKey,
  type StockSummary,
} from "./types";

/** The label the report renders for a blank category — report-only (E-F3). */
const UNCATEGORIZED = "Uncategorized";

export const SUMMARY_SHEET_NAME = "Summary";

export function exportFileName(month: string): string {
  return `cmis-stock-report-${month}.xlsx`;
}

export interface StockReportExportInput {
  /** Per-item daily quantities for the selected month, indexed by day - 1. */
  dailyByItem: ReadonlyMap<string, number[]>;
  items: InventoryItem[];
  /** The category-filtered rows the table is showing. */
  rows: StockLevelRow[];
  search: string;
  sort: { dir: StockLevelSortDir; key: StockLevelSortKey };
}

/**
 * The medicine order the export writes, which is the on-screen order: the search
 * filter first, then category groups (alphabetical, `Uncategorized` last), then
 * the active sort **within** each group — flattened back to one list (E7, open
 * question 6).
 */
export function orderedExportRows({
  rows,
  search,
  sort,
}: Pick<StockReportExportInput, "rows" | "search" | "sort">): StockLevelRow[] {
  const visible = filterStockLevelRows(rows, search);
  return groupByCategory(visible, sort).flatMap((group) => group.rows);
}

/**
 * The report's blank bucket renders as `Uncategorized`, but the data file must
 * write blank: a real `Uncategorized` category in the import would change the
 * item's identity and create a category the clinic never chose (E-F3). This
 * asymmetry is deliberate — do not "fix" it.
 */
function dataCategory(category: string): string | null {
  const trimmed = category.trim();
  return trimmed === "" || trimmed === UNCATEGORIZED ? null : category;
}

export function buildExportRows(
  input: StockReportExportInput
): InventoryExportRow[] {
  const byId = new Map(input.items.map((item) => [item.id, item]));
  return orderedExportRows(input).map((row) => {
    const item = byId.get(row.id);
    const daily = input.dailyByItem.get(row.id) ?? [];
    const totalDispensed = daily.reduce((sum, value) => sum + value, 0);
    const stockOnHand = item?.qty ?? row.onHand;
    return {
      category: dataCategory(row.category),
      daily,
      // Every value is written from the stored row, never re-derived: identity is
      // name + the four strength fields + pack_size, and a re-derived pack_size
      // would be a different item (spec SX13).
      form: item?.form ?? "",
      name: item?.name ?? row.name,
      packQty: item?.packQty ? item.packQty : null,
      packSize: item?.packSize ?? "",
      packUnit: item?.packUnit ?? "",
      stockOnHand,
      stockRemaining: stockOnHand - totalDispensed,
      strengthUnit: item?.strengthUnit ?? "",
      strengthValue: item?.strengthValue ?? "",
      supplier: item?.supplier ?? "",
      totalDispensed,
    };
  });
}

export interface StockReportSummaryInput {
  activity: MonthActivity;
  asOf: string;
  category: string;
  monthLabel: string;
  operator: string;
  search: string;
  summary: StockSummary;
}

/**
 * The month figure keeps the screen's em-dash rule (E23): a quiet month reads
 * `—`, a month that received but dispensed nothing reads a real `0`. A numeric
 * figure is written as a **number** so a spreadsheet can sum it; the dash stays
 * text.
 */
function activityFigure(value: string): string | number {
  return value === EM_DASH ? EM_DASH : Number(value);
}

/**
 * The Summary sheet: the figures the screen shows, plus the context that makes
 * the file stand alone — month, filter, operator, as-of stamp (E14).
 */
export function buildExportSummary(
  input: StockReportSummaryInput
): InventoryExportSheet {
  const query = input.search.trim();
  return {
    name: SUMMARY_SHEET_NAME,
    rows: [
      ["Stock Level Report", ""],
      [],
      ["Context", ""],
      ["Month", input.monthLabel],
      [
        "Category",
        input.category === "All" ? "All categories" : input.category,
      ],
      ["Search", query === "" ? "none" : query],
      ["Operator", input.operator],
      ["As of", input.asOf],
      [],
      ["Stock totals", ""],
      ["Medicines", input.summary.medicines],
      ["Units on hand", input.summary.unitsOnHand],
      ["Categories", input.summary.categories],
      [],
      ["Shelf health", ""],
      ["Low stock", input.summary.low],
      ["Out of stock", input.summary.out],
      ["Expiring ≤ 30 days", input.summary.expiringSoon],
      ["Expiring ≤ 90 days", input.summary.expiringLater],
      ["Expired", input.summary.expired],
      [],
      ["This month", input.monthLabel],
      ["Received", activityFigure(input.activity.received)],
      ["Dispensed", activityFigure(input.activity.dispensed)],
    ],
  };
}
