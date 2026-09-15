import type { ImportWarning, ParsedInventoryRow, ParseResult } from "./types";

const EXPECTED_COLUMNS = 41;

/** Column positions in the 41-column template (see `INVENTORY_TEMPLATE_HEADERS`). */
const COL_STOCK_ON_HAND = 5;
const COL_DAYS_START = 6;
const COL_DAYS_END = 37; // exclusive — day 31 sits at index 36
const COL_TOTAL_DISPENSED = 37;
const COL_STOCK_REMAINING = 38;
const COL_CATEGORY = 39;
const COL_SUPPLIER = 40;

/** First integer in a free-text cell — "440 (April)" → 440, "14a" → 14. */
const INTEGER = /-?\d+/;
const LINE_BREAK = /\r?\n/;

export const INVENTORY_TEMPLATE_HEADERS = [
  "name",
  "strength_value",
  "strength_unit",
  "form",
  "pack_size",
  "stock_on_hand",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "total_dispensed",
  "stock_remaining",
  "category",
  "supplier",
] as const;

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

function assembleDosage(
  strengthValue: string,
  strengthUnit: string,
  form: string,
  packSize: string
): string {
  const sv = strengthValue.trim();
  const su = strengthUnit.trim();
  const f = form.trim();
  const ps = packSize.trim();
  // collapse strength_value + strength_unit with single space if both present
  const parts: string[] = [];
  if (sv && su) {
    parts.push(`${sv} ${su}`);
  } else if (sv) {
    parts.push(sv);
  } else if (su) {
    parts.push(su);
  }
  if (f) {
    parts.push(f);
  }
  if (ps) {
    parts.push(ps);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Header echo vs the template contract (spec 5.1 #3). */
function isTemplateHeader(headerCells: string[]): boolean {
  if (headerCells.length !== INVENTORY_TEMPLATE_HEADERS.length) {
    return false;
  }
  return INVENTORY_TEMPLATE_HEADERS.every(
    (header, index) => cellAt(headerCells, index) === header
  );
}

function collectHeaderWarnings(
  headerCells: string[],
  warnings: ImportWarning[]
): void {
  if (cellAt(headerCells, 0).toLowerCase() !== "name") {
    warnings.push({
      coerced: null,
      column: "header",
      raw: cellAt(headerCells, 0),
      reason: "header mismatch: first column should be name",
      row: 1,
    });
  }
  if (headerCells.length !== EXPECTED_COLUMNS) {
    warnings.push({
      coerced: null,
      column: "header",
      raw: String(headerCells.length),
      reason: `header column count ${headerCells.length} != ${EXPECTED_COLUMNS}`,
      row: 1,
    });
  }
  if (isTemplateHeader(headerCells)) {
    return;
  }
  // A wrong width already produced its own warning above; only a same-width
  // mismatch (wrong labels or wrong order) needs the detailed one.
  if (headerCells.length === EXPECTED_COLUMNS) {
    warnings.push({
      coerced: null,
      column: "header",
      raw: headerCells.join(","),
      reason: `header mismatch: expected ${INVENTORY_TEMPLATE_HEADERS.join(",")}`,
      row: 1,
    });
  }
}

/** Pad short rows and truncate long ones, so column reads stay positional. */
function normalizeCells(
  cells: string[],
  rowNum: number,
  warnings: ImportWarning[]
): string[] {
  if (cells.length < EXPECTED_COLUMNS) {
    const padded = [...cells];
    while (padded.length < EXPECTED_COLUMNS) {
      padded.push("");
    }
    return padded;
  }
  if (cells.length > EXPECTED_COLUMNS) {
    warnings.push({
      coerced: null,
      column: "row",
      raw: String(cells.length),
      reason: `column count ${cells.length} > ${EXPECTED_COLUMNS} truncated`,
      row: rowNum,
    });
    return cells.slice(0, EXPECTED_COLUMNS);
  }
  return cells;
}

/** True when nothing outside the name/dosage columns holds data (spec 6). */
function isRestAllBlank(cells: string[]): boolean {
  const dailyBlank = cells
    .slice(COL_DAYS_START, COL_DAYS_END)
    .every((cell) => cell.trim() === "");
  return (
    dailyBlank &&
    cellAt(cells, COL_STOCK_ON_HAND).trim() === "" &&
    cellAt(cells, COL_TOTAL_DISPENSED).trim() === "" &&
    cellAt(cells, COL_STOCK_REMAINING).trim() === "" &&
    cellAt(cells, COL_CATEGORY).trim() === "" &&
    cellAt(cells, COL_SUPPLIER).trim() === ""
  );
}

type RowDecision = { keep: true } | { keep: false; reason: string | null };

/** Rows without a name are skipped; only ones carrying data earn a warning. */
function classifyRow(
  name: string,
  dosage: string,
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
      dosage === ""
        ? "row with blank name+dosage but has data — skipped"
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
  warnings: ImportWarning[]
): ParsedInventoryRow | null {
  const name = cellAt(cells, 0).trim();
  const strengthValue = cellAt(cells, 1).trim();
  const strengthUnit = cellAt(cells, 2).trim();
  const form = cellAt(cells, 3).trim();
  const packSize = cellAt(cells, 4).trim();
  const dosage = assembleDosage(strengthValue, strengthUnit, form, packSize);

  const decision = classifyRow(name, dosage, isRestAllBlank(cells));
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
  for (let day = 1; day <= 31; day += 1) {
    // stock_on_hand sits at column 5, so day 1 is the next cell
    const cell = cells[COL_STOCK_ON_HAND + day];
    daily.push(coerceDailyCell(cell ?? "", rowNum, day, warnings));
  }
  const dailySum = daily.reduce((a, b) => a + b, 0);

  const rawTotalDispensed = cellAt(cells, COL_TOTAL_DISPENSED);
  const totalDispensed = coerceIntCell(
    rawTotalDispensed,
    rowNum,
    "total_dispensed",
    warnings
  );
  if (rawTotalDispensed.trim() === "") {
    dropBlankCellWarning(warnings, rowNum, "total_dispensed");
  }

  const rawStockRemaining = cellAt(cells, COL_STOCK_REMAINING);
  const stockRemaining = coerceIntCell(
    rawStockRemaining,
    rowNum,
    "stock_remaining",
    warnings
  );
  if (rawStockRemaining.trim() === "") {
    dropBlankCellWarning(warnings, rowNum, "stock_remaining");
  }

  const category = cellAt(cells, COL_CATEGORY).trim() || null;
  const supplier = cellAt(cells, COL_SUPPLIER).trim() || null;

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
    dosage,
    dosageMissing: dosage === "",
    // The strict template has no NO STOCK text: blank/0 stock always means qty 0.
    isNoStock: false,
    name,
    row: rowNum,
    stockOnHand,
    stockRemaining,
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
      dosageMissingCount: 0,
      mismatchCount: 0,
      rows,
      skippedEmptyRows,
      warnings,
    };
  }

  collectHeaderWarnings(splitCsvLine(rawLines[0]), warnings);

  for (let lineIdx = 1; lineIdx < rawLines.length; lineIdx += 1) {
    const line = rawLines[lineIdx];
    const rowNum = lineIdx + 1; // 1-indexed

    if (line.trim() === "") {
      continue;
    }

    const row = parseRow(
      normalizeCells(splitCsvLine(line), rowNum, warnings),
      line,
      rowNum,
      warnings
    );
    if (row === null) {
      skippedEmptyRows += 1;
      continue;
    }
    rows.push(row);
  }

  // Post-process duplicate keys within file: warn last wins
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.name.toLowerCase().trim()}|${r.dosage.toLowerCase().trim()}`;
    if (seen.has(key)) {
      warnings.push({
        coerced: null,
        column: "name",
        raw: `${r.name} / ${r.dosage}`,
        reason: `duplicate key ${key} — last row wins`,
        row: r.row,
      });
    }
    seen.set(key, r.row);
  }

  const dosageMissingCount = rows.filter((r) => r.dosageMissing).length;
  const mismatchCount = rows.filter((r) => r.totalMismatch).length;

  return {
    dosageMissingCount,
    mismatchCount,
    rows,
    skippedEmptyRows,
    warnings,
  };
}
