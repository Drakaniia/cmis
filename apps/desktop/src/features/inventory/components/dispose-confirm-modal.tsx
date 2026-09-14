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
import { expiryLabel } from "../mock-expiry";
import type { DisposeReason, ExpiryRow } from "../types";

/**
 * CMIS-UI-03 §3 — Dispose Confirm Modal
 * Modal confirm: "Dispose [Qty] × [Item] batch [Batch]?"
 * + reason (Expired/Damaged/Other) + quantity must match row's qty.
 *
 * Apple Design:
 * §12 — Glass material with backdrop blur, bright top edge catches light.
 * §8  — Button hierarchy: Cancel (ghost), Confirm Dispose (destructive).
 * §1  — All buttons have instant press feedback (scale 0.97).
 * §7  — Spatial consistency: centered modal, origin from dispose button.
 * §14 — Reduced motion: cross-fade only, no spring/blur/scale.
 * §15 — Tight tracking on heading, caption tracking on metadata.
 */

export function DisposeConfirmModal({
  open,
  onOpenChange,
  row,
  originRect: _originRect,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: ExpiryRow | null;
  originRect: DOMRect | null;
  onConfirm: (payload: {
    itemId: string;
    batch: string;
    reason: DisposeReason;
    reasonOther: string;
    qty: number;
  }) => void;
}) {
  const [reason, setReason] = useState<DisposeReason>("Expired");
  const [reasonOther, setReasonOther] = useState("");
  const [qty, setQty] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
    if (open && row) {
      setReason("Expired");
      setReasonOther("");
      setQty(String(row.batch.qty));
      setAttempted(false);
    }
  }, [open, row]);

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

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleQtyChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQty(event.target.value),
    []
  );

  const handleReasonChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      setReason(event.target.value as DisposeReason),
    []
  );

  const handleReasonOtherChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      setReasonOther(event.target.value),
    []
  );

  const handleConfirm = useCallback(() => {
    if (!row) {
      setAttempted(true);
      return;
    }
    const validQtyNow = Number(qty) === row.batch.qty;
    const validNow =
      validQtyNow && (reason !== "Other" || reasonOther.trim().length > 0);
    if (!validNow) {
      setAttempted(true);
      return;
    }
    onConfirm({
      batch: row.batch.batch,
      itemId: row.item.id,
      qty: row.batch.qty,
      reason,
      reasonOther: reasonOther.trim(),
    });
    onOpenChange(false);
  }, [onConfirm, onOpenChange, qty, reason, reasonOther, row]);

  if (!(open && row)) {
    return null;
  }

  const validQty = Number(qty) === row.batch.qty;

  const transformOrigin = "center center";

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* §12 Scrim — dim to focus */}
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-50 bg-black/32 backdrop-blur-[2px]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-label="Confirm dispose"
              aria-modal="true"
              className={cn(
                "flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl",
                /* §12 Glass material */
                "border border-border/40 bg-card/80 shadow-xl backdrop-blur-2xl"
              )}
              exit="exit"
              initial="initial"
              role="dialog"
              style={{
                transformOrigin,
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
                  Dispose Batch
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
              <div className="space-y-3 p-4">
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium text-destructive">
                    Dispose {row.batch.qty} × {row.item.name}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    Batch {row.batch.batch} — exp{" "}
                    {expiryLabel(row.batch.expiry)}
                  </p>
                </div>

                {/* Quantity — must match row qty */}
                <label className="block text-caption text-foreground">
                  Quantity (must match batch qty: {row.batch.qty})
                  <input
                    className={cn(
                      "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                      attempted && !validQty && "border-destructive"
                    )}
                    max={row.batch.qty}
                    min={1}
                    onChange={handleQtyChange}
                    type="number"
                    value={qty}
                  />
                  {attempted && !validQty ? (
                    <span className="mt-1 block text-destructive">
                      Quantity must equal {row.batch.qty}.
                    </span>
                  ) : null}
                </label>

                {/* Reason */}
                <label className="block text-caption text-foreground">
                  Reason
                  <select
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    onChange={handleReasonChange}
                    value={reason}
                  >
                    <option value="Expired">Expired</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                {reason === "Other" ? (
                  <label className="block text-caption text-foreground">
                    Specify reason
                    <textarea
                      className={cn(
                        "mt-1 min-h-[64px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                        attempted && !reasonOther.trim() && "border-destructive"
                      )}
                      onChange={handleReasonOtherChange}
                      placeholder="Describe reason…"
                      value={reasonOther}
                    />
                  </label>
                ) : null}
              </div>

              {/* §8 Footer — Cancel (ghost), Confirm Dispose (destructive) */}
              <div className="flex items-center justify-end gap-2 border-border/30 border-t px-4 py-3">
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
                  onClick={handleConfirm}
                  size="sm"
                  variant="destructive"
                >
                  Confirm Dispose
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
