import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { materializeEnter, sheetSpring } from "@/lib/motion";
import type { DenyReason } from "../types";
import { DENY_REASONS } from "../types";

/**
 * CMIS-UI-05 §4.4 / §7 — Deny requires a reason and writes an audit entry, so
 * it is one of the few genuinely destructive, irreversible actions that earns a
 * confirmation (Apple §16 Agency: use these sparingly, but use them here).
 */
export function DenyRequestModal({
  count,
  onConfirm,
  onOpenChange,
  open,
  originRect: _originRect,
  requestLabel,
}: {
  count: number;
  onConfirm: (reason: DenyReason, note: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect: DOMRect | null;
  requestLabel: string;
}) {
  const [reason, setReason] = useState<DenyReason>("Out of Stock");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) {
      setReason("Out of Stock");
      setNote("");
      setAttempted(false);
    }
  }, [open]);

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

  const noteRequired = reason === "Other";
  const valid = !noteRequired || note.trim().length > 0;

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleReasonChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setReason(event.target.value as DenyReason);
    },
    []
  );

  const handleNoteChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setNote(event.target.value);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (!valid) {
      setAttempted(true);
      return;
    }
    onConfirm(reason, note.trim());
    onOpenChange(false);
  }, [valid, onConfirm, reason, note, onOpenChange]);

  const transformOrigin = "center center";

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-[60] bg-black/32"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={{ duration: 0.18 }}
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-label={`Deny ${count === 1 ? "request" : `${count} requests`}`}
              aria-modal="true"
              className="surface-frosted flex w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              role="dialog"
              style={{
                transformOrigin,
                willChange: "transform, opacity, filter",
              }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              <div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
                <h2 className="font-semibold text-foreground text-sm">
                  Deny {count === 1 ? "Request" : `${count} Requests`}
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

              <div className="space-y-3 p-4">
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                  <p className="font-medium text-destructive text-sm">
                    {count === 1
                      ? `Deny ${requestLabel}`
                      : `Deny ${count} requests`}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {requestLabel} · the viewer is notified and the decision is
                    written to the audit log.
                  </p>
                </div>

                <label className="block text-caption text-foreground">
                  Reason
                  <select
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    onChange={handleReasonChange}
                    value={reason}
                  >
                    {DENY_REASONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-caption text-foreground">
                  Note {noteRequired ? "" : "(optional)"}
                  <textarea
                    aria-required={noteRequired}
                    className={cn(
                      "mt-1 min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                      attempted && !valid && "border-destructive"
                    )}
                    onChange={handleNoteChange}
                    placeholder="Context for the audit log…"
                    value={note}
                  />
                  {attempted && !valid ? (
                    <span className="mt-1 block text-destructive">
                      Add a note explaining the reason.
                    </span>
                  ) : null}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-border/50 border-t px-4 py-3">
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
                  Deny {count === 1 ? "Request" : `${count} Requests`}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
