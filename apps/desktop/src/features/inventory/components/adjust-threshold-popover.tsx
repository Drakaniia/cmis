import { Button } from "@cmis/ui/components/button";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { AnimatePresence, motion } from "motion/react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  const [threshold, setThreshold] = useState(0);

  useEffect(() => {
    if (row) {
      setThreshold(row.threshold);
    }
  }, [row]);

  const isValid = row !== null && threshold > 0 && threshold !== row.threshold;

  // Position popover near origin rect
  const popoverStyle: CSSProperties = useMemo(() => {
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

  return (
    <AnimatePresence>
      {open && row ? (
        <>
          {/* Invisible backdrop to close on outside click */}
          <button
            aria-label="Dismiss threshold editor"
            className="fixed inset-0 z-50 cursor-default"
            onClick={handleClose}
            type="button"
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
                {row.item.displayName}
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

              {/* §8 Button hierarchy: Cancel (ghost), Save (confirm/primary) */}
              <div className="flex justify-end gap-2">
                <Button
                  className="press-feedback"
                  onClick={handleClose}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  className="press-feedback"
                  disabled={!isValid}
                  onClick={handleSubmit}
                  size="sm"
                  variant="confirm"
                >
                  Save
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
