import { Button } from "@cmis/ui/components/button";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";

export interface CrudField {
  key: string;
  label: string;
  required?: boolean;
  type?: "number" | "text";
}

/**
 * CMIS-UI-09 §2.3 — shared create/edit modal for Suppliers and Categories.
 * Inline required-field validation keeps the save button honest (00 §16).
 */
export function CrudModal({
  open,
  onOpenChange,
  title,
  fields,
  initial,
  onSubmit,
}: {
  fields: CrudField[];
  initial: Record<string, string>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, string>) => void;
  open: boolean;
  title: string;
}) {
  const [values, setValues] = React.useState(initial);
  // Parents pass a fresh object each render; seed only when the modal opens.
  const initialRef = React.useRef(initial);
  initialRef.current = initial;

  React.useEffect(() => {
    if (open) {
      setValues(initialRef.current);
    }
  }, [open]);

  const valid = fields.every(
    (field) => !field.required || values[field.key]?.trim().length > 0
  );
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

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
            onClick={() => onOpenChange(false)}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-label={title}
              aria-modal="true"
              className="surface-frosted flex w-full max-w-[420px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial="initial"
              role="dialog"
              transition={reduceMotion ? { duration: 0 } : sheetSpring}
              variants={variants}
            >
              <div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
                <h3 className="font-semibold text-foreground text-sm">
                  {title}
                </h3>
                <Button
                  aria-label="Close"
                  className="press-feedback"
                  onClick={() => onOpenChange(false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="space-y-3 p-4">
                {fields.map((field) => (
                  <label
                    className="block text-caption text-foreground"
                    key={field.key}
                  >
                    {field.label}
                    <input
                      className="mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                      onChange={(event) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.key]: event.target.value,
                        }))
                      }
                      type={field.type ?? "text"}
                      value={values[field.key] ?? ""}
                    />
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 border-border/50 border-t px-4 py-3">
                <Button
                  className="press-feedback"
                  onClick={() => onOpenChange(false)}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  className="press-feedback"
                  disabled={!valid}
                  onClick={() => {
                    onSubmit(values);
                    onOpenChange(false);
                  }}
                  size="sm"
                >
                  Save
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
