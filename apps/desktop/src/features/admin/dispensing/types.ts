/**
 * CMIS-UI-06 — Dispensing Log domain types.
 *
 * Audit-compliant history of every claim (Viewer-requested + direct Staff
 * stock-out dispensed). Read-heavy, export-dependent, legally significant.
 * Rows are immutable — edits go through Audit correction (09).
 */

export type DispensingStatus = "dispensed" | "denied";

/**
 * How the hand-over that produced this row came about (migration 0008).
 *
 * The log is the audit surface, and "Walk-in" is what a quick deduction and an
 * anonymous queued request both render as — so without this the two are
 * indistinguishable exactly where the distinction matters most.
 */
export type DispensingSource = "queue" | "quick-deduct";

/** Short label for the row marker. */
export const DISPENSING_SOURCE_LABELS: Record<DispensingSource, string> = {
  queue: "Request queue",
  "quick-deduct": "Quick deduct",
};

/** Longer wording for the expanded detail. */
export const DISPENSING_SOURCE_DETAIL: Record<DispensingSource, string> = {
  queue: "Queued request, dispensed from the board",
  "quick-deduct": "Quick deduction — taken at the counter",
};

/**
 * A quick deduction of an item that has no batch rows records an empty batch
 * rather than inventing one (quick-deduct spec E1), so the cell says so in
 * words instead of showing a blank a reader has to interpret.
 */
export const NO_BATCH_LABEL = "No batch recorded";

export function hasBatch(row: { batch: string }): boolean {
  return row.batch.trim() !== "";
}

/** The batch cell's text — the code, or the explanation for its absence. */
export function batchLabel(row: { batch: string }): string {
  return hasBatch(row) ? row.batch : NO_BATCH_LABEL;
}

/** Stored values are untrusted strings; anything unknown reads as `queue`. */
export function toDispensingSource(
  value: string | null | undefined
): DispensingSource {
  return value === "quick-deduct" ? "quick-deduct" : "queue";
}

export type DispensingDatePreset = "7d" | "30d" | "90d" | "all";

export const DISPENSING_DATE_PRESETS: {
  label: string;
  value: DispensingDatePreset;
}[] = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "All time", value: "all" },
];

export const DISPENSING_STATUSES: {
  label: string;
  value: "all" | DispensingStatus;
}[] = [
  { label: "All", value: "all" },
  { label: "Dispensed", value: "dispensed" },
  { label: "Denied", value: "denied" },
];

export interface DispensingRow {
  batch: string;
  branch: string;
  dispensedAt: string;
  id: string;
  medicine: string;
  medicineSku: string;
  qty: number;
  requestLink: string | null;
  requestor: string;
  requestorId: string;
  source: DispensingSource;
  staff: string;
  status: DispensingStatus;
}

export interface DispensingFilters {
  branch: string;
  medicine: string;
  preset: DispensingDatePreset;
  requestor: string;
  search: string;
  staff: string;
  status: "all" | DispensingStatus;
}

export const DEFAULT_DISPENSING_FILTERS: DispensingFilters = {
  branch: "All",
  medicine: "All",
  preset: "30d",
  requestor: "",
  search: "",
  staff: "All",
  status: "all",
};

const PRESET_DAYS: Record<DispensingDatePreset, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/** Pure filter + search over dispensing rows. */
export function filterDispensingRows(
  rows: DispensingRow[],
  filters: DispensingFilters,
  now: number = Date.now()
): DispensingRow[] {
  const days = PRESET_DAYS[filters.preset];
  const cutoff = days === null ? null : now - days * 86_400_000;
  const query = filters.search.trim().toLowerCase();
  const requestorQuery = filters.requestor.trim().toLowerCase();

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential independent predicates
  return rows.filter((row) => {
    if (cutoff !== null && new Date(row.dispensedAt).getTime() < cutoff) {
      return false;
    }
    if (filters.status !== "all" && row.status !== filters.status) {
      return false;
    }
    if (filters.staff !== "All" && row.staff !== filters.staff) {
      return false;
    }
    if (filters.branch !== "All" && row.branch !== filters.branch) {
      return false;
    }
    if (filters.medicine !== "All" && row.medicine !== filters.medicine) {
      return false;
    }
    if (requestorQuery) {
      const matchesRequestor =
        row.requestor.toLowerCase().includes(requestorQuery) ||
        row.requestorId.toLowerCase().includes(requestorQuery);
      if (!matchesRequestor) {
        return false;
      }
    }
    if (!query) {
      return true;
    }
    return (
      row.medicine.toLowerCase().includes(query) ||
      row.batch.toLowerCase().includes(query) ||
      row.requestor.toLowerCase().includes(query) ||
      row.staff.toLowerCase().includes(query) ||
      row.id.toLowerCase().includes(query)
    );
  });
}
