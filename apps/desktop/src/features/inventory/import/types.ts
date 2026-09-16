export interface ImportWarning {
  coerced: number | null;
  column: string;
  raw: string;
  reason: string;
  row: number;
}

/**
 * One parsed template row.
 *
 * The four strength columns are carried **as parsed**, not flattened into a
 * `dosage` string (spec §10, decision 5). Flattening at import time is what made
 * the split unrecoverable and forced the exporter to re-guess it.
 */
export interface ParsedInventoryRow {
  category: string | null;
  daily: number[];
  dailySum: number;
  /** True while any of the four strength fields is blank (§6.4). */
  detailsIncomplete: boolean;
  /** Composed full label — what gets stored in `display_name` (decision 18). */
  displayName: string;
  form: string;
  isNoStock: boolean;
  name: string;
  packSize: string;
  row: number;
  stockOnHand: number | null;
  stockRemaining: number | null;
  strengthUnit: string;
  strengthValue: string;
  supplier: string | null;
  totalDispensed: number | null;
  totalMismatch: boolean;
}

export interface ParseResult {
  detailsIncompleteCount: number;
  mismatchCount: number;
  rows: ParsedInventoryRow[];
  skippedEmptyRows: number;
  warnings: ImportWarning[];
}

export interface ImportResult {
  backupsKept: number;
  detailsIncompleteCount: number;
  imported: number;
  inserted: number;
  mismatchCount: number;
  needsBatchCount: number;
  skippedEmptyRows: number;
  updated: number;
  warnings: ImportWarning[];
}
