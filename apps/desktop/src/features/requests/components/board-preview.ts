import type { RequestColumnMeta, RequestItem, RequestStatus } from "../types";

/**
 * One lane as the board renders it. `items` is the live, renderable order;
 * `count` and `total` are the committed numbers, so a preview never makes the
 * header chip disagree with the board's own state (CMIS-UI-05 §2).
 */
export interface RequestColumnGroup {
  column: RequestColumnMeta;
  /** Committed filtered cards in this lane — held still while a drag previews. */
  count: number;
  items: RequestItem[];
  total: number;
}

/**
 * CMIS-UI-05 §4.1 — the live board layout.
 *
 * A drag does not wait for the drop to show where the card will land. The card
 * is moved — as a ghost — into its destination slot as soon as the pointer says
 * so, so the surrounding cards glide out of the way during the gesture instead
 * of jumping once it ends. The whole function is pure and derived from the
 * committed board, which is what keeps the drop itself a no-op: the committed
 * order already equals the previewed one, so nothing re-layouts afterwards.
 *
 * - same lane: the ghost slides to the new index inside that lane;
 * - another lane: the ghost leaves its origin (the space collapses) and appears
 *   at the destination index wearing the destination's status;
 * - no legal destination: the lane is left exactly as it is, so the release can
 *   spring the card home to the position it never left.
 */
export function previewGroupsFor(
  groups: RequestColumnGroup[],
  draggedId: string | null,
  targetStatus: RequestStatus | null,
  targetIndex: number | null
): RequestColumnGroup[] {
  if (draggedId === null || targetStatus === null) {
    return groups;
  }
  const origin = groups.find((group) =>
    group.items.some((item) => item.id === draggedId)
  );
  const dragged = origin?.items.find((item) => item.id === draggedId);
  if (!(origin && dragged)) {
    return groups;
  }
  const originStatus = origin.column.status;
  const crossLane = targetStatus !== originStatus;

  return groups.map((group) => {
    const { status } = group.column;
    if (status === targetStatus) {
      const without = group.items.filter((item) => item.id !== draggedId);
      const index = Math.max(
        0,
        Math.min(targetIndex ?? without.length, without.length)
      );
      // The ghost wears the destination's badge, so the card under the cursor
      // already reads where it is going rather than where it came from.
      const ghost = crossLane ? { ...dragged, status: targetStatus } : dragged;
      return {
        ...group,
        items: [...without.slice(0, index), ghost, ...without.slice(index)],
      };
    }
    if (crossLane && status === originStatus) {
      // The card is on its way out — its slot collapses behind it.
      return {
        ...group,
        items: group.items.filter((item) => item.id !== draggedId),
      };
    }
    return group;
  });
}
