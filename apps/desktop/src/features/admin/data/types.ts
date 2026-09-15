/**
 * CMIS-UI-09 §4 — Data Export/Import types.
 * Import is high-stakes: nothing commits until an explicit typed confirmation.
 */

export type ExportDataType = "inventory" | "requests" | "logs";

export interface ExportTypeMeta {
  id: ExportDataType;
  label: string;
}

/**
 * Labels only: the row counts beside each label are read from the database at
 * runtime (see `useExportCounts`). They used to be compile-time constants, which
 * meant the card advertised numbers no database ever contained.
 */
export const EXPORT_TYPES: ExportTypeMeta[] = [
  { id: "inventory", label: "Inventory" },
  { id: "requests", label: "Requests" },
  { id: "logs", label: "Audit logs" },
];

export type ExportFormat = "csv" | "json" | "xlsx";

export interface ImportDiff {
  /** Per-type change counts */
  counts: {
    deletes: number;
    inserts: number;
    updates: number;
  };
  fileName: string;
  /**
   * Present only when the file is an inventory sheet the importer can actually
   * write. Anything else is a preview: confirming it imports nothing.
   */
  inventory?: {
    /** `YYYY-MM` the daily grid is recorded under */
    month: string;
    /** Where that month came from, e.g. "from the file name" */
    monthNote: string;
  };
  kind: "csv" | "db" | "json";
  sample: ImportSampleRow[];
  /** Human-readable cautions surfaced above the confirm action */
  warnings: string[];
}

export interface ImportSampleRow {
  change: "delete" | "insert" | "update";
  id: string;
  label: string;
}
