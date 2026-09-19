/** Auto-scroll starts within this many pixels of an edge (§F6). */
export const EDGE_ZONE = 56;

/** Ramp ceiling for a sustained hold at the very edge. */
export const MAX_SCROLL_PX_PER_SEC = 1200;

/**
 * −1 → 0 → 1 proximity ramp across the edge zone, so a hold at the very edge
 * accelerates and a pointer just inside the zone barely moves.
 */
function edgeRamp(pointer: number, min: number, max: number): number {
  if (pointer < min + EDGE_ZONE) {
    return -Math.min(1, (min + EDGE_ZONE - pointer) / EDGE_ZONE);
  }
  if (pointer > max - EDGE_ZONE) {
    return Math.min(1, (pointer - (max - EDGE_ZONE)) / EDGE_ZONE);
  }
  return 0;
}

/**
 * Scrolls a box toward whichever edge the pointer is near, and reports the
 * delta actually applied so the caller can move its baseline by the same amount.
 * No pointer movement is required: a hold at the edge keeps scrolling, which is
 * what makes an off-screen lane reachable in one gesture (F6.4).
 */
export function scrollToEdge(
  box: HTMLElement | null | undefined,
  pointer: number,
  dt: number,
  axis: "x" | "y"
): number {
  if (!box) {
    return 0;
  }
  const rect = box.getBoundingClientRect();
  const ramp =
    axis === "x"
      ? edgeRamp(pointer, rect.left, rect.right)
      : edgeRamp(pointer, rect.top, rect.bottom);
  if (ramp === 0) {
    return 0;
  }
  const property = axis === "x" ? "scrollLeft" : "scrollTop";
  const before = box[property];
  box[property] = before + ramp * MAX_SCROLL_PX_PER_SEC * dt;
  return box[property] - before;
}
