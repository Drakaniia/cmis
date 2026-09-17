/**
 * CMIS-UI-05 §4 — status-machine guards, menu actions and batch actions.
 *
 * This module is the single source of truth for what a request may become. The
 * card ⋯ menu, the detail modal footer, the batch toolbar and (later) the drag
 * engine all read from here, so a forbidden transition can never be offered by
 * one surface and refused by another.
 *
 * Adjacent free movement (spec §3.3.1): Pending ↔ Approved ↔ Ready ↔ Claimed.
 * Forbidden pairs: claimed → denied, claimed → pending, denied → claimed.
 */

import type { RequestItem, RequestStatus } from "./types";
import { CLAIMED_ARCHIVE_HOURS } from "./types";

/** Flow order; Denied sits off-path at the end. */
export const STATUS_ORDER: RequestStatus[] = [
  "pending",
  "approved",
  "ready",
  "claimed",
  "denied",
];

/** The on-path flow, excluding the off-flow Denied lane. */
export const FLOW_ORDER: RequestStatus[] = STATUS_ORDER.filter(
  (status) => status !== "denied"
);

const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  approved: ["denied", "pending", "ready"],
  claimed: [],
  denied: ["pending"],
  pending: ["approved", "denied", "ready"],
  ready: ["approved", "claimed"],
};

export function canMove(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type RequestActionId =
  | "approve"
  | "cancel"
  | "deny"
  | "dispense"
  | "move-to-approved"
  | "move-to-pending"
  | "move-to-ready"
  | "reopen"
  | "view"
  | "view-dispensing-record";

export interface RequestAction {
  destructive?: boolean;
  id: RequestActionId;
  label: string;
  /** Target status for structural moves; absent for pure views */
  to?: RequestStatus;
}

/**
 * ⋯ menu actions per column (spec §3.3.1, doc §4.2).
 * "Approve" and a separate "Move to Approved" would be the same transition, so
 * they are collapsed into the single Approve entry — one label per outcome.
 */
export function requestActions(status: RequestStatus): RequestAction[] {
  const view: RequestAction = { id: "view", label: "View details" };

  switch (status) {
    case "pending":
      return [
        view,
        { id: "approve", label: "Approve", to: "approved" },
        { id: "move-to-ready", label: "Move to Ready to Claim", to: "ready" },
        { destructive: true, id: "deny", label: "Deny", to: "denied" },
        // decided or prepared yet (D19/F6). Approved and Ready are cancellable
        // through Deny, which keeps the audit trail; Claimed and Denied are
        // terminal.
        { destructive: true, id: "cancel", label: "Cancel request" },
      ];
    case "approved":
      return [
        view,
        { id: "move-to-ready", label: "Prepare → Ready to Claim", to: "ready" },
        { id: "move-to-pending", label: "Move to Pending", to: "pending" },
        { destructive: true, id: "deny", label: "Deny", to: "denied" },
      ];
    case "ready":
      return [
        view,
        { id: "dispense", label: "Dispense → Claimed", to: "claimed" },
        {
          id: "move-to-approved",
          label: "Move to Approved",
          to: "approved",
        },
      ];
    case "claimed":
      return [
        view,
        { id: "view-dispensing-record", label: "View dispensing record" },
      ];
    case "denied":
      return [
        view,
        { id: "reopen", label: "Re-open → Pending", to: "pending" },
      ];
    default:
      return [view];
  }
}

/** The primary footer action in the detail modal — omitted when terminal. */
export function primaryAction(status: RequestStatus): RequestAction | null {
  switch (status) {
    case "pending":
      return { id: "approve", label: "Approve", to: "approved" };
    case "approved":
      return { id: "move-to-ready", label: "Prepare → Ready", to: "ready" };
    case "ready":
      return { id: "dispense", label: "Dispense → Claimed", to: "claimed" };
    case "denied":
      return { id: "reopen", label: "Re-open → Pending", to: "pending" };
    default:
      return null;
  }
}

export type BatchActionId =
  | "approve-all"
  | "deny-all"
  | "dispense-all"
  | "move-all-approved"
  | "move-all-pending"
  | "prepare-all";

export interface BatchAction {
  destructive?: boolean;
  id: BatchActionId;
  label: string;
  to: RequestStatus;
}

const APPROVE_ALL: BatchAction = {
  id: "approve-all",
  label: "Approve all",
  to: "approved",
};
const DENY_ALL: BatchAction = {
  destructive: true,
  id: "deny-all",
  label: "Deny all",
  to: "denied",
};
const PREPARE_ALL: BatchAction = {
  id: "prepare-all",
  label: "Prepare all",
  to: "ready",
};
const DISPENSE_ALL: BatchAction = {
  id: "dispense-all",
  label: "Dispense all",
  to: "claimed",
};
const MOVE_ALL_PENDING: BatchAction = {
  id: "move-all-pending",
  label: "Move all to Pending",
  to: "pending",
};
const MOVE_ALL_APPROVED: BatchAction = {
  id: "move-all-approved",
  label: "Move all to Approved",
  to: "approved",
};

/**
 * Batch actions are column-aware; a mixed selection collapses to Deny plus
 * Clear selection (spec §3.3.1 multi-select table).
 */
export function batchActions(statuses: RequestStatus[]): BatchAction[] {
  if (statuses.length === 0) {
    return [];
  }
  const unique = new Set(statuses);
  const onlyIn = (status: RequestStatus) =>
    unique.size === 1 && unique.has(status);

  if (onlyIn("pending")) {
    return [APPROVE_ALL, DENY_ALL];
  }
  if (onlyIn("approved")) {
    return [PREPARE_ALL, MOVE_ALL_PENDING, DENY_ALL];
  }
  if (onlyIn("ready")) {
    return [DISPENSE_ALL, MOVE_ALL_APPROVED];
  }
  if (unique.size === 1) {
    // Claimed or Denied only — nothing structural is legal.
    return [];
  }

  const anyDeniable = statuses.some(
    (status) => status === "pending" || status === "approved"
  );
  return anyDeniable ? [DENY_ALL] : [];
}

/** Timestamp of the move into Claimed, used by the 24h auto-archive. */
export function claimTimeOf(item: RequestItem): string | null {
  for (let i = item.history.length - 1; i >= 0; i -= 1) {
    if (item.history[i].to === "claimed") {
      return item.history[i].at;
    }
  }
  return null;
}

/** Claimed cards leave the board after 24h but stay in the Dispensing Log. */
export function isArchivedClaimed(
  item: RequestItem,
  now: number,
  archiveHours = CLAIMED_ARCHIVE_HOURS
): boolean {
  if (item.status !== "claimed") {
    return false;
  }
  const claimedAt = claimTimeOf(item);
  if (!claimedAt) {
    return false;
  }
  return now - new Date(claimedAt).getTime() > archiveHours * 3_600_000;
}
