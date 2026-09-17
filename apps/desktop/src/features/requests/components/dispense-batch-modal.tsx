import { Button } from "@cmis/ui/components/button";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect } from "react";

import { materializeEnter, sheetSpring } from "@/lib/motion";
import { useDispensePlans } from "../hooks/use-dispense";
import { type RequestItem, requestorLabel } from "../types";

/**
 * CMIS-UI-05 §4.4 / F9 — bulk dispense.
 *
 * The list is the point: staff must see, *before* confirming, exactly which
 * requests will leave the board and which cannot. Because a hand-over is allowed
 * to be partial (D4), a request larger than the shelf is no longer refused — it
 * is listed as partial, with the amount that stays behind. A request with no
 * matching item, or nothing dispensable on hand, is still named as blocked
 * rather than silently dropped.
 *
 * The plan comes from the same read-only service the single confirmation uses,
 * so the two surfaces cannot disagree.
 */
export function DispenseBatchModal({
  items,
  onConfirm,
  onOpenChange,
  open,
}: {
  items: RequestItem[];
  onConfirm: (items: RequestItem[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const plans = useDispensePlans(items, open);

  const rows = items.map((item, index) => ({
    item,
    plan: plans[index],
  }));
  const ready = rows.filter((row) => row.plan?.ok);
  const blocked = rows.filter((row) => row.plan && !row.plan.ok);

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
    if (ready.length === 0) {
      return;
    }
    onConfirm(ready.map((row) => row.item));
    onOpenChange(false);
  }, [onConfirm, onOpenChange, ready]);

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
              aria-label="Dispense selected requests"
              aria-modal="true"
              className="surface-frosted flex max-h-[86vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              role="dialog"
              style={{ willChange: "transform, opacity, filter" }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-4 py-3">
                <h2 className="font-semibold text-foreground text-sm">
                  Dispense {ready.length} of {items.length} selected
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
                {ready.length > 0 ? (
                  <section aria-labelledby="batch-ready-heading">
                    <h3
                      className="mb-1.5 flex items-center gap-1.5 font-medium text-xs"
                      id="batch-ready-heading"
                    >
                      <CheckCircle2
                        aria-hidden
                        className="size-3.5 text-[var(--success)]"
                      />
                      Will be dispensed
                    </h3>
                    <ul className="space-y-1">
                      {ready.map(({ item, plan }) => {
                        if (!plan?.ok) {
                          return null;
                        }
                        const batches = plan.plan.batches
                          .map((take) => take.batch)
                          .join(", ");
                        return (
                          <li
                            className="rounded-md border border-border/60 bg-card px-2.5 py-2"
                            key={item.id}
                          >
                            <p className="truncate font-medium text-xs">
                              {item.medicine}
                            </p>
                            <p className="text-caption text-muted-foreground">
                              {requestorLabel(item)} · {plan.plan.take}{" "}
                              {item.unit} · batch {batches}
                              {plan.plan.remaining > 0
                                ? ` · ${plan.plan.remaining} stays in Ready to Claim`
                                : ""}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}

                {blocked.length > 0 ? (
                  <section aria-labelledby="batch-blocked-heading">
                    <h3
                      className="mb-1.5 flex items-center gap-1.5 font-medium text-xs"
                      id="batch-blocked-heading"
                    >
                      <AlertTriangle
                        aria-hidden
                        className="size-3.5 text-destructive"
                      />
                      Cannot be dispensed now
                    </h3>
                    <ul className="space-y-1" role="alert">
                      {blocked.map(({ item, plan }) => (
                        <li
                          className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2"
                          key={item.id}
                        >
                          <p className="truncate font-medium text-xs">
                            {item.medicine}
                          </p>
                          <p className="text-caption text-muted-foreground">
                            {requestorLabel(item)} —{" "}
                            {plan && !plan.ok ? plan.error.message : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-caption text-muted-foreground">
                      These stay in Ready to Claim. Stock in, or deny them
                      individually.
                    </p>
                  </section>
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
                  disabled={ready.length === 0}
                  onClick={handleConfirm}
                  size="sm"
                >
                  {ready.length === items.length
                    ? `Dispense all ${ready.length}`
                    : `Dispense ${ready.length}`}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
