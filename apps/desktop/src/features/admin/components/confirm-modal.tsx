import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";

/**
 * CMIS-UI-09 — focused confirmation modal.
 *
 * Apple §12: a modal task pairs the surface with a dimming scrim, unlike the
 * parallel (scrim-less) detail sheets on the same routes. Apple §16 Agency:
 * confirmation is reserved for genuinely destructive or irreversible actions,
 * and high-stakes ones can require typing the target name.
 */
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  typeToConfirm,
  onConfirm,
  children,
}: {
  children?: ReactNode;
  confirmLabel?: string;
  description?: ReactNode;
  destructive?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect?: DOMRect | null;
  title: string;
  typeToConfirm?: string;
}) {
  const [typed, setTyped] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
    if (open) {
      setTyped("");
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

  const satisfied = !typeToConfirm || typed.trim() === typeToConfirm;

  const handleConfirm = useCallback(() => {
    if (!satisfied) {
      setAttempted(true);
      return;
    }
    onConfirm();
  }, [satisfied, onConfirm]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleTypedChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setTyped(event.target.value);
    },
    []
  );

  const transformOrigin = "center center";

  return (
    <AnimatePresence>
      {open ? (
        <>
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
              className="surface-frosted flex w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
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
              <div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
                <h2 className="font-semibold text-foreground text-sm">
                  {title}
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
                {description ? (
                  <div className="text-muted-foreground text-sm">
                    {description}
                  </div>
                ) : null}

                {children}

                {typeToConfirm ? (
                  <label className="block text-caption text-foreground">
                    Type <span className="font-semibold">{typeToConfirm}</span>{" "}
                    to confirm
                    <input
                      className={cn(
                        "mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                        attempted && !satisfied && "border-destructive"
                      )}
                      onChange={handleTypedChange}
                      value={typed}
                    />
                    {attempted && !satisfied ? (
                      <span className="mt-1 block text-destructive">
                        Text does not match.
                      </span>
                    ) : null}
                  </label>
                ) : null}
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
                  variant={destructive ? "destructive" : "default"}
                >
                  {confirmLabel}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
