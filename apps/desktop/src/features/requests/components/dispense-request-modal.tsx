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

  const transformOrigin = (() => {
    if (!open || !_originRect) return "center center";
    const cx = _originRect.left + _originRect.width / 2;
    const cy = _originRect.top + _originRect.height / 2;
    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    return `${((cx / vw) * 100).toFixed(1)}% ${((cy / vh) * 100).toFixed(1)}%`;
  })();

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={{ duration: 0.22 }}
          />
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
            onClick={handleClose}
          >
            <motion.div
              animate="animate"
              aria-label={`Dispense ${request.medicine}`}
              aria-modal="true"
              className="surface-frosted flex max-h-[86vh] w-full max-w-[480px] flex-col overflow-hidden rounded-[20px] border border-white/20 shadow-[0_8px_32px_oklch(0_0_0/0.14),0_1px_4px_oklch(0_0_0/0.08),inset_0_1px_0_oklch(1_0_0/0.6)] dark:border-white/10"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              style={{
                transformOrigin,
                willChange: "transform, opacity, filter",
              }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              <div className="flex shrink-0 items-center justify-between border-border/40 border-b bg-card/40 px-4 py-3 backdrop-blur-[8px]">
                <h2 className="font-semibold text-[14px] tracking-[-0.01em] text-foreground">
                  Dispense to {requestorLabel(request)}
                </h2>
                <Button
                  aria-label="Close"
                  className="press-feedback rounded-full bg-muted/80 backdrop-blur"
                  onClick={handleClose}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-gradient-to-b from-transparent to-muted/10 p-4">
                <div className="rounded-xl border border-border/40 bg-card/70 p-3.5 shadow-sm backdrop-blur-sm">
                  <p className="font-semibold text-[13px] tracking-[-0.01em] text-foreground">
                    {request.medicine}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] tracking-[0.02em] text-muted-foreground tabular-nums">
                    {request.id} · {request.qty} {request.unit}
                  </p>
                </div>

                {planQuery.isPending ? (
                  <p className="rounded-xl border border-border/40 border-dashed bg-card/40 px-3 py-6 text-center text-[12px] tracking-[0.01em] text-muted-foreground">
                    Checking what is on the shelf…
                  </p>
                ) : null}

                {blocked ? (
                  <div
                    className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 p-3.5"
                    role="alert"
                  >
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                    />
                    <div>
                      <p className="font-semibold text-[13px] tracking-[-0.01em] text-destructive">
                        Cannot be dispensed now
                      </p>
                      <p className="mt-1 text-[12px] leading-[1.5] tracking-[0.01em] text-muted-foreground">
                        {blocked.message}
                      </p>
                    </div>
                  </div>
                ) : null}

                {plan?.ok ? (
                  <>
                    <section className="space-y-2 rounded-xl border border-border/40 bg-card/50 p-3 backdrop-blur-sm">
                      <h3 className="font-semibold text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
                        Will come off the shelf — earliest expiry first
                      </h3>
                      <ul className="space-y-2">
                        {plan.plan.batches.map((take) => (
                          <li
                            className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-card px-3 py-2.5 shadow-sm"
                            key={take.batch}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-[12px] tracking-[-0.01em] text-foreground tabular-nums">
                                {take.batch}
                              </span>
                              <span className="block text-[11px] tracking-[0.01em] text-muted-foreground">
                                exp {expiryLabel(take.expiry)}
                              </span>
                            </span>
                            <span className="shrink-0 rounded-full bg-foreground px-2.5 py-1 font-semibold text-[11px] tracking-[0.02em] text-background tabular-nums">
                              {take.qty} {request.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] tracking-[0.01em] text-muted-foreground tabular-nums">
                        {plan.plan.leftAfter} {request.unit} left on the shelf afterwards.
                      </p>
                    </section>

                    {partial ? (
                      <div
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border p-3.5",
                          "border-[var(--warning)]/25 bg-[var(--warning)]/8"
                        )}
                        role="alert"
                      >
                        <AlertTriangle
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-[var(--warning)]"
                        />
                        <div>
                          <p className="font-semibold text-[13px] tracking-[-0.01em] text-foreground">
                            Partial hand-over — {plan.plan.take} of {plan.plan.requested}{" "}
                            {request.unit}
                          </p>
                          <p className="mt-1 text-[12px] leading-[1.5] tracking-[0.01em] text-muted-foreground">
                            Only {plan.plan.take} {request.unit} can be taken now. The card stays in
                            Ready to Claim showing {plan.plan.remaining} {request.unit}.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="flex items-center gap-2 rounded-xl bg-[var(--success)]/8 px-3 py-2.5 text-[12px] tracking-[0.01em] text-muted-foreground">
                        <CheckCircle2 aria-hidden className="size-4 text-[var(--success)]" />
                        Everything requested is covered — the card moves to Claimed.
                      </p>
                    )}
                  </>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-border/40 border-t bg-card/60 px-4 py-3 backdrop-blur-[8px]">
                <Button
                  className="press-feedback rounded-full"
                  onClick={handleClose}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  className="press-feedback rounded-full shadow-[0_1px_3px_oklch(0_0_0/0.12)]"
                  disabled={!canConfirm}
                  onClick={handleConfirm}
                  size="sm"
                >
                  {partial ? "Dispense what is available" : "Confirm dispensing"}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
