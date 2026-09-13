import type { AuditActionType, AuditRow } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Anchored to load time so relative presets always have something to show. */
const NOW = Date.now();

let seq = 0;
function make(
  action: AuditActionType,
  user: string,
  detail: string,
  branch: string,
  ago: number,
  extra: Partial<AuditRow> = {}
): AuditRow {
  seq += 1;
  return {
    action,
    at: new Date(NOW - ago).toISOString(),
    branch,
    detail,
    id: `AUD-${String(1000 + seq)}`,
    user,
    ...extra,
  };
}

export const mockAuditRows: AuditRow[] = [
  make(
    "dispense",
    "J. Cruz",
    "Paracetamol 500mg −12 via REQ-2026-0141",
    "Main Clinic",
    22 * MINUTE,
    {
      after: { batch: "B-2026-04", onHand: 108, qty: 12 },
      before: { batch: "B-2026-04", onHand: 120, qty: 12 },
      requestRef: "REQ-2026-0141",
    }
  ),
  make(
    "request",
    "Viewer #184",
    "Request submitted — Cetirizine 10mg × 6",
    "Main Clinic",
    48 * MINUTE,
    {
      after: { qty: 6, status: "Pending" },
      before: { qty: 6, status: null },
      requestRef: "REQ-2026-0146",
    }
  ),
  make(
    "stock-in",
    "M. Reyes",
    "Paracetamol 500mg +120 via B-2026-04",
    "Main Clinic",
    2 * HOUR + 5 * MINUTE,
    {
      after: { batch: "B-2026-04", onHand: 120 },
      before: { batch: "B-2026-04", onHand: 0 },
    }
  ),
  make(
    "settings",
    "A. Lim",
    "Settings changed: Alert Thresholds by A. Lim",
    "All",
    3 * HOUR,
    {
      after: { expiryWindowDays: 30, globalLowStock: 15 },
      before: { expiryWindowDays: 60, globalLowStock: 12 },
    }
  ),
  make(
    "user",
    "A. Lim",
    "Role change — R. Santos: Viewer → Staff",
    "North Clinic",
    5 * HOUR,
    {
      after: { branch: "North Clinic", role: "Staff" },
      before: { branch: "North Clinic", role: "Viewer" },
    }
  ),
  make(
    "sync",
    "System",
    "Sync conflict auto-resolved — 3 records merged",
    "All",
    8 * HOUR,
    {
      after: { conflicts: 0, merged: 3 },
      before: { conflicts: 3, merged: 0 },
    }
  ),
  make(
    "stock-out",
    "M. Reyes",
    "Disposed ORS Sachet −40 (expired)",
    "Main Clinic",
    26 * HOUR,
    {
      after: { batch: "O-112", onHand: 12, reason: "Expired" },
      before: { batch: "O-112", onHand: 52, reason: null },
    }
  ),
  make(
    "dispense",
    "A. Lim",
    "Amoxicillin 500mg −8 via REQ-2026-0132",
    "Main Clinic",
    28 * HOUR,
    {
      after: { batch: "A-2041", onHand: 64, qty: 8 },
      before: { batch: "A-2041", onHand: 72, qty: 8 },
      requestRef: "REQ-2026-0132",
    }
  ),
  make(
    "request",
    "Viewer #201",
    "Request denied — Salbutamol Inhaler × 1",
    "North Clinic",
    2 * DAY + HOUR,
    {
      after: { reason: "Out of Stock", status: "Denied" },
      before: { reason: null, status: "Pending" },
      requestRef: "REQ-2026-0128",
    }
  ),
  make(
    "stock-in",
    "M. Reyes",
    "Gauze Pads 10x10 +50 via G-77",
    "South Annex",
    3 * DAY,
    {
      after: { batch: "G-77", onHand: 74 },
      before: { batch: "G-77", onHand: 24 },
    }
  ),
  make(
    "correction",
    "A. Lim",
    "Correction of [AUD-1007] — quantity mistyped",
    "Main Clinic",
    3 * DAY + 2 * HOUR,
    {
      after: { onHand: 52, qty: 40 },
      before: { onHand: 92, qty: 40 },
      correctionOf: "AUD-1007",
      reason: "Dispose quantity was logged as 80 instead of 40.",
    }
  ),
  make("user", "A. Lim", "Account deactivated — K. Tan", "All", 4 * DAY, {
    after: { status: "Inactive" },
    before: { status: "Active" },
  }),
  make(
    "settings",
    "A. Lim",
    "Settings changed: Branches by A. Lim",
    "All",
    5 * DAY,
    {
      after: { name: "South Annex", status: "inactive" },
      before: { name: "South Annex", status: "active" },
    }
  ),
  make(
    "dispense",
    "J. Cruz",
    "Loperamide 2mg −6 via REQ-2026-0119",
    "Main Clinic",
    6 * DAY,
    {
      after: { batch: "L-330", onHand: 14, qty: 6 },
      before: { batch: "L-330", onHand: 20, qty: 6 },
      requestRef: "REQ-2026-0119",
    }
  ),
  make(
    "sync",
    "System",
    "Offline queue flushed — 12 records synced",
    "All",
    7 * DAY,
    {
      after: { pending: 0, synced: 12 },
      before: { pending: 12, synced: 0 },
    }
  ),
  make(
    "stock-in",
    "M. Reyes",
    "Cetirizine 10mg +200 via C-118",
    "North Clinic",
    9 * DAY,
    {
      after: { batch: "C-118", onHand: 200 },
      before: { batch: "C-118", onHand: 0 },
    }
  ),
  make(
    "request",
    "Viewer #160",
    "Request submitted — Metformin 500mg × 30",
    "Main Clinic",
    11 * DAY,
    {
      after: { qty: 30, status: "Pending" },
      before: { qty: 30, status: null },
      requestRef: "REQ-2026-0101",
    }
  ),
  make(
    "stock-out",
    "M. Reyes",
    "Expired batch extended — P-889 +30 days",
    "Main Clinic",
    13 * DAY,
    {
      after: { expiry: "2026-10-19" },
      before: { expiry: "2026-09-19" },
    }
  ),
  make(
    "dispense",
    "A. Lim",
    "Vitamin B Complex −20 via REQ-2026-0094",
    "South Annex",
    16 * DAY,
    {
      after: { batch: "V-51", onHand: 36, qty: 20 },
      before: { batch: "V-51", onHand: 56, qty: 20 },
      requestRef: "REQ-2026-0094",
    }
  ),
  make(
    "settings",
    "A. Lim",
    "Settings changed: Suppliers by A. Lim",
    "All",
    21 * DAY,
    {
      after: { leadTimeDays: 7, name: "HealthLink Distributors" },
      before: { leadTimeDays: 10, name: "HealthLink Distributors" },
    }
  ),
];

/** Mark originals that already have a correction row and link both ways. */
for (const row of mockAuditRows) {
  if (row.correctionOf) {
    const original = mockAuditRows.find(
      (candidate) => candidate.id === row.correctionOf
    );
    if (original) {
      original.corrected = true;
      original.correctionId = row.id;
    }
  }
}
