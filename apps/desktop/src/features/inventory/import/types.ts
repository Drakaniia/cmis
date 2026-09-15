export interface ImportWarning {
  coerced: number | null;
  column: string;
  raw: string;
  reason: string;
  row: number;
}

export interface ParsedInventoryRow {
  category: string | null;
  daily: number[];
  dailySum: number;
  dosage: string;
  dosageMissing: boolean;
  isNoStock: boolean;
  name: string;
  row: number;
  stockOnHand: number | null;
  stockRemaining: number | null;
  supplier: string | null;
  totalDispensed: number | null;
  totalMismatch: boolean;
}

export interface ParseResult {
  dosageMissingCount: number;
  mismatchCount: number;
  rows: ParsedInventoryRow[];
  skippedEmptyRows: number;
  warnings: ImportWarning[];
}

export interface ImportResult {
  backupsKept: number;
  dosageMissingCount: number;
  imported: number;
  inserted: number;
  mismatchCount: number;
  needsBatchCount: number;
  skippedEmptyRows: number;
  updated: number;
  warnings: ImportWarning[];
}
