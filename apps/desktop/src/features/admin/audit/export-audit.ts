import { auditTimestamp } from "../format";
import type { AuditRow } from "./types";
import { auditCategoryOf } from "./types";

const HEADERS = [
  "Timestamp",
  "ID",
  "User",
  "Action",
  "Details",
  "Branch",
  "Request",
  "Amended",
];

function cell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Pure CSV builder so the export shape is testable without touching the DOM. */
export function buildAuditCsv(rows: AuditRow[]): string {
  const lines = [HEADERS.map(cell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        auditTimestamp(row.at),
        row.id,
        row.user,
        auditCategoryOf(row.action).label,
        row.detail,
        row.branch,
        row.requestRef ?? "",
        row.corrected ? "Yes" : "No",
      ]
        .map(cell)
        .join(",")
    );
  }
  return lines.join("\n");
}

/**
 * CMIS-UI-09 §3.5 — export the filtered view. Large exports stream in the
 * desktop build; on the web we hand the rows to a Blob download.
 */
export function downloadAuditCsv(rows: AuditRow[], fileName: string) {
  const blob = new Blob([buildAuditCsv(rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
