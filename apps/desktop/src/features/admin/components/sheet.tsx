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

/**
 * CMIS-UI-09 §1.2 / §2 — frosted detail sheet for narrow widths.
 *
 * Apple §5 velocity handoff + §6 momentum projection drive the swipe-to-close,
 * so the sheet can be grabbed and reversed mid-flight (00 §3 Interruptibility).
 * No dim scrim: a detail sheet is parallel context, not a focused modal task.
 */
export function AdminSheet({
  open,
  onOpenChange,
  label,
  originRect,
  children,
}: {
  children: React.ReactNode;
  label: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect?: DOMRect | null;
}) {
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 120], [1, 0.6]);
  const startYRef = React.useRef<number | null>(null);
  const historyRef = React.useRef<{ t: number; y: number }[]>([]);

  function handlePointerDown(event: React.PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    startYRef.current = event.clientY;
    historyRef.current = [];
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (startYRef.current === null) {
      return;
    }
    const delta = event.clientY - startYRef.current;
    if (delta < 0) {
      // Resist upward overscroll — Apple §9 rubber-banding.
      y.set(rubberband(delta, 400));
      return;
    }
    historyRef.current.push({ t: Date.now(), y: delta });
    if (historyRef.current.length > 8) {
      historyRef.current.shift();
    }
    y.set(delta);
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (startYRef.current === null) {
      return;
    }
    const delta = event.clientY - startYRef.current;
    startYRef.current = null;

    const history = historyRef.current;
    let releaseVelocity = 0;
    if (history.length >= 2) {
      const last = history.at(-1);
      const prev = history[Math.max(0, history.length - 3)];
      if (last && prev) {
        const dt = Math.max(1, last.t - prev.t);
        releaseVelocity = ((last.y - prev.y) / dt) * 1000;
      }
    }

    // Apple §6: decide from where the gesture is going, not where it stopped.
    const projected = delta + project(releaseVelocity);
    if (projected > 80 || releaseVelocity > 200) {
      onOpenChange(false);
    }
    y.set(0);
  }

  React.useEffect(() => {
    if (!open) {
      y.set(0);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, y]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
          <motion.div
            animate="animate"
            aria-label={label}
            aria-modal="true"
            className="surface-frosted flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
            exit="exit"
            initial="initial"
            role="dialog"
            style={{
              opacity: reduceMotion ? 1 : opacity,
              transformOrigin: "center center",
              willChange: reduceMotion
                ? undefined
                : "transform, opacity, filter",
              y: reduceMotion ? 0 : y,
            }}
            transition={reduceMotion ? { duration: 0 } : sheetSpring}
            variants={variants}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div aria-hidden className="h-1 w-9 rounded-full bg-border" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-card">
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
