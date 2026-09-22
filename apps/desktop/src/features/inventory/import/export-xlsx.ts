import { utils, writeFile } from "xlsx";
import { buildInventoryTemplateHeaders } from "./csv-parser";

/**
 * Template export (spec §10, decision 14; stock-report-export E13).
 *
 * The four strength columns are written **from the stored values**, verbatim.
 * The exporter used to run regex heuristics over a flattened `dosage` string to
 * reconstruct columns the importer had thrown away, which is why
 * export → import → export could not be guaranteed stable: the split was
 * guessed twice, by two different implementations. There is exactly one splitter
 * now (`domain/strength.ts`) and it runs once, at backfill time — by the time
 * anything reaches this module the answer is already in the row.
 *
 * The day columns are **not** a fixed 1–31 block: they follow the month being
 * exported (28–31, spec stock-report-export E2), which is why every index below
 * is computed from `daysInMonth` rather than written down.
 */

export interface InventoryExportRow {
  category: string | null;
  /** Daily dispensing quantities, one entry per day of the selected month. */
  daily: number[];
  form: string;
  name: string;
  /**
   * Appended after `supplier` (pack-size D26) — the structured pair. Optional so
   * a caller that predates migration 0012 exports blank columns rather than
   * failing to compile.
   */
  packQty?: number | null;
  packSize: string;
  packUnit?: string;
  stockOnHand: number | null;
  stockRemaining: number | null;
  strengthUnit: string;
  strengthValue: string;
  supplier: string | null;
  totalDispensed: number | null;
}

/**
 * A caller-owned second sheet. The Stock Report supplies its Summary sheet
 * through this; the Data page never does (spec stock-report-export E15).
 */
export interface InventoryExportSheet {
  name: string;
  rows: (string | number | null)[][];
}

export interface BuildInventoryWorkbookOptions {
  /** Day columns follow the selected month — 28, 29, 30 or 31 (E2). */
  daysInMonth: number;
  /** Extra sheets appended after the template grid. */
  extraSheets?: InventoryExportSheet[];
}

/** A month has at most 31 days, so an un-specified build keeps the widest shape. */
const DEFAULT_DAYS_IN_MONTH = 31;

/** First day column is `G` (0-index 6, after name…stock_on_hand). */
const FIRST_DAY_COLUMN_INDEX = 6;

/** Pads or trims a day array so every row writes exactly `daysInMonth` cells. */
function fitDaily(daily: number[], daysInMonth: number): number[] {
  if (daily.length === daysInMonth) {
    return daily;
  }
  if (daily.length > daysInMonth) {
    return daily.slice(0, daysInMonth);
  }
  return [...daily, ...new Array(daysInMonth - daily.length).fill(0)];
}

/** The zero-based index of the `total_dispensed` column for a `daysInMonth` grid. */
export function totalDispensedColumn(daysInMonth: number): number {
  return FIRST_DAY_COLUMN_INDEX + daysInMonth;
}

export function buildInventoryXlsxRows(
  rows: InventoryExportRow[],
  daysInMonth: number = DEFAULT_DAYS_IN_MONTH
): (string | number | null)[][] {
  const out: (string | number | null)[][] = [
    buildInventoryTemplateHeaders(daysInMonth),
  ];
  for (const r of rows) {
    const daily = fitDaily(r.daily, daysInMonth);
    const totalDispensed = r.totalDispensed ?? daily.reduce((a, b) => a + b, 0);
    const stockRemaining =
      r.stockRemaining ??
      (r.stockOnHand === null
        ? 0 - totalDispensed
        : r.stockOnHand - totalDispensed);
    out.push([
      r.name,
      r.strengthValue.trim(),
      r.strengthUnit.trim(),
      r.form.trim(),
      r.packSize.trim(),
      r.stockOnHand ?? "",
      ...daily.map((d) => (d === 0 ? "" : d)),
      totalDispensed,
      stockRemaining,
      r.category ?? "",
      r.supplier ?? "",
      r.packQty ?? "",
      r.packUnit?.trim() ?? "",
    ]);
  }
  return out;
}

/**
 * Builds the template workbook for `rows`.
 *
 * Exported (rather than only written to disk) so the export → import round trip
 * is testable, and so the totals cells below stay in one place. Both the Data
 * page and the Stock Report call this one builder (spec stock-report-export
 * E13) — the only difference is whether a Summary sheet is appended.
 */
export function buildInventoryWorkbook(
  rows: InventoryExportRow[],
  options: BuildInventoryWorkbookOptions = {
    daysInMonth: DEFAULT_DAYS_IN_MONTH,
  }
) {
  const { daysInMonth, extraSheets = [] } = options;
  const aoa = buildInventoryXlsxRows(rows, daysInMonth);
  const ws = utils.aoa_to_sheet(aoa);
  const columnCount = aoa[0]?.length ?? 0;
  const lastColumn = utils.encode_col(columnCount - 1);

  // Column widths per spec, recomputed for the dynamic day block.
  const cols = [
    { wch: 28 }, // A name
    { wch: 14 }, // B strength_value
    { wch: 14 }, // C strength_unit
    { wch: 16 }, // D form
    { wch: 14 }, // E pack_size
    { wch: 16 }, // F stock_on_hand
    ...new Array(daysInMonth).fill({ wch: 6 } as const), // day columns
    { wch: 16 }, // total_dispensed
    { wch: 16 }, // stock_remaining
    { wch: 18 }, // category
    { wch: 20 }, // supplier
    { wch: 12 }, // pack_qty
    { wch: 12 }, // pack_unit
  ];
  (ws as unknown as { "!cols": unknown })["!cols"] = cols;

  // Freeze A2, auto-filter over the header row's full dynamic range.
  (ws as unknown as Record<string, unknown>)["!freeze"] = {
    activePane: "bottomRight",
    topLeftCell: "B2",
    xSplit: 1,
    ySplit: 1,
  };
  (ws as unknown as Record<string, unknown>)["!autofilter"] = {
    ref: `A1:${lastColumn}1`,
  };

  // The totals columns carry formulas so a human keeps the live-recalculating
  // template, and a cached value so the importer (which only reads cached
  // results, not formulas) gets the totals back instead of blanks on re-import
  // (spec 4.6).
  const totalColumn = totalDispensedColumn(daysInMonth);
  const remainingColumn = totalColumn + 1;
  const lastDayColumn = utils.encode_col(totalColumn - 1);
  const totalColumnLetter = utils.encode_col(totalColumn);
  const cells = ws as unknown as Record<
    string,
    { f: string; t: "n"; v: number }
  >;
  for (let r = 2; r <= aoa.length; r += 1) {
    const nameCell = aoa[r - 1]?.[0];
    const total = aoa[r - 1]?.[totalColumn];
    const remaining = aoa[r - 1]?.[remainingColumn];
    if (
      typeof nameCell === "string" &&
      nameCell.trim() !== "" &&
      typeof total === "number" &&
      typeof remaining === "number"
    ) {
      cells[utils.encode_cell({ c: totalColumn, r: r - 1 })] = {
        f: `SUM(G${r}:${lastDayColumn}${r})`,
        t: "n",
        v: total,
      };
      cells[utils.encode_cell({ c: remainingColumn, r: r - 1 })] = {
        f: `IF(F${r}="",0,F${r})-${totalColumnLetter}${r}`,
        t: "n",
        v: remaining,
      };
    }
  }

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Inventory Template");
  for (const sheet of extraSheets) {
    utils.book_append_sheet(wb, utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  return wb;
}

export function downloadInventoryXlsx(
  rows: InventoryExportRow[],
  fileName: string,
  daysInMonth: number = DEFAULT_DAYS_IN_MONTH
): void {
  writeFile(buildInventoryWorkbook(rows, { daysInMonth }), fileName);
}
