import { identityKey } from "../domain/identity";
import { isPackIncomplete } from "../domain/pack-size";
import {
  composeDisplayName,
  isDetailsIncomplete,
  normalizeText,
} from "../domain/strength";
import { PACK_UNITS } from "../domain/vocabulary";
import type { ImportWarning, ParsedInventoryRow, ParseResult } from "./types";

/**
 * The template's day columns follow the month being exported (28–31, spec
 * stock-report-export E2/E5), so the importer no longer assumes a fixed 31. The
 * layout is detected from the header row — `total_dispensed` marks where the days
 * end — and every positional index is derived from it. A file written before
 * migration 0012 has no `pack_qty` / `pack_unit` pair (41 columns rather than 43);
 * both are accepted, and a malformed width still warns exactly as it did before
 * (PK12).
 */
export const DAYS_MIN = 28;
export const DAYS_MAX = 31;

/** Columns before the daily block: name … stock_on_hand. */
const COL_STOCK_ON_HAND = 5;
const COL_DAYS_START = 6;
/** Columns after the daily block that every template width carries. */
const SUFFIX_COLUMNS = 4; // total_dispensed, stock_remaining, category, supplier
/** Appended by migration 0012 — present only in the 43-column shape. */
const PACK_COLUMNS = 2; // pack_qty, pack_unit

/**
 * The template header for a month of `daysInMonth` days (28–31).
 *
 * Exported so the exporter and the importer cannot disagree about the shape:
 * both derive their columns from this one function rather than from a pair of
 * hand-maintained constants (pack-size D26).
 */
export function buildInventoryTemplateHeaders(daysInMonth: number): string[] {
  const days = Array.from({ length: daysInMonth }, (_, index) =>
    String(index + 1)
  );
  return [
    "name",
    "strength_value",
    "strength_unit",
    "form",
    "pack_size",
    "stock_on_hand",
    ...days,
    "total_dispensed",
    "stock_remaining",
    "category",
    "supplier",
    "pack_qty",
    "pack_unit",
  ];
}

/** The 31-day, 43-column template — the widest month and the legacy shape. */
export const INVENTORY_TEMPLATE_HEADERS = buildInventoryTemplateHeaders(31);

/** The 31-day, 41-column shape a build before migration 0012 wrote. */
export const LEGACY_TEMPLATE_HEADERS = INVENTORY_TEMPLATE_HEADERS.slice(
  0,
  INVENTORY_TEMPLATE_HEADERS.length - PACK_COLUMNS
);

/**
 * The positional shape of one file, derived from its header row.
 *
 * `days` is the number of day columns actually present (28–31); `hasPack` says
 * whether the trailing pack pair is there. Every index below is computed, so a
 * 30-day file is read where a 31-day file is, without a second set of constants.
 */
export interface TemplateLayout {
  category: number;
  columnCount: number;
  days: number;
  hasPack: boolean;
  packQty: number;
  packUnit: number;
  stockRemaining: number;
  supplier: number;
  totalDispensed: number;
}

function layoutFrom(days: number, hasPack: boolean): TemplateLayout {
  const totalDispensed = COL_DAYS_START + days;
  return {
    category: totalDispensed + 2,
    columnCount: totalDispensed + SUFFIX_COLUMNS + (hasPack ? PACK_COLUMNS : 0),
    days,
    hasPack,
    packQty: totalDispensed + 4,
    packUnit: totalDispensed + 5,
    stockRemaining: totalDispensed + 1,
    supplier: totalDispensed + 3,
    totalDispensed,
  };
}

/** Fallback used only when the header is unrecognisable — the legacy 31-day read. */
const DEFAULT_LAYOUT = layoutFrom(31, true);

/** Reads the layout from a header row, or `null` when it is not a template. */
function detectLayout(headerCells: string[]): TemplateLayout | null {
  const totalDispensed = headerCells.indexOf("total_dispensed");
  if (totalDispensed < 0) {
    return null;
  }
  const days = totalDispensed - COL_DAYS_START;
  if (days < DAYS_MIN || days > DAYS_MAX) {
    return null;
  }
  if (headerCells.length === totalDispensed + SUFFIX_COLUMNS) {
    return layoutFrom(days, false);
  }
  if (headerCells.length === totalDispensed + SUFFIX_COLUMNS + PACK_COLUMNS) {
    return layoutFrom(days, true);
  }
  return null;
}

/** First integer in a free-text cell — "440 (April)" → 440, "14a" → 14. */
const INTEGER = /-?\d+/;
const LINE_BREAK = /\r?\n/;

// Forgiving RFC4180 line splitter — handles quoted commas and trims whitespace per cell
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/** Column read that tolerates rows shorter than the template. */
function cellAt(cells: string[], index: number): string {
  return cells[index] ?? "";
}

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfe_ff) {
    return text.slice(1);
  }
  return text;
}

function coerceIntCell(
  raw: string,
  row: number,
  column: string,
  warnings: ImportWarning[]
): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  // extract first integer — keep warnings for text like "440 (April)" or "NO STOCK" now unparseable
  const match = trimmed.match(INTEGER);
  if (!match) {
    warnings.push({
      coerced: null,
      column,
      raw,
      reason: "unparseable numeric cell",
      row,
    });
    return null;
  }
  const coerced = Number.parseInt(match[0], 10);
  if (String(coerced) !== trimmed) {
    warnings.push({
      coerced,
      column,
      raw,
      reason: "coerced numeric suffix/prefix stripped",
      row,
    });
  }
  if (coerced < 0 || coerced > 10_000) {
    warnings.push({
      coerced,
      column,
      raw,
      reason: coerced < 0 ? "negative qty" : "huge qty >10000",
      row,
    });
  }
  return coerced;
}

function coerceDailyCell(
  raw: string,
  row: number,
  day: number,
  warnings: ImportWarning[]
): number {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return 0;
  }
  const match = trimmed.match(INTEGER);
  if (!match) {
    warnings.push({
      coerced: 0,
      column: String(day),
      raw,
      reason: "unparseable daily cell coerced to 0",
      row,
    });
    return 0;
  }
  const coerced = Number.parseInt(match[0], 10);
  if (String(coerced) !== trimmed) {
    warnings.push({
      coerced,
      column: String(day),
      raw,
      reason: "coerced numeric suffix/prefix stripped",
      row,
    });
  }
  return coerced;
}

/**
 * Composes the full label from the template's four strength columns.
 *
 * Kept as a thin, named wrapper over `domain/strength.ts` so the importer, the
 * exporter, the creation form and the backfill cannot drift: they all render a
 * row through the same rule, which is what makes a re-import match the row it
 * came from instead of creating a second one (§7.1).
 */
export function assembleDisplayName(
  name: string,
  strengthValue: string,
  strengthUnit: string,
  form: string,
  packSize: string
): string {
  return composeDisplayName({
    form,
    name,
    packSize,
    strengthUnit,
    strengthValue,
  });
}

/** Header echo vs the template contract for the detected layout (spec 5.1 #3). */
function isTemplateHeader(
  headerCells: string[],
  layout: TemplateLayout
): boolean {
  const expected = buildInventoryTemplateHeaders(layout.days);
  return (
    headerCells.length === layout.columnCount &&
    headerCells.every((cell, index) => cell === expected[index])
  );
}

/**
 * Validates the header, pushes any warnings, and returns the layout the rest of
 * the file is read with. An unrecognisable header keeps the legacy 31-day read so
 * a malformed file still yields rows and warnings rather than nothing.
 */
function resolveLayout(
  headerCells: string[],
  warnings: ImportWarning[]
): TemplateLayout {
  if (cellAt(headerCells, 0).toLowerCase() !== "name") {
    warnings.push({
      coerced: null,
      column: "header",
      raw: cellAt(headerCells, 0),
      reason: "header mismatch: first column should be name",
      row: 1,
    });
  }
  const layout = detectLayout(headerCells);
  if (!layout) {
    warnings.push({
      coerced: null,
      column: "header",
      raw: String(headerCells.length),
      reason: `header column count ${headerCells.length} does not match a supported template (${DAYS_MIN}–${DAYS_MAX} day columns, optionally followed by pack_qty and pack_unit)`,
      row: 1,
    });
    return DEFAULT_LAYOUT;
  }
  if (!isTemplateHeader(headerCells, layout)) {
    warnings.push({
      coerced: null,
      column: "header",
      raw: headerCells.join(","),
      reason: `header mismatch: expected ${buildInventoryTemplateHeaders(layout.days).join(",")}`,
      row: 1,
    });
  }
  return layout;
}

/** Pad short rows and truncate long ones, so column reads stay positional. */
function normalizeCells(
  cells: string[],
  rowNum: number,
  warnings: ImportWarning[],
  layout: TemplateLayout
): string[] {
  if (cells.length < layout.columnCount) {
    const padded = [...cells];
    while (padded.length < layout.columnCount) {
      padded.push("");
    }
    return padded;
  }
  if (cells.length > layout.columnCount) {
    warnings.push({
      coerced: null,
      column: "row",
      raw: String(cells.length),
      reason: `column count ${cells.length} > ${layout.columnCount} truncated`,
      row: rowNum,
    });
    return cells.slice(0, layout.columnCount);
  }
  return cells;
}

/** True when nothing outside the name/dosage columns holds data (spec 6). */
function isRestAllBlank(cells: string[], layout: TemplateLayout): boolean {
  const dailyBlank = cells
    .slice(COL_DAYS_START, layout.totalDispensed)
    .every((cell) => cell.trim() === "");
  return (
    dailyBlank &&
    cellAt(cells, COL_STOCK_ON_HAND).trim() === "" &&
    cellAt(cells, layout.totalDispensed).trim() === "" &&
    cellAt(cells, layout.stockRemaining).trim() === "" &&
    cellAt(cells, layout.category).trim() === "" &&
    cellAt(cells, layout.supplier).trim() === ""
  );
}

type RowDecision = { keep: true } | { keep: false; reason: string | null };

/** Rows without a name are skipped; only ones carrying data earn a warning. */
function classifyRow(
  name: string,
  strength: string,
  restAllBlank: boolean
): RowDecision {
  if (name !== "") {
    return { keep: true };
  }
  if (restAllBlank) {
    return { keep: false, reason: null };
  }
  return {
    keep: false,
    reason:
      strength === ""
        ? "row with blank name+strength but has data — skipped"
        : "row with blank name — skipped",
  };
}

/**
 * A blank stock/total cell legitimately means "no value", so the warning its
 * coercion just queued is noise — drop it when it belongs to this blank cell.
 */
function dropBlankCellWarning(
  warnings: ImportWarning[],
  rowNum: number,
  column: string
): void {
  const last = warnings.at(-1);
  if (
    last &&
    last.row === rowNum &&
    last.column === column &&
    last.raw === ""
  ) {
    warnings.pop();
  }
}

/** One data row → a parsed medication, or `null` when the row is skipped. */
function parseRow(
  cells: string[],
  line: string,
  rowNum: number,
  warnings: ImportWarning[],
  layout: TemplateLayout
): ParsedInventoryRow | null {
  const name = cellAt(cells, 0).trim();
  const strengthValue = cellAt(cells, 1).trim();
  const strengthUnit = cellAt(cells, 2).trim();
  const form = cellAt(cells, 3).trim();
  const packSize = cellAt(cells, 4).trim();
  const displayName = assembleDisplayName(
    name,
    strengthValue,
    strengthUnit,
    form,
    packSize
  );

  const decision = classifyRow(
    name,
    normalizeText(`${strengthValue} ${strengthUnit} ${form} ${packSize}`),
    isRestAllBlank(cells, layout)
  );
  if (!decision.keep) {
    if (decision.reason) {
      warnings.push({
        coerced: null,
        column: "name",
        raw: line,
        reason: decision.reason,
        row: rowNum,
      });
    }
    return null;
  }

  // NO STOCK is unparseable in the strict template — coerceIntCell warns for it
  const rawStockOnHand = cellAt(cells, COL_STOCK_ON_HAND);
  const stockOnHand = coerceIntCell(
    rawStockOnHand,
    rowNum,
    "stock_on_hand",
    warnings
  );
  if (rawStockOnHand.trim() === "") {
    dropBlankCellWarning(warnings, rowNum, "stock_on_hand");
  }

  const daily: number[] = [];
  for (let day = 1; day <= layout.days; day += 1) {
    // stock_on_hand sits at column 5, so day 1 is the next cell
    const cell = cells[COL_STOCK_ON_HAND + day];
    daily.push(coerceDailyCell(cell ?? "", rowNum, day, warnings));
  }
  const dailySum = daily.reduce((a, b) => a + b, 0);

  const rawTotalDispensed = cellAt(cells, layout.totalDispensed);
  const totalDispensed = coerceIntCell(
    rawTotalDispensed,
    rowNum,
    "total_dispensed",
    warnings
  );
  if (rawTotalDispensed.trim() === "") {
    dropBlankCellWarning(warnings, rowNum, "total_dispensed");
  }

  const rawStockRemaining = cellAt(cells, layout.stockRemaining);
  const stockRemaining = coerceIntCell(
    rawStockRemaining,
    rowNum,
    "stock_remaining",
    warnings
  );
  if (rawStockRemaining.trim() === "") {
    dropBlankCellWarning(warnings, rowNum, "stock_remaining");
  }

  const category = cellAt(cells, layout.category).trim() || null;
  const supplier = cellAt(cells, layout.supplier).trim() || null;

  // The appended pack pair (43-column files only). A unit outside the shared
  // vocabulary is folded to blank with a warning rather than rejected (V6).
  const rawPackQty = cellAt(cells, layout.packQty).trim();
  const packQty =
    rawPackQty === ""
      ? null
      : coerceIntCell(rawPackQty, rowNum, "pack_qty", warnings);
  if (rawPackQty.trim() === "") {
    dropBlankCellWarning(warnings, rowNum, "pack_qty");
  }
  const rawPackUnit = cellAt(cells, layout.packUnit).trim();
  let packUnit = rawPackUnit.toLowerCase();
  if (packUnit !== "" && !PACK_UNITS.includes(packUnit as never)) {
    warnings.push({
      coerced: null,
      column: "pack_unit",
      raw: rawPackUnit,
      reason: `unknown pack unit “${rawPackUnit}” ignored`,
      row: rowNum,
    });
    packUnit = "";
  }

  let totalMismatch = false;
  if (totalDispensed !== null && totalDispensed !== dailySum) {
    totalMismatch = true;
    warnings.push({
      coerced: dailySum,
      column: "total_dispensed",
      raw: rawTotalDispensed,
      reason: `total vs daily sum mismatch: total ${totalDispensed} != daily_sum ${dailySum}`,
      row: rowNum,
    });
  }

  return {
    category,
    daily,
    dailySum,
    detailsIncomplete:
      isDetailsIncomplete({ form, packSize, strengthUnit, strengthValue }) ||
      isPackIncomplete({ form, packQty: packQty ?? 0, packUnit }),
    displayName,
    form,
    // The strict template has no NO STOCK text: blank/0 stock always means qty 0.
    isNoStock: false,
    name,
    packQty,
    packSize,
    packUnit,
    row: rowNum,
    stockOnHand,
    stockRemaining,
    strengthUnit,
    strengthValue,
    supplier,
    totalDispensed,
    totalMismatch,
  };
}

export function parseInventoryCsv(
  csvText: string,
  _month = "2026-08"
): ParseResult {
  const text = stripBom(csvText);
  const rawLines = text.split(LINE_BREAK);
  const warnings: ImportWarning[] = [];
  const rows: ParsedInventoryRow[] = [];
  let skippedEmptyRows = 0;

  if (
    rawLines.length === 0 ||
    (rawLines.length === 1 && rawLines[0].trim() === "")
  ) {
    return {
      detailsIncompleteCount: 0,
      mismatchCount: 0,
      rows,
      skippedEmptyRows,
      warnings,
    };
  }

  const layout = resolveLayout(splitCsvLine(rawLines[0]), warnings);

  for (let lineIdx = 1; lineIdx < rawLines.length; lineIdx += 1) {
    const line = rawLines[lineIdx];
    const rowNum = lineIdx + 1; // 1-indexed

    if (line.trim() === "") {
      continue;
    }

    const row = parseRow(
      normalizeCells(splitCsvLine(line), rowNum, warnings, layout),
      line,
      rowNum,
      warnings,
      layout
    );
    if (row === null) {
      skippedEmptyRows += 1;
      continue;
    }
    rows.push(row);
  }

  // Post-process duplicate keys within file: warn last wins. The key is the same
  // `name + four fields` identity the importer dedupes against the database on,
  // so a file cannot warn about one pair and then insert against another.
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = identityKey(r);
    if (seen.has(key)) {
      warnings.push({
        coerced: null,
        column: "name",
        raw: r.displayName || r.name,
        reason: `duplicate key ${key} — last row wins`,
        row: r.row,
      });
    }
    seen.set(key, r.row);
  }

  const detailsIncompleteCount = rows.filter((r) => r.detailsIncomplete).length;
  const mismatchCount = rows.filter((r) => r.totalMismatch).length;

  return {
    detailsIncompleteCount,
    mismatchCount,
    rows,
    skippedEmptyRows,
    warnings,
  };
}
