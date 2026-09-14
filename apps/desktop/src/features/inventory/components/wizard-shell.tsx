import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";

function stepDotClass(active: boolean, done: boolean): string {
  if (active) {
    return "w-6 bg-primary";
  }
  if (done) {
    return "w-4 bg-primary/60";
  }
  return "w-4 bg-muted";
}

/**
 * Apple Design §12 — WizardShell is a frosted glass dialog.
 * §4  — Step transitions use directional slide (12px) with spring ease.
 * §8  — Footer buttons: Cancel (ghost, tertiary), Back (outline, secondary),
 *        Next/Confirm (confirm variant, primary CTA).
 * §1  — All buttons have instant press feedback (scale 0.97).
 * §12 — Header & footer are frosted material bars; body scrolls between them.
 * §14 — Reduced motion: cross-fade only, no slide/spring.
 */
export function WizardShell({
  open,
  onOpenChange,
  title,
  step,
  totalSteps,
  originRect: _originRect,
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
  children: ReactNode;
  direction?: 1 | -1;
  dirty?: boolean;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
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

  const handleClose = useCallback(() => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }, [confirmDiscard, dirty, onOpenChange]);

  const handleDiscard = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handleKeepEditing = useCallback(() => setConfirmDiscard(false), []);

  const stepNumbers = Array.from(
    { length: totalSteps },
    (_, index) => index + 1
  );

  return (
    <AnimatePresence>
      {open ? (
        <>
          {" "}
          {/* §12 Scrim — dim to focus, blur background */}
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
              aria-label={title}
              aria-modal="true"
              className={cn(
                "flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl",
                /* §12 Glass material: translucent with blur */
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
              {/* §12 Header — frosted bar with progress */}
              <div className="flex items-center justify-between gap-2 border-border/30 border-b px-4 py-3">
                <div className="min-w-0">
                  {/* §15 — Tight tracking on heading */}
                  <h2
                    className="font-semibold text-foreground text-sm"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {title}
                  </h2>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    Step {step} of {totalSteps}
                  </p>
                  {/* Step dots — §4 spring transition on width change */}
                  <div className="mt-2 flex items-center gap-1.5">
                    {stepNumbers.map((stepNumber) => (
                      <motion.span
                        className={cn(
                          "h-1.5 rounded-full",
                          stepDotClass(stepNumber === step, stepNumber < step)
                        )}
                        key={stepNumber}
                        layout
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { bounce: 0, duration: 0.3, type: "spring" }
                        }
                      />
                    ))}
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

              {/* §12 Body — content scrolls between frosted header/footer */}
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
                        onClick={handleDiscard}
                        size="sm"
                        variant="destructive"
                      >
                        Discard
                      </Button>
                      <Button
                        onClick={handleKeepEditing}
                        size="sm"
                        variant="outline"
                      >
                        Keep editing
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* §12 Footer — frosted bar, button hierarchy per §8:
               *   Cancel = ghost (tertiary, de-emphasized)
               *   Back   = outline (secondary, visible but not dominant)
               *   Next   = confirm (primary CTA, solid fill) */}
              <div className="flex items-center justify-between border-border/30 border-t px-4 py-3">
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
                    variant="confirm"
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
