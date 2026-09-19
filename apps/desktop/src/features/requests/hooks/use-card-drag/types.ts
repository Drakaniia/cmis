import type { RequestItem, RequestStatus } from "../../types";

/** Where a card would land if the pointer were released now. */
export interface DropTarget {
  index: number;
  status: RequestStatus;
  valid: boolean;
}

export interface Rect {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * The gesture's phase, and the single source of board-level styling (D18).
 *
 * `idle` means "nothing is in the air that can style the board": it is reached
 * the moment a refused or cancelled drop is released — before its spring has
 * finished — so no lane stays faded and no button stays unclickable while the
 * card animates home. `settling` is the flight of a committed move, which is
 * still re-grabbable (D19).
 */
export type DragPhase = "idle" | "dragging" | "settling";

/** Why a gesture ended without a move, so the board can say so. */
export type DragCancelReason =
  | "cancel"
  | "click-away"
  | "escape"
  | "focus-lost"
  | "pointer-lost"
  | "visibility"
  | "watchdog";

/** What the board renders while a card is lifted or settling. */
export interface DragOverlay {
  fromStatus: RequestStatus;
  item: RequestItem;
  originRect: Rect;
  target: DropTarget | null;
}

export interface Session {
  baseX: number;
  baseY: number;
  cardId: string;
  element: HTMLElement;
  fromStatus: RequestStatus;
  history: { t: number; x: number; y: number }[];
  item: RequestItem;
  /**
   * True while a legal slot is pulling the card: tracking stops and the magnet
   * owns the position, so the cursor and the slot never fight over it (F1).
   */
  magnetized: boolean;
  originRect: Rect;
  pointerId: number;
  pointerX: number;
  pointerY: number;
  started: boolean;
  startPoint: { x: number; y: number };
  target: DropTarget | null;
}
