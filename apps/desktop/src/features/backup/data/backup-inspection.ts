/** Restore inspection verdicts (backup-restore spec F10.1–F10.2). Pure. */

/** Newest migration in `src-tauri/src/lib.rs::db_migrations`. */
export const CURRENT_SCHEMA_VERSION = 12;

export type InspectionCode =
  | "damaged"
  | "newer-version"
  | "not-cmis"
  | "not-database"
  | "ok";

export interface BackupInspection {
  appVersion: string | null;
  code: string;
  mtime: number;
  name: string;
  ok: boolean;
  reason: string;
  schemaVersion: number | null;
  size: number;
}

/** Operator-facing sentence for a refusal. Empty when the file is restorable. */
export function inspectionMessage(code: string): string {
  switch (code) {
    case "ok":
      return "";
    case "damaged":
      return "This backup is damaged (integrity check failed) and cannot be restored.";
    case "newer-version":
      return "This backup was made by a newer version of CMIS — update the app first.";
    case "not-cmis":
    case "not-database":
      return "This file is not a CMIS backup and cannot be restored.";
    default:
      return "This file cannot be restored.";
  }
}

/** Whether the dialog may proceed to the typed confirmation. */
export function isRestorable(
  inspection: Pick<BackupInspection, "ok">
): boolean {
  return inspection.ok;
}
