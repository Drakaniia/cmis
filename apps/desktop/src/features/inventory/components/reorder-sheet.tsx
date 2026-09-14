import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";
import type { LowStockRow } from "../types";

/**
 * CMIS-UI-04 §3.1 — Reorder Sheet
 * Opens from reorder button origin. Prefills item, supplier, suggested qty.
 * Suggested qty = max(threshold*2 - current, threshold).
 *
 * Apple Design:
 * §12 — Glass material with backdrop blur, bright top edge.
 * §8  — Button hierarchy: Cancel (ghost), Create Reorder (confirm/primary).
 * §1  — All buttons have instant press feedback (scale 0.97).
 * §7  — Spatial consistency: centered modal.
 * §14 — Reduced motion: cross-fade only.
 * §15 — Tight tracking on heading.
 */
export function ReorderSheet({
  open,
  onOpenChange,
  row,
  originRect: _originRect,
  onConfirm,
}: {
  onConfirm: (payload: {
    itemId: string;
    itemName: string;
    qty: number;
    supplier: string;
  }) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect: DOMRect | null;
  row: LowStockRow | null;
}) {
  const [qty, setQty] = useState(0);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  // Sync defaults when row changes
  useEffect(() => {
    if (row) {
      setQty(row.suggestedQty);
      setSupplier(row.item.supplier);
      setNotes("");
    }
  }, [row]);

  const gap = row ? row.threshold - row.currentQty : 0;
  const isValid = qty >= gap && supplier.trim().length > 0;

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSupplierChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSupplier(event.target.value);
    },
    []
  );

  const handleQtyChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQty(Number(event.target.value));
    },
    []
  );

  const handleNotesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setNotes(event.target.value);
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (!(row && isValid)) {
      return;
    }
    onConfirm({
      itemId: row.item.id,
      itemName: row.item.name,
      qty,
      supplier,
    });
    onOpenChange(false);
  }, [row, isValid, onConfirm, qty, supplier, onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-label="Reorder"
              aria-modal="true"
              className={cn(
                "flex w-full max-w-lg flex-col overflow-hidden rounded-2xl",
                /* §12 Glass material */
                "border border-border/40 bg-card/80 shadow-xl backdrop-blur-2xl"
              )}
              exit="exit"
              initial="initial"
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
              {/* §12 Header — frosted bar */}
              <div className="flex items-center justify-between border-border/30 border-b px-4 py-3">
                <h2
                  className="font-semibold text-foreground text-sm"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  Reorder
                </h2>
                <Button
                  aria-label="Close"
                  className="press-feedback"
                  onClick={handleClose}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>

              {/* Body */}
              <div className="space-y-4 p-4">
                {/* Item name */}
                <div>
                  <span className="mb-1 block text-caption text-muted-foreground">
                    Item
                  </span>
                  <p className="font-medium text-foreground text-sm">
                    {row.item.name}
                    <span className="ml-2 text-muted-foreground">
                      ({row.item.sku})
                    </span>
                  </p>
                </div>

                {/* Current stock summary */}
                <div className="flex gap-4 rounded-lg bg-muted/50 p-3">
                  <div>
                    <p className="text-caption text-muted-foreground">
                      Current
                    </p>
                    <p className="font-medium text-foreground text-sm tabular-nums">
                      {row.currentQty}
                    </p>
                  </div>
                  <div>
                    <p className="text-caption text-muted-foreground">
                      Threshold
                    </p>
                    <p className="font-medium text-foreground text-sm tabular-nums">
                      {row.threshold}
                    </p>
                  </div>
                  <div>
                    <p className="text-caption text-muted-foreground">Gap</p>
                    <p
                      className={cn(
                        "font-medium text-sm tabular-nums",
                        row.gap > 0
                          ? "text-[var(--warning)]"
                          : "text-muted-foreground"
                      )}
                    >
                      {row.gap > 0 ? `-${row.gap}` : `+${Math.abs(row.gap)}`}
                    </p>
                  </div>
                </div>

                {/* Supplier */}
                <div>
                  <label
                    className="mb-1 block text-caption text-muted-foreground"
                    htmlFor="reorder-supplier"
                  >
                    Supplier
                  </label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    id="reorder-supplier"
                    onChange={handleSupplierChange}
                    value={supplier}
                  />
                </div>

                {/* Quantity */}
                <div>
                  <label
                    className="mb-1 block text-caption text-muted-foreground"
                    htmlFor="reorder-qty"
                  >
                    Quantity
                    <span className="ml-1 text-muted-foreground">
                      (suggested: {row.suggestedQty})
                    </span>
                  </label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    id="reorder-qty"
                    min={gap > 0 ? gap : 0}
                    onChange={handleQtyChange}
                    type="number"
                    value={qty}
                  />
                  {gap > 0 && qty < gap ? (
                    <p className="mt-1 text-caption text-destructive">
                      Must order at least {gap} to reach threshold.
                    </p>
                  ) : null}
                </div>

                {/* Notes */}
                <div>
                  <label
                    className="mb-1 block text-caption text-muted-foreground"
                    htmlFor="reorder-notes"
                  >
                    Notes (optional)
                  </label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    id="reorder-notes"
                    onChange={handleNotesChange}
                    rows={2}
                    value={notes}
                  />
                </div>
              </div>

              {/* §8 Footer — Cancel (ghost), Create Reorder (confirm/primary) */}
              <div className="flex items-center justify-end gap-2 border-border/30 border-t px-4 py-3">
                <Button
                  className="press-feedback"
                  onClick={handleClose}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  className="press-feedback"
                  disabled={!isValid}
                  onClick={handleSubmit}
                  type="button"
                  variant="confirm"
                >
                  Create Reorder
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
