import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { sheetSpring } from "@/lib/motion";
import type { LowStockRow } from "../types";

/**
 * CMIS-UI-04 §3.1 — Adjust Threshold Popover
 * Inline popover anchored to the threshold cell origin.
 * Apple Design §7: spatial consistency — scales from trigger origin.
 * Apple Design §12: frosted material with materialize animation.
 * Audit log entry on save per spec.
 */
export function AdjustThresholdPopover({
  open,
  onOpenChange,
  row,
  originRect,
  onConfirm,
}: {
  onConfirm: (payload: {
    itemId: string;
    itemName: string;
    newThreshold: number;
    oldThreshold: number;
  }) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect: DOMRect | null;
  row: LowStockRow | null;
}) {
  const [threshold, setThreshold] = React.useState(0);

  React.useEffect(() => {
    if (row) {
      setThreshold(row.threshold);
    }
  }, [row]);

  const isValid = row !== null && threshold > 0 && threshold !== row.threshold;

  // Position popover near origin rect
  const popoverStyle: React.CSSProperties = React.useMemo(() => {
    if (!originRect) {
      return {};
    }
    const top = originRect.bottom + 8;
    const left = Math.min(originRect.left, window.innerWidth - 260);
    return {
      left: Math.max(8, left),
      position: "fixed" as const,
      top,
      zIndex: 60,
    };
  }, [originRect]);

  function handleSubmit() {
    if (!(row && isValid)) {
      return;
    }
    onConfirm({
      itemId: row.item.id,
      itemName: row.item.name,
      newThreshold: threshold,
      oldThreshold: row.threshold,
    });
    onOpenChange(false);
  }

  return (
    <AnimatePresence>
      {open && row ? (
        <>
          {/* Invisible backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-50"
            onClick={() => onOpenChange(false)}
          />
          {/* Popover — CMIS-UI-04 §5: backdrop-filter frosted, scaling from origin */}
          <motion.div
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
            aria-label="Adjust threshold"
            className="w-60 rounded-xl border border-border/50 bg-card/95 p-4 shadow-xl backdrop-blur-xl"
            exit={{ filter: "blur(8px)", opacity: 0, scale: 0.95 }}
            initial={{ filter: "blur(8px)", opacity: 0, scale: 0.95 }}
            role="dialog"
            style={popoverStyle}
            transition={sheetSpring}
          >
            <div className="mb-3">
              <h3 className="font-semibold text-foreground text-sm">
                Adjust Threshold
              </h3>
              <p className="mt-0.5 text-caption text-muted-foreground">
                {row.item.name}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  className="mb-1 block text-caption text-muted-foreground"
                  htmlFor="threshold-input"
                >
                  Current threshold
                </label>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  id="threshold-input"
                  min={1}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  type="number"
                  value={threshold}
                />
                <p className="mt-1 text-caption text-muted-foreground">
                  Current qty: {row.currentQty} &middot; Gap:{" "}
                  {row.gap > 0 ? `-${row.gap}` : "OK"}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  className="press-feedback rounded-md px-3 py-1.5 text-caption text-muted-foreground hover:bg-muted"
                  onClick={() => onOpenChange(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="press-feedback rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                  disabled={!isValid}
                  onClick={handleSubmit}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
