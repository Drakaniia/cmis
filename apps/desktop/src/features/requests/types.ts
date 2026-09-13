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

export interface RequestItem {
  category: string;
  deniedNote?: string;
  deniedReason?: DenyReason;
  dispensing?: DispensingRecord;
  history: StatusHistoryEntry[];
  /** e.g. REQ-2026-0141 */
  id: string;
  /** Medicine + strength, matching the inventory item name verbatim */
  medicine: string;
  notes: InternalNote[];
  qty: number;
  /** Viewer's stated reason for the request */
  reason: string;
  requestor: Requestor;
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
