import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import * as React from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  project,
  rubberband,
  sheetSpring,
} from "@/lib/motion";
import type { InventoryItem } from "../types";
import { InventoryDetailContent } from "./inventory-detail";

export function InventoryDetailSheet({
  open,
  onOpenChange,
  item,
  originRect,
  onStockIn,
  onStockOut,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InventoryItem | null;
  originRect: DOMRect | null;
  onStockIn: () => void;
  onStockOut: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;
  const y = useMotionValue(0);
  const _opacity = useTransform(y, [0, 120], [1, 0.6]);

  // Pointer swipe to close — Apple Design §5 velocity handoff + §6 momentum projection
  const startYRef = React.useRef<number | null>(null);
  const startTimeRef = React.useRef<number>(0);
  const velocityHistoryRef = React.useRef<{ t: number; y: number }[]>([]);

  function handlePointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    startTimeRef.current = Date.now();
    velocityHistoryRef.current = [];
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (startYRef.current === null) {
      return;
    }
    const delta = e.clientY - startYRef.current;
    if (delta < 0) {
      // resist upward overscroll — Apple §9 rubber-banding
      y.set(rubberband(delta, 400));
      return;
    }
    // track position + timestamp history for velocity at release
    velocityHistoryRef.current.push({ t: Date.now(), y: delta });
    if (velocityHistoryRef.current.length > 8) {
      velocityHistoryRef.current.shift();
    }
    y.set(delta);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (startYRef.current === null) {
      return;
    }
    const delta = e.clientY - startYRef.current;
    startYRef.current = null;

    // Apple §5: compute release velocity from history
    const history = velocityHistoryRef.current;
    let releaseVelocity = 0;
    if (history.length >= 2) {
      const last = history.at(-1);
      const prev = history[Math.max(0, history.length - 3)];
      if (last && prev) {
        const dt = Math.max(1, last.t - prev.t);
        releaseVelocity = ((last.y - prev.y) / dt) * 1000;
      } // px/s
    }

    // Apple §6: project momentum to decide close target
    const projectedEndpoint = delta + project(releaseVelocity);
    const CLOSE_THRESHOLD = 80;

    // Velocity-driven or position-driven close decision
    const shouldClose =
      projectedEndpoint > CLOSE_THRESHOLD || releaseVelocity > 200;

    if (shouldClose) {
      onOpenChange(false);
    }
    y.set(0);
  }

  React.useEffect(() => {
    if (!open) {
      y.set(0);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, y]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-40 bg-black/32"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          />
          <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
            <motion.div
              animate="animate"
              aria-label={item ? item.name : "Inventory detail"}
              aria-modal="true"
              className="surface-frosted flex max-h-[78vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial="initial"
              role="dialog"
              style={{
                transformOrigin: "center center",
                willChange: reduceMotion
                  ? undefined
                  : "transform, opacity, filter",
                y: reduceMotion ? 0 : y,
              }}
              transition={reduceMotion ? { duration: 0 } : sheetSpring}
              variants={variants}
            >
              {/* drag handle */}
              <div
                className="flex shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <div aria-hidden className="h-1 w-9 rounded-full bg-border" />
              </div>
              <div className="min-h-0 flex-1 overflow-hidden bg-card">
                <InventoryDetailContent
                  autoFocus
                  item={item}
                  onClose={() => onOpenChange(false)}
                  onStockIn={onStockIn}
                  onStockOut={onStockOut}
                />
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
