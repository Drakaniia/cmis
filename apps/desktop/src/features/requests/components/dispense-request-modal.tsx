import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect } from "react";

import { expiryLabel } from "@/features/inventory/domain/expiry";
import { materializeEnter, sheetSpring } from "@/lib/motion";
import { useDispensePlan } from "../hooks/use-dispense";
import { type RequestItem, requestorLabel } from "../types";

/**
 * CMIS-UI-05 §7 / F8 — the hand-over confirmation.
 *
 * FEFO is automatic (D7), so staff no longer pick a batch and this is where they
 * see what will actually happen: which batch(es) leave the shelf, what is left
 * afterwards, and — when the request is larger than the shelf — how much stays
 * on the card. It is shown for every hand-over, not only surprising ones (D13).
 *
 * Expired batches are excluded upstream in `stock.ts`, so the plan can never
 * offer one. The confirmation is a statement of fact, not a form: the only
 * decisions are confirm or cancel.
 */
export function DispenseRequestModal({
  onConfirm,
  onOpenChange,
  open,
  originRect: _originRect,
  request,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect: DOMRect | null;
  request: RequestItem | null;
}) {
  const reduceMotion = useReducedMotion();
  const planQuery = useDispensePlan(request, open);
  const plan = planQuery.data;

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

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleConfirm = useCallback(() => {
    if (!plan?.ok) {
      return;
    }
    onConfirm();
    onOpenChange(false);
  }, [onConfirm, onOpenChange, plan]);

  if (!request) {
    return null;
  }

  const blocked = plan && !plan.ok ? plan.error : null;
  const partial = plan?.ok ? plan.plan.remaining > 0 : false;
  const canConfirm = Boolean(plan?.ok);

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
              aria-label={`Dispense ${request.medicine}`}
              aria-modal="true"
              className="surface-frosted flex max-h-[86vh] w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
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
                <h2 className="font-semibold text-foreground text-sm">
                  Dispense to {requestorLabel(request)}
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

              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                <div className="rounded-md border border-border/60 bg-card p-3">
                  <p className="font-medium text-sm">{request.medicine}</p>
                  <p className="text-caption text-muted-foreground">
                    Request {request.id} · dispensing {request.qty}{" "}
                    {request.unit}
                  </p>
                </div>

                {planQuery.isPending ? (
                  <p className="rounded-md border border-dashed px-3 py-4 text-center text-caption text-muted-foreground">
                    Checking what is on the shelf…
                  </p>
                ) : null}

                {blocked ? (
                  <div
                    className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
                    role="alert"
                  >
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                    />
                    <div>
                      <p className="font-medium text-destructive text-sm">
                        Cannot be dispensed now
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {blocked.message}
                      </p>
                    </div>
                  </div>
                ) : null}

                {plan?.ok ? (
                  <>
                    <section className="space-y-1.5">
                      <h3 className="font-medium text-caption text-foreground">
                        Will come off the shelf — earliest expiry first
                      </h3>
                      <ul className="space-y-1">
                        {plan.plan.batches.map((take) => (
                          <li
                            className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2"
                            key={take.batch}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-xs">
                                {take.batch}
                              </span>
                              <span className="block text-caption text-muted-foreground">
                                exp {expiryLabel(take.expiry)}
                              </span>
                            </span>
                            <span className="shrink-0 font-medium text-xs tabular-nums">
                              {take.qty} {request.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-caption text-muted-foreground">
                        {plan.plan.leftAfter} {request.unit} left on the shelf
                        afterwards.
                      </p>
                    </section>

                    {partial ? (
                      <div
                        className={cn(
                          "flex items-start gap-2 rounded-md border p-3",
                          "border-[var(--warning)]/40 bg-[var(--warning)]/8"
                        )}
                        role="alert"
                      >
                        <AlertTriangle
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-[var(--warning)]"
                        />
                        <div>
                          <p className="font-medium text-sm">
                            Partial hand-over — {plan.plan.take} of{" "}
                            {plan.plan.requested} {request.unit}
                          </p>
                          <p className="text-caption text-muted-foreground">
                            Only {plan.plan.take} {request.unit} can be taken
                            now. The card stays in Ready to Claim showing{" "}
                            {plan.plan.remaining} {request.unit}.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                        <CheckCircle2
                          aria-hidden
                          className="size-3.5 text-[var(--success)]"
                        />
                        Everything requested is covered — the card moves to
                        Claimed.
                      </p>
                    )}
                  </>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-border/50 border-t px-4 py-3">
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
                  disabled={!canConfirm}
                  onClick={handleConfirm}
                  size="sm"
                >
                  {partial
                    ? "Dispense what is available"
                    : "Confirm dispensing"}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
