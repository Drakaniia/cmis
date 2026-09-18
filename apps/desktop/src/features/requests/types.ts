/**
 * CMIS-UI-05 — Request Queue (Kanban Board) domain types.
 * Spec: docs/ui/CMIS-UI-05-request-queue-kanban.md
 *
 * Status colors always pair a color token with text (§3) — never color alone.
 */

export type RequestStatus =
  | "pending"
  | "approved"
  | "ready"
  | "claimed"
  | "denied";

export type DenyReason =
  | "Out of Stock"
  | "Not Available"
  | "Duplicate Request"
  | "Other";

export const DENY_REASONS: DenyReason[] = [
  "Out of Stock",
  "Not Available",
  "Duplicate Request",
  "Other",
];

export interface Requestor {
  email: string;
  /** Student/staff ID, e.g. STU-2024-0831 */
  id: string;
  name: string;
}

export interface StatusHistoryEntry {
  /** ISO timestamp */
  at: string;
  /** Actor display name — "Viewer" for submission, staff name thereafter */
  by: string;
  from: RequestStatus | null;
  note?: string;
  to: RequestStatus;
}

export interface InternalNote {
  at: string;
  author: string;
  text: string;
}

export interface DispensingRecord {
  at: string;
  batch: string;
  expiry: string;
  qty: number;
  staff: string;
}

/**
 * How a request came to exist (D14/D15).
 *
 * `queue` is the default and covers every request walked through the board, so
 * an existing row is correct without a backfill. `quick-deduct` marks the
 * one-action counter hand-over (`Ctrl+D`), which lands directly in Claimed and
 * is otherwise indistinguishable from an anonymous walk-in request.
 */
export type RequestSource = "queue" | "quick-deduct";

export const REQUEST_SOURCES: RequestSource[] = ["queue", "quick-deduct"];

/** The card badge and the detail line for a quick deduction (D10). */
export const QUICK_DEDUCT_LABEL = "Quick deduct";

export interface RequestItem {
  category: string;
  deniedNote?: string;
  deniedReason?: DenyReason;
  /**
   * Every hand-over recorded for this request, oldest first. A partial dispense
   * leaves the card in Ready to Claim and appends a second entry later, so this
   * is a list rather than the single record migration 0001 assumed.
   */
  dispensingRecords: DispensingRecord[];
  history: StatusHistoryEntry[];
  /** e.g. REQ-2026-0141 */
  id: string;
  /**
   * Stable link to the inventory item this request was created for (migration
   * 0009). Null for rows created before the column existed, and for the
   * textual fallback when the item has since been deleted. Existing history
   * queries join on this first and fall back to the `medicine` text only when
   * it is null, so renaming an item no longer detaches its history (AF13).
   */
  itemId?: string | null;
  /** Medicine + strength, matching the inventory item name verbatim */
  medicine: string;
  notes: InternalNote[];
  qty: number;
  /** Viewer's stated reason for the request */
  reason: string;
  requestor: Requestor;
  /** How it got here — a queued request or a quick deduction (D14). */
  source: RequestSource;
  status: RequestStatus;
  /** ISO timestamp */
  submittedAt: string;
  /** tabs · caps · strip · pack · unit */
  unit: string;
}

export interface RequestColumnMeta {
  /** Tailwind background class for the status dot */
  accent: string;
  /** Badge chip classes — color paired with text */
  badgeClass: string;
  description: string;
  /** Denied lives off the main flow (§6) */
  isOffFlow: boolean;
  label: string;
  status: RequestStatus;
}

export const REQUEST_COLUMNS: RequestColumnMeta[] = [
  {
    accent: "bg-[var(--warning)]",
    badgeClass:
      "border-[var(--warning)]/40 bg-[var(--warning)]/12 text-[var(--warning)]",
    description: "New requests awaiting review",
    isOffFlow: false,
    label: "Pending",
    status: "pending",
  },
  {
    accent: "bg-primary",
    badgeClass: "border-primary/40 bg-primary/12 text-primary",
    description: "Approved — item being located",
    isOffFlow: false,
    label: "Approved",
    status: "approved",
  },
  {
    accent: "bg-[var(--success)]",
    badgeClass:
      "border-[var(--success)]/40 bg-[var(--success)]/12 text-[var(--success)]",
    description: "Prepared — viewer notified",
    isOffFlow: false,
    label: "Ready to Claim",
    status: "ready",
  },
  {
    accent: "bg-muted-foreground",
    badgeClass: "border-border bg-muted text-muted-foreground",
    description: "Claimed — dispensing logged",
    isOffFlow: false,
    label: "Claimed",
    status: "claimed",
  },
  {
    accent: "bg-destructive",
    badgeClass: "border-destructive/40 bg-destructive/12 text-destructive",
    description: "Denied — off the main flow",
    isOffFlow: true,
    label: "Denied",
    status: "denied",
  },
];

export function statusMetaOf(status: RequestStatus): RequestColumnMeta {
  const meta = REQUEST_COLUMNS.find((column) => column.status === status);
  if (!meta) {
    throw new Error(`No column metadata for status "${status}"`);
  }
  return meta;
}

/** Claimed cards auto-archive after 24h (§1). */
export const CLAIMED_ARCHIVE_HOURS = 24;

/** Total quantity handed over so far, across every dispensing record. */
export function dispensedTotal(item: RequestItem): number {
  let total = 0;
  for (const record of item.dispensingRecords) {
    total += record.qty;
  }
  return total;
}

/**
 * True while an item has been handed over at least once but is still on the
 * board — a partial dispense, whose remainder is still in Ready to Claim.
 */
export function isPartiallyDispensed(item: RequestItem): boolean {
  return item.dispensingRecords.length > 0 && item.status === "ready";
}

/** "Walk-in" whenever the requestor is anonymous (D2/D23 stores blank strings). */
export function requestorLabel(item: RequestItem): string {
  const name = item.requestor.name.trim();
  return name === "" ? "Walk-in" : name;
}

export type RequestDatePreset = "all" | "custom" | "today" | "7d" | "30d";

export const REQUEST_DATE_PRESETS: {
  label: string;
  value: RequestDatePreset;
}[] = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "All time", value: "all" },
  { label: "Custom range", value: "custom" },
];

export interface RequestFilters {
  /** "All" or a category */
  category: string;
  /** "all" | "custom" | "today" | "7d" | "30d" */
  datePreset: RequestDatePreset;
  /** Custom range ISO date (only read when datePreset === "custom") */
  from: string;
  /** Name/ID only — search covers medicine too */
  requestor: string;
  search: string;
  /** Custom range ISO date */
  to: string;
}
