import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { sheetSpring } from "@/lib/motion";
import type { LowStockRow } from "../types";

/**
 * CMIS-UI-04 §3.1 — Reorder Sheet
 * Opens from reorder button origin. Prefills item, supplier, suggested qty.
 * Suggested qty = max(threshold*2 - current, threshold).
 * Apple Design §7: spatial consistency — sheet enters from bottom, exits to bottom.
 * Apple Design §12: frosted backdrop with materialize animation.
 */
export function ReorderSheet({
  open,
  onOpenChange,
  row,
  originRect,
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
  const [qty, setQty] = React.useState(0);
  const [supplier, setSupplier] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Sync defaults when row changes
  React.useEffect(() => {
    if (row) {
      setQty(row.suggestedQty);
      setSupplier(row.item.supplier);
      setNotes("");
    }
  }, [row]);

  const gap = row ? row.threshold - row.currentQty : 0;
  const isValid = qty >= gap && supplier.trim().length > 0;

  function handleSubmit() {
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
  }

  return (
    <AnimatePresence>
      {open && row ? (
        <>
          {/* Scrim — Apple Design §12: dim to focus */}
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            transition={sheetSpring}
          />
          {/* Sheet — CMIS-UI-04 §5: from bottom, blur+scale */}
          <motion.div
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
            aria-label="Reorder"
            className="fixed inset-0 z-50 mx-auto flex max-w-lg items-center justify-center p-6"
            exit={{ filter: "blur(8px)", opacity: 0, scale: 0.98, y: 20 }}
            initial={{ filter: "blur(8px)", opacity: 0, scale: 0.98, y: 20 }}
            role="dialog"
            transition={sheetSpring}
          >
            <div className="w-full max-w-lg rounded-2xl border border-border/50 bg-card/95 p-6 shadow-xl backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold text-foreground text-lg tracking-tight">
                  Reorder
                </h2>
                <button
                  aria-label="Close"
                  className="press-feedback rounded p-1 text-muted-foreground hover:bg-muted"
                  onClick={() => onOpenChange(false)}
                  type="button"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* Item name */}
                <div>
                  <label className="mb-1 block text-caption text-muted-foreground">
                    Item
                  </label>
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
                    onChange={(e) => setSupplier(e.target.value)}
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
                    onChange={(e) => setQty(Number(e.target.value))}
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
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    value={notes}
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    className="press-feedback"
                    onClick={() => onOpenChange(false)}
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
                  >
                    Create Reorder
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
