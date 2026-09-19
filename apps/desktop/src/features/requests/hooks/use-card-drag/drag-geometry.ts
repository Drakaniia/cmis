import { rubberband } from "@/lib/motion";

import type { DropTarget, Rect } from "./types";

/** Distance a card keeps from a lane's edge when it settles into an empty lane. */
export const EDGE_INSET = 8;

export function toRect(rect: {
  height: number;
  left: number;
  top: number;
  width: number;
}): Rect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function sameTarget(
  a: DropTarget | null,
  b: DropTarget | null
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.index === b.index && a.status === b.status && a.valid === b.valid;
}

/** Apple §9 — resist progressively past an edge instead of stopping dead. */
function resistOvershoot(
  position: number,
  lower: number,
  upper: number,
  size: number
): number {
  if (position < lower) {
    return lower + rubberband(position - lower, size);
  }
  if (position > upper) {
    return upper + rubberband(position - upper, size);
  }
  return position;
}

/** Re-map a card offset so it rubber-bands against the board's live edges. */
export function correctedOffset(
  offset: number,
  originStart: number,
  originSize: number,
  min: number,
  max: number,
  size: number
): number {
  const corrected = resistOvershoot(
    originStart + offset,
    min + EDGE_INSET,
    max - originSize - EDGE_INSET,
    size
  );
  return corrected - originStart;
}
