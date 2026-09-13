import { auditTimestamp } from "../format";
import type { DispensingRow } from "./types";

const HEADERS = [
  "Date",
  "ID",
  "Medicine",
  "SKU",
  "Batch",
  "Qty",
  "Requestor",
  "Requestor ID",
  "Staff",
  "Status",
  "Request",
  "Branch",
];

function cell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Pure CSV builder so the export shape is testable without touching the DOM. */
export function buildDispensingCsv(rows: DispensingRow[]): string {
  const lines = [HEADERS.map(cell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        auditTimestamp(row.dispensedAt),
        row.id,
        row.medicine,
        row.medicineSku,
        row.batch,
        String(row.qty),
        row.requestor,
        row.requestorId,
        row.staff,
        row.status,
        row.requestLink ?? "",
        row.branch,
      ]
        .map(cell)
        .join(",")
    );
  }
  return lines.join("\n");
}

/** Export the filtered dispensing view as a CSV download. */
export function downloadDispensingCsv(rows: DispensingRow[], fileName: string) {
  const blob = new Blob([buildDispensingCsv(rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
