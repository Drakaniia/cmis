/**
 * CMIS-UI-09 §3 — Audit Log domain types.
 *
 * The log is append-only: corrections create a new row that links back to the
 * original rather than overwriting it (00 §16 Responsibility).
 */

export type AuditActionType =
  | "stock-in"
  | "stock-out"
  | "request"
  | "dispense"
  | "user"
  | "settings"
  | "sync"
  | "correction";

export interface AuditCategoryMeta {
  /** Tailwind background class for the left accent */
  accent: string;
  /** Badge chip classes — color paired with a label, never color alone */
  badgeClass: string;
  label: string;
  type: AuditActionType;
}

export const AUDIT_CATEGORIES: AuditCategoryMeta[] = [
  {
    accent: "bg-[var(--chart-1)]",
    badgeClass:
      "border-[var(--chart-1)]/40 bg-[var(--chart-1)]/12 text-[var(--chart-1)]",
    label: "Stock In",
    type: "stock-in",
  },
  {
    accent: "bg-[var(--chart-2)]",
    badgeClass:
      "border-[var(--chart-2)]/40 bg-[var(--chart-2)]/12 text-[var(--chart-2)]",
    label: "Stock Out",
    type: "stock-out",
  },
  {
    accent: "bg-[var(--chart-3)]",
    badgeClass:
      "border-[var(--chart-3)]/40 bg-[var(--chart-3)]/12 text-[var(--chart-3)]",
    label: "Request",
    type: "request",
  },
  {
    accent: "bg-[var(--chart-4)]",
    badgeClass:
      "border-[var(--chart-4)]/40 bg-[var(--chart-4)]/12 text-[var(--chart-4)]",
    label: "Dispense",
    type: "dispense",
  },
  {
    accent: "bg-[var(--chart-5)]",
    badgeClass:
      "border-[var(--chart-5)]/40 bg-[var(--chart-5)]/12 text-[var(--chart-5)]",
    label: "Correction",
    type: "correction",
  },
];

export const AUDIT_ACTION_TYPES: AuditActionType[] = [
  "stock-in",
  "stock-out",
  "request",
  "dispense",
  "user",
  "settings",
  "sync",
  "correction",
];

export function isAuditActionType(value: string): value is AuditActionType {
  return AUDIT_ACTION_TYPES.includes(value as AuditActionType);
}

export function auditCategoryOf(type: AuditActionType): AuditCategoryMeta {
  const found = AUDIT_CATEGORIES.find((category) => category.type === type);
  if (found) {
    return found;
  }
  return {
    accent: "bg-muted-foreground",
    badgeClass: "border-border bg-muted text-muted-foreground",
    label: type,
    type,
  };
}

export interface AuditRow {
  action: AuditActionType;
  /** Full before/after state for the expanded diff */
  after?: Record<string, unknown>;
  at: string;
  before?: Record<string, unknown>;
  /** Branch the change touched */
  branch: string;
  /** True once a correction exists for this row */
  corrected?: boolean;
  /** For an amended original: id of the correction row that supersedes it */
  correctionId?: string;
  /** Set on the correction row — the original log id */
  correctionOf?: string;
  /** Truncated one-line brief shown in the table */
  detail: string;
  id: string;
  /** Reason supplied with a correction (required) */
  reason?: string;
  /** Linked request/dispensing id, when applicable */
  requestRef?: string;
  user: string;
}

export type AuditDatePreset = "7d" | "30d" | "90d" | "all";

export const AUDIT_DATE_PRESETS: { label: string; value: AuditDatePreset }[] = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "All time", value: "all" },
];

export interface AuditFilters {
  /** Empty = every action type */
  actions: AuditActionType[];
  preset: AuditDatePreset;
  search: string;
  /** "All" or a user display name */
  user: string;
}

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  actions: [],
  preset: "30d",
  search: "",
  user: "All",
};

const PRESET_DAYS: Record<AuditDatePreset, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/** Pure filter + search over the log; used by the page and its tests. */
export function filterAuditRows(
  rows: AuditRow[],
  filters: AuditFilters,
  now: number = Date.now()
): AuditRow[] {
  const days = PRESET_DAYS[filters.preset];
  const cutoff = days === null ? null : now - days * 86_400_000;
  const query = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (cutoff !== null && new Date(row.at).getTime() < cutoff) {
      return false;
    }
    if (filters.user !== "All" && row.user !== filters.user) {
      return false;
    }
    if (filters.actions.length > 0 && !filters.actions.includes(row.action)) {
      return false;
    }
    if (!query) {
      return true;
    }
    const category = auditCategoryOf(row.action).label;
    return (
      row.detail.toLowerCase().includes(query) ||
      row.user.toLowerCase().includes(query) ||
      category.toLowerCase().includes(query) ||
      row.id.toLowerCase().includes(query)
    );
  });
}
