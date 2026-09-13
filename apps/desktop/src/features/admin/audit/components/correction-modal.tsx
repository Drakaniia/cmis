import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";
import type { AuditRow } from "../types";

function asText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function CorrectionField({
  before,
  fieldKey,
  onValueChange,
  value,
}: {
  before: string;
  fieldKey: string;
  onValueChange: (key: string, value: string) => void;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onValueChange(fieldKey, event.target.value);
    },
    [onValueChange, fieldKey]
  );

  return (
    <div className="grid grid-cols-[0.8fr_1fr_1fr] items-center gap-2">
      <span className="truncate text-caption text-foreground">{fieldKey}</span>
      <span className="truncate rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-caption text-muted-foreground">
        {before}
      </span>
      <input
        aria-label={`Corrected ${fieldKey}`}
        className="h-7 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        onChange={handleChange}
        value={value}
      />
    </div>
  );
}

/**
 * CMIS-UI-09 §3.4 — audit is append-only. The original row is shown read-only;
 * the correction is a *new* entry that links back to it. A reason is required
 * so the correction is self-explaining later (Responsibility).
 */
export function CorrectionModal({
  open,
  onOpenChange,
  row,
  onSubmit,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    corrected: Record<string, string>;
    reason: string;
  }) => void;
  open: boolean;
  row: AuditRow | null;
}) {
  const keys = useMemo(
    () =>
      row
        ? [
            ...new Set([
              ...Object.keys(row.before ?? {}),
              ...Object.keys(row.after ?? {}),
            ]),
          ]
        : [],
    [row]
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
    if (open && row && keys.length > 0) {
      setValues(
        Object.fromEntries(keys.map((key) => [key, asText(row.after?.[key])]))
      );
      setReason("");
      setAttempted(false);
    }
  }, [open, row, keys]);

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

  const valid = reason.trim().length > 0;

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleValueChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReasonChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setReason(event.target.value);
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (!valid) {
      setAttempted(true);
      return;
    }
    onSubmit({ corrected: values, reason: reason.trim() });
    onOpenChange(false);
  }, [valid, onSubmit, values, reason, onOpenChange]);

  return (
    <AnimatePresence>
      {open && row ? (
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
              aria-label="Create correction"
              aria-modal="true"
              className="surface-frosted flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial="initial"
              role="dialog"
              transition={reduceMotion ? { duration: 0 } : sheetSpring}
              variants={variants}
            >
              <div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
                <div>
                  <h2 className="font-semibold text-foreground text-sm">
                    Create correction
                  </h2>
                  <p className="text-caption text-muted-foreground">
                    Correction of [{row.id}] — appends a new entry
                  </p>
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

              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                {keys.length === 0 ? (
                  <p className="text-caption text-muted-foreground">
                    This entry has no structured fields to correct. Add a note
                    below explaining the amendment.
                  </p>
                ) : null}

                {keys.map((key) => (
                  <CorrectionField
                    before={asText(row.before?.[key])}
                    fieldKey={key}
                    key={key}
                    onValueChange={handleValueChange}
                    value={values[key] ?? ""}
                  />
                ))}

                <label className="block text-caption text-foreground">
                  Reason (required)
                  <textarea
                    className={cn(
                      "mt-1 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                      attempted && !valid && "border-destructive"
                    )}
                    onChange={handleReasonChange}
                    placeholder="Why is this correction being made?"
                    value={reason}
                  />
                  {attempted && !valid ? (
                    <span className="mt-1 block text-destructive">
                      A reason is required for the audit trail.
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
                  onClick={handleSubmit}
                  size="sm"
                >
                  Append correction
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
