/**
 * CMIS-UI-09 §4 — Data Export/Import types.
 * Import is high-stakes: nothing commits until an explicit typed confirmation.
 */

export type ExportDataType = "inventory" | "requests" | "logs";

export interface ExportTypeMeta {
  count: number;
  id: ExportDataType;
  label: string;
}

export const EXPORT_TYPES: ExportTypeMeta[] = [
  { count: 812, id: "inventory", label: "Inventory" },
  { count: 341, id: "requests", label: "Requests" },
  { count: 1284, id: "logs", label: "Audit logs" },
];

export type ExportFormat = "csv" | "json";

export interface ImportDiff {
  /** Per-type change counts */
  counts: {
    deletes: number;
    inserts: number;
    updates: number;
  };
  fileName: string;
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

export const EXISTING_INVENTORY_ROWS = 812;
export const EXISTING_REQUEST_ROWS = 341;
