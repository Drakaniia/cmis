import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { Button } from "@cmis/ui/components/button";
import { addDaysIso, todayIso } from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";
import { expiryLabel } from "../domain/expiry";
import type { ExpiryRow } from "../types";

/**
 * CMIS-UI-03 §3 — Extend Expiry Modal
 * Modal: new expiry DatePicker + note required.
 * Audit log: "Expiry extended by [Staff] from [old] to [new]"
 * Dim scrim + scale 0.98→1 spring, anchored to row's extend button.
 */

export function ExtendExpiryModal({
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
    newExpiry: string;
    note: string;
  }) => void;
}) {
  const [newExpiry, setNewExpiry] = useState("");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
    if (open && row) {
      // Default to 90 days from today
      setNewExpiry(addDaysIso(todayIso(), 90));
      setNote("");
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

  const valid = newExpiry && note.trim().length > 0;

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleNoteChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setNote(event.target.value);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (!(valid && row)) {
      setAttempted(true);
      return;
    }
    onConfirm({
      batch: row.batch.batch,
      itemId: row.item.id,
      newExpiry,
      note: note.trim(),
    });
    onOpenChange(false);
  }, [valid, row, onConfirm, newExpiry, note, onOpenChange]);

  if (!(open && row)) {
    return null;
  }

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
              aria-label="Extend expiry"
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
                  Extend Expiry
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
                <div className="rounded-md border border-[var(--warning)]/20 bg-[var(--warning)]/5 p-3 text-sm">
                  <p className="font-medium">
                    {row.item.displayName} — batch {row.batch.batch}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    Current expiry: {expiryLabel(row.batch.expiry)}
                  </p>
                </div>

                {/* New expiry date */}
                <label className="block text-caption text-foreground">
                  New expiry date
                  <AppleDatePicker
                    className="mt-1 h-9"
                    min={todayIso()}
                    onChange={setNewExpiry}
                    placeholder="Select expiry date"
                    value={newExpiry}
                  />
                </label>

                {/* Note — required per spec */}
                <label className="block text-caption text-foreground">
                  Audit note (required)
                  <textarea
                    className={cn(
                      "mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                      attempted && !note.trim() && "border-destructive"
                    )}
                    onChange={handleNoteChange}
                    placeholder="Reason for extension…"
                    value={note}
                  />
                  {attempted && !note.trim() ? (
                    <span className="mt-1 block text-destructive">
                      Audit note is required.
                    </span>
                  ) : null}
                </label>
              </div>

              {/* Footer */}
              {/* §8 Footer — Cancel (ghost, tertiary), Extend Expiry (confirm, primary) */}
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
                  variant="confirm"
                >
                  Extend Expiry
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
