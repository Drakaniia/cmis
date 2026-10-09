import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { materializeEnter, sheetSpring } from "@/lib/motion";
import {
  buildRequestorUpdate,
  draftFromRequestor,
  isRequestorChanged,
  type RequestorDraft,
  validateRequestorDraft,
} from "../requestor-update";
import type { RequestItem, Requestor } from "../types";
import { requestorLabel } from "../types";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const LABEL_CLASS = "block font-medium text-caption text-foreground";
const HINT_CLASS = "mt-1 block text-caption text-muted-foreground";
const ERROR_CLASS = "mt-1 block text-caption text-destructive";

/**
 * Edit Requestor Details — the form.
 *
 * Opened from the Requestor block in the request detail modal. Requestor
 * details are embedded on the request (there is no requestor directory), so a
 * save rewrites this one card's name, ID and email. Blank is a legal answer:
 * clearing the name returns the card to "Walk-in" (D23).
 */
export function EditRequestorModal({
  item,
  onOpenChange,
  onSave,
  open,
}: {
  item: RequestItem | null;
  onOpenChange: (open: boolean) => void;
  /** Called with the trimmed requestor once the draft is valid. */
  onSave: (id: string, requestor: Requestor) => void;
  open: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState<RequestorDraft>(() =>
    item ? draftFromRequestor(item.requestor) : { email: "", id: "", name: "" }
  );
  const [attempted, setAttempted] = useState(false);

  // Start each open from the card's stored values, so a cancelled edit never
  // leaks into the next one.
  useEffect(() => {
    if (open && item) {
      setDraft(draftFromRequestor(item.requestor));
      setAttempted(false);
    }
  }, [item, open]);

  const errors = useMemo(() => validateRequestorDraft(draft), [draft]);
  const changed = item ? isRequestorChanged(item.requestor, draft) : false;

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, open]);

  const patch = useCallback((values: Partial<RequestorDraft>) => {
    setDraft((previous) => ({ ...previous, ...values }));
  }, []);

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      patch({ name: event.target.value }),
    [patch]
  );
  const handleIdChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => patch({ id: event.target.value }),
    [patch]
  );
  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      patch({ email: event.target.value }),
    [patch]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAttempted(true);
      if (!item || Object.keys(validateRequestorDraft(draft)).length > 0) {
        return;
      }
      onSave(item.id, buildRequestorUpdate(draft));
    },
    [draft, item, onSave]
  );

  if (!item) {
    return null;
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-[80] bg-black/32"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={{ duration: 0.18 }}
          />
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-labelledby="edit-requestor-heading"
              aria-modal="true"
              className="surface-frosted flex max-h-[86vh] w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              role="dialog"
              style={{
                transformOrigin: "center center",
                willChange: "transform, opacity, filter",
              }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-4 py-3">
                <div>
                  <h2
                    className="font-semibold text-foreground text-sm"
                    id="edit-requestor-heading"
                  >
                    Edit requestor details
                  </h2>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {item.id} · {requestorLabel(item)}
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

              {/* Native validation is off so the inline message below is the
                  only one: the browser bubble would contradict the styled
                  error (or, in jsdom, silently swallow the submit). */}
              <form
                className="flex min-h-0 flex-1 flex-col"
                noValidate
                onSubmit={handleSubmit}
              >
                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                  <p className={HINT_CLASS}>
                    Leave the fields blank for a walk-in — the card reads
                    “Walk-in”.
                  </p>

                  <label className={LABEL_CLASS}>
                    Name
                    <input
                      className={FIELD_CLASS}
                      onChange={handleNameChange}
                      placeholder="Walk-in"
                      type="text"
                      value={draft.name}
                    />
                  </label>

                  <label className={LABEL_CLASS}>
                    ID
                    <input
                      className={FIELD_CLASS}
                      onChange={handleIdChange}
                      placeholder="STU-2024-0831"
                      type="text"
                      value={draft.id}
                    />
                  </label>

                  <label className={LABEL_CLASS}>
                    Email
                    <input
                      className={cn(
                        FIELD_CLASS,
                        attempted && errors.email && "border-destructive"
                      )}
                      onChange={handleEmailChange}
                      placeholder="name@example.edu"
                      type="email"
                      value={draft.email}
                    />
                    {attempted && errors.email ? (
                      <span className={ERROR_CLASS} role="alert">
                        {errors.email}
                      </span>
                    ) : null}
                  </label>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 border-border/50 border-t px-4 py-3">
                  <Button
                    className="press-feedback"
                    onClick={handleClose}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="press-feedback"
                    disabled={!changed}
                    size="sm"
                    type="submit"
                    variant="confirm"
                  >
                    Save details
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
