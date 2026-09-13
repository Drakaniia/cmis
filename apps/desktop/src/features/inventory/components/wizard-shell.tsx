import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";

export function WizardShell({
  open,
  onOpenChange,
  title,
  step,
  totalSteps,
  originRect,
  onNext,
  onBack,
  onCancel,
  nextLabel = "Next →",
  backLabel = "Back",
  canNext = true,
  canBack = true,
  children,
  direction = 1,
  dirty = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  step: number;
  totalSteps: number;
  originRect?: DOMRect | null;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  nextLabel?: string;
  backLabel?: string;
  canNext?: boolean;
  canBack?: boolean;
  children: React.ReactNode;
  direction?: 1 | -1;
  dirty?: boolean;
}) {
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  React.useEffect(() => {
    if (!open) {
      setConfirmDiscard(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dirty && !confirmDiscard) {
          setConfirmDiscard(true);
        } else {
          onOpenChange(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, dirty, confirmDiscard]);

  function handleClose() {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          {" "}
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-50 bg-black/32"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-label={title}
              aria-modal="true"
              className="surface-frosted flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
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
              {/* Header with progress */}
              <div className="flex items-center justify-between gap-2 border-border/50 border-b px-4 py-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-foreground text-sm tracking-tight">
                    {title} — Step {step} of {totalSteps}
                  </h2>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {Array.from({ length: totalSteps }).map((_, i) => {
                      const active = i + 1 === step;
                      const done = i + 1 < step;
                      return (
                        <span
                          className={cn(
                            "h-1.5 rounded-full",
                            active
                              ? "w-6 bg-primary"
                              : done
                                ? "w-4 bg-primary/60"
                                : "w-4 bg-muted"
                          )}
                          key={i}
                          style={{ transition: "width 200ms ease-out" }}
                        />
                      );
                    })}
                  </div>
                </div>
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

              {/* Body with slide per step */}
              <div className="flex-1 overflow-auto">
                <AnimatePresence custom={direction} initial={false} mode="wait">
                  <motion.div
                    animate="center"
                    className="p-4"
                    custom={direction}
                    exit="exit"
                    initial="enter"
                    key={step}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.15, ease: "easeOut" }
                    }
                    variants={{
                      center: { opacity: 1, x: 0 },
                      enter: (dir: number) => ({
                        opacity: 0,
                        x: reduceMotion ? 0 : dir * 12,
                      }),
                      exit: (dir: number) => ({
                        opacity: 0,
                        x: reduceMotion ? 0 : dir * -12,
                      }),
                    }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>

                {confirmDiscard ? (
                  <div className="mx-4 mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                    <p className="font-medium text-destructive">
                      Discard changes?
                    </p>
                    <p className="text-caption text-muted-foreground">
                      You have unsaved changes.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        onClick={() => onOpenChange(false)}
                        size="sm"
                        variant="destructive"
                      >
                        Discard
                      </Button>
                      <Button
                        onClick={() => setConfirmDiscard(false)}
                        size="sm"
                        variant="outline"
                      >
                        Keep editing
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-border/50 border-t px-4 py-3">
                <Button
                  className="press-feedback"
                  onClick={onCancel}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <div className="flex gap-2">
                  <Button
                    className="press-feedback"
                    disabled={!canBack || step === 1}
                    onClick={onBack}
                    size="sm"
                    variant="outline"
                  >
                    {backLabel}
                  </Button>
                  <Button
                    className="press-feedback"
                    disabled={!canNext}
                    onClick={onNext}
                    size="sm"
                  >
                    {nextLabel}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
