import {
  type MotionValue,
  motion,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type * as React from "react";
import { createPortal } from "react-dom";

/** Only the pointer handlers travel with the overlay — nothing else is needed. */
export type OverlayHandlers = Pick<
  React.HTMLAttributes<HTMLElement>,
  "onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
>;

import type { DragOverlay as DragOverlayState } from "../hooks/use-card-drag";
import { RequestCardContent } from "./request-card";

/**
 * CMIS-UI-05 §4.1 — the card in flight.
 *
 * Rendered in a portal so it escapes the column's `overflow-y` clipping, and
 * positioned by the engine's motion values, which the pointer writes 1:1 and
 * the settle spring animates. That shared value is what makes the card
 * re-grabbable mid-settle (Apple §3).
 *
 * The ~1.5° of rotation hints at the direction of travel (Apple §8); reduced
 * motion drops the rotation and scale entirely (Apple §14).
 */
export function DragOverlayLayer({
  dragX,
  dragY,
  handlers,
  now,
  overlay,
}: {
  dragX: MotionValue<number>;
  dragY: MotionValue<number>;
  handlers: OverlayHandlers;
  now: number;
  overlay: DragOverlayState;
}) {
  const reduceMotion = useReducedMotion();
  const rotate = useTransform(dragX, (value) => {
    const hinted = 1.5 + value * 0.03;
    return Math.max(-8, Math.min(8, hinted));
  });
  const { originRect } = overlay;

  return createPortal(
    <motion.div
      aria-hidden
      className="fixed z-[70] touch-none select-none"
      style={{
        height: originRect.height,
        left: originRect.left,
        rotate: reduceMotion ? 0 : rotate,
        scale: reduceMotion ? 1 : 1.02,
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
