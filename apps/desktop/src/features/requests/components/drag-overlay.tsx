import { cn } from "@cmis/ui/lib/utils";
import { type MotionValue, motion } from "motion/react";
import type * as React from "react";
import { createPortal } from "react-dom";

/** Only the pointer handlers travel with the overlay — nothing else is needed. */
export type OverlayHandlers = Pick<
  React.HTMLAttributes<HTMLElement>,
  "onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
>;

import type {
  DragOverlay as DragOverlayState,
  DragPhase,
} from "../hooks/use-card-drag/types";
import { RequestCardContent } from "./request-card";

/**
 * CMIS-UI-05 §4.1 — the card in flight.
 *
 * Rendered in a portal so it escapes the column's `overflow-y` clipping, and
 * positioned by the engine's motion values, which the pointer writes 1:1 and
 * the settle spring animates. That shared value is what makes the card
 * re-grabbable mid-settle (Apple §3).
 *
 * No rotation — the card follows the pointer 1:1 without tilt for a fully
 * smooth drag. Scale lift is also removed to avoid a pop at lift.
 *
 * The portal box is exactly the card's own box and never more. It keeps pointer
 * events only while the gesture can continue (a live drag, or the re-grabbable
 * settle of a committed move, D19); the moment a refused or cancelled card is
 * released the phase is `idle` and the overlay stops swallowing clicks, so the
 * card underneath is interactive again while its spring is still running (F1).
 *
 * The landing is a fade, not a pop: when a committed move lands, the board has
 * already rendered the real card in the slot underneath, so the lifted overlay
 * simply dissolves onto it (`releasing`) — the shadow and translucency melt
 * away instead of the card appearing to change size or flash (CMIS-UI-05 §4.1).
 */
export function DragOverlayLayer({
  dragX,
  dragY,
  handlers,
  now,
  overlay,
  phase,
  releasing,
}: {
  dragX: MotionValue<number>;
  dragY: MotionValue<number>;
  handlers: OverlayHandlers;
  now: number;
  overlay: DragOverlayState;
  phase: DragPhase;
  /** The move has committed: dissolve onto the card already in the slot. */
  releasing: boolean;
}) {
  const { originRect } = overlay;

  return createPortal(
    <motion.div
      aria-hidden
      className={cn(
        "fixed z-[70] touch-none select-none transition-opacity duration-150 ease-out",
        releasing ? "opacity-0" : "opacity-100"
      )}
      data-drag-overlay
      style={{
        height: originRect.height,
        left: originRect.left,
        pointerEvents: phase === "idle" ? "none" : "auto",
        rotate: 0,
        scale: 1,
        top: originRect.top,
        width: originRect.width,
        willChange: "transform",
        x: dragX,
        y: dragY,
      }}
      {...handlers}
    >
      <div className="kanban-card h-full rounded-xl border border-ring/60 bg-card opacity-[0.82] shadow-2xl">
        <RequestCardContent item={overlay.item} lifted now={now} />
      </div>
    </motion.div>,
    document.body
  );
}
