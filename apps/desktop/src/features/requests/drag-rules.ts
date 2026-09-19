/**
 * CMIS-UI-05 §F2 — the drag rules.
 *
 * One source of truth for "can this card go here, and if not, what do we say".
 * The board (drop highlighting, illegal-lane fade, cursor), the drag engine
 * (release resolution) and the request page (toast + live region) all read from
 * here, so a forbidden transition reads the same wherever it is attempted and
 * the refusal copy can never drift from the transition table.
 *
 * `canMove` in `transitions.ts` stays the authority: this module only adds the
 * same-lane reorder rule (always legal) and the words for a refusal.
 */

import { canMove, isArchivedClaimed } from "./transitions";
import type { RequestItem, RequestStatus } from "./types";
import { statusMetaOf } from "./types";

export type LaneEligibility = "legal" | "illegal";

/** Reordering inside a lane is always legal; the guards govern between lanes. */
export function laneEligibility(
  from: RequestStatus,
  to: RequestStatus
): LaneEligibility {
  if (from === to) {
    return "legal";
  }
  return canMove(from, to) ? "legal" : "illegal";
}

/** Every lane a card in `from` may not be dropped into. */
export function illegalLanesFor(
  from: RequestStatus,
  lanes: readonly RequestStatus[]
): RequestStatus[] {
  return lanes.filter((status) => laneEligibility(from, status) === "illegal");
}

/**
 * A read-only view or a legal, adjacent, already-shipped move. Nothing else is
 * ever offered: the button re-runs the same guarded board functions, so no
 * shortcut can bypass `canMove`.
 */
export type RefusalActionId =
  | "approve"
  | "move-to-approved"
  | "prepare"
  | "reopen"
  | "view-dispensing-record";

export interface RefusalAction {
  id: RefusalActionId;
  /** Same wording the ⋯ menu uses for that move. */
  label: string;
  /** Target column for structural moves; absent for pure views. */
  to?: RequestStatus;
}

export interface Refusal {
  action?: RefusalAction;
  /** Rule-specific copy: names the rule and the legal path (D8). */
  message: string;
  /** Stable per destination lane, so repeats replace rather than stack (D10). */
  toastId: string;
}

const CLAIMED_END =
  "Claimed is the end of the flow — the hand-over and the stock movement are already recorded. Use the Dispensing Log to review it.";
const DENIED_FIRST =
  "A denied request has to go back to Pending first before it can be reconsidered.";
const HANDOVER_FROM_READY =
  "A request is handed over from Ready to Claim, so stock is deducted as the card moves.";
const READY_BACK_TO_APPROVED =
  "Ready to Claim is past the point of denial — move it back to Approved first if it must be refused.";

const VIEW_RECORD: RefusalAction = {
  id: "view-dispensing-record",
  label: "View dispensing record",
};
const REOPEN: RefusalAction = {
  id: "reopen",
  label: "Re-open → Pending",
  to: "pending",
};
const APPROVE: RefusalAction = {
  id: "approve",
  label: "Approve",
  to: "approved",
};
const PREPARE: RefusalAction = {
  id: "prepare",
  label: "Prepare → Ready to Claim",
  to: "ready",
};
const BACK_TO_APPROVED: RefusalAction = {
  id: "move-to-approved",
  label: "Move to Approved",
  to: "approved",
};

/** Toast identity is per destination lane, never per card (D10/F4). */
export function refusalToastId(to: RequestStatus): string {
  return `request-refusal-${to}`;
}

/**
 * The complete refusal catalogue, derived from `ALLOWED_TRANSITIONS`:
 * every pair that is neither the same lane nor a legal move has copy here.
 */
export function refusalFor(
  from: RequestStatus,
  to: RequestStatus
): Refusal | null {
  if (laneEligibility(from, to) === "legal") {
    return null;
  }
  const toastId = refusalToastId(to);
  switch (from) {
    case "claimed":
      return { action: VIEW_RECORD, message: CLAIMED_END, toastId };
    case "denied":
      return { action: REOPEN, message: DENIED_FIRST, toastId };
    case "pending":
      return { action: APPROVE, message: HANDOVER_FROM_READY, toastId };
    case "approved":
      return { action: PREPARE, message: HANDOVER_FROM_READY, toastId };
    default:
      return {
        action: BACK_TO_APPROVED,
        message: READY_BACK_TO_APPROVED,
        toastId,
      };
  }
}

/** "Cannot move to X from Y. <rule>" — the same sentence the toast carries. */
export function refusalAnnouncement(
  from: RequestStatus,
  to: RequestStatus,
  refusal: Refusal
): string {
  return `Cannot move to ${statusMetaOf(to).label} from ${statusMetaOf(from).label}. ${refusal.message}`;
}

/** Alt+←/→ — the nearest column in a direction, legal or not. */
export function columnInDirection(
  from: RequestStatus,
  direction: -1 | 1,
  order: readonly RequestStatus[]
): RequestStatus | null {
  const origin = order.indexOf(from);
  if (origin === -1) {
    return null;
  }
  return order[origin + direction] ?? null;
}

/**
 * 0-based positions within a lane, in the order given. `0` is the top.
 * Order is per lane only — the board still renders lanes in `REQUEST_COLUMNS`
 * order (F8.5).
 */
export function resequence<T extends { id: string }>(
  laneItems: readonly T[]
): { id: string; position: number }[] {
  return laneItems.map((item, index) => ({ id: item.id, position: index }));
}

/**
 * The archive predicate for the board: an explicit `archived_at` marker wins,
 * and the derived 24h rule stays as the safety net (F9.7). Both mechanisms hide;
 * only the explicit marker writes.
 */
export function hiddenFromBoard(item: RequestItem, now: number): boolean {
  if (item.archivedAt) {
    return true;
  }
  return isArchivedClaimed(item, now);
}
