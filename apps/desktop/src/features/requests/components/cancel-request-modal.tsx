import { Button } from "@cmis/ui/components/button";
import { AlertTriangle, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect } from "react";

import { materializeEnter, sheetSpring } from "@/lib/motion";

/**
 * F6 / D19 — cancelling a Pending request deletes it.
 *
 * There is no trash record for a request, unlike inventory deletion, so the
 * confirmation says plainly that the card and its history are destroyed. Only
 * Pending cards are offered this; Approved and Ready are cancellable through
 * Deny, which keeps the audit trail.
 */
export function CancelRequestModal({
  onConfirm,
  onOpenChange,
  open,
  requestLabel,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requestLabel: string;
}) {
  const reduceMotion = useReducedMotion();

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

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handleConfirm = useCallback(() => {
    onConfirm();
    onOpenChange(false);
  }, [onConfirm, onOpenChange]);

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
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
            onClick={handleClose}
          >
            <motion.div
              animate="animate"
              aria-labelledby="cancel-request-heading"
              aria-modal="true"
              className="surface-frosted flex w-full max-w-[420px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              style={{
                transformOrigin: "center center",
                willChange: "transform, opacity, filter",
              }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-4 py-3">
                <h2
                  className="font-semibold text-foreground text-sm"
                  id="cancel-request-heading"
                >
                  Cancel request
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

              <div className="space-y-2 p-4">
                <p className="flex items-start gap-2 text-sm">
                  <AlertTriangle
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <span>
                    {requestLabel} will be deleted — the card, its history and
                    its notes. This cannot be undone.
                  </span>
                </p>
                <p className="text-caption text-muted-foreground">
                  If the request was refused rather than withdrawn, Deny
                  instead: it keeps the record and the reason.
                </p>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-border/50 border-t px-4 py-3">
                <Button
                  className="press-feedback"
                  onClick={handleClose}
                  size="sm"
                  variant="ghost"
                >
                  Keep request
                </Button>
                <Button
                  className="press-feedback"
                  onClick={handleConfirm}
                  size="sm"
                  variant="destructive"
                >
                  Cancel request
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
