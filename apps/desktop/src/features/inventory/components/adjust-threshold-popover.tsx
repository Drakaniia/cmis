import { Button } from "@cmis/ui/components/button";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";
import type { LowStockRow } from "../types";

/**
 * CMIS-UI-04 §3.1 — Adjust Threshold Modal
 * Centered modal (was inline popover). Apple Design §7 + §12: frosted material
 * with materialize animation, centered with scrim like ReorderSheet/StockDetailModal.
 * Audit log entry on save per spec.
 */
export function AdjustThresholdPopover({
  open,
  onOpenChange,
  row,
  originRect: _originRect,
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
  const [threshold, setThreshold] = useState(0);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
    if (row) {
      setThreshold(row.threshold);
    }
  }, [row]);

  const isValid = row !== null && threshold > 0 && threshold !== row.threshold;

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleThresholdChange = useCallback((next: number | "") => {
    setThreshold(next === "" ? 0 : next);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!(row && isValid)) {
      return;
    }
    onConfirm({
      itemId: row.item.id,
      itemName: row.item.displayName,
      newThreshold: threshold,
      oldThreshold: row.threshold,
    });
    onOpenChange(false);
  }, [isValid, onConfirm, onOpenChange, row, threshold]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && row ? (
        <>
          {/* §12 Scrim — dim to focus */}
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-40 bg-black/32 backdrop-blur-[2px]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            onClick={handleClose}
          >
            <motion.div
              animate="animate"
              aria-label="Adjust threshold"
              aria-modal="true"
              className={cn(
                "flex w-full max-w-sm flex-col overflow-hidden rounded-2xl",
                "border border-border/40 bg-card/80 shadow-xl backdrop-blur-2xl"
              )}
              exit="exit"
              initial="initial"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              style={{
                transformOrigin: "center center",
                willChange: reduceMotion
                  ? undefined
                  : "transform, opacity, filter",
              }}
              transition={reduceMotion ? { duration: 0 } : sheetSpring}
              variants={variants}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-border/30 border-b px-4 py-3">
                <div>
                  <h3
                    className="font-semibold text-foreground text-sm"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    Adjust Threshold
                  </h3>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {row.item.displayName}
                  </p>
                </div>
                <Button
                  aria-label="Close"
                  className="press-feedback shrink-0"
                  onClick={handleClose}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <label
                    className="mb-1 block text-caption text-muted-foreground"
                    htmlFor="threshold-input"
                  >
                    Current threshold
                  </label>
                  <QuantityStepper
                    className="h-9"
                    id="threshold-input"
                    min={1}
                    onChange={handleThresholdChange}
                    value={threshold}
                  />
                  <p className="mt-1 text-caption text-muted-foreground">
                    Current qty: {row.currentQty} &middot; Gap:{" "}
                    {row.gap > 0 ? `-${row.gap}` : "OK"}
                  </p>
                </div>
              </div>

              {/* §8 Footer — Cancel (ghost), Save (confirm/primary) */}
              <div className="flex items-center justify-end gap-2 border-border/30 border-t px-4 py-3">
                <Button
                  className="press-feedback"
                  onClick={handleClose}
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  className="press-feedback"
                  disabled={!isValid}
                  onClick={handleSubmit}
                  variant="confirm"
                >
                  Save
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
