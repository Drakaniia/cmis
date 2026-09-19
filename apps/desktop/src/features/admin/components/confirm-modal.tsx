import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Check, Copy, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ChangeEvent,
  type ClipboardEvent,
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
  const [copied, setCopied] = useState(false);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  useEffect(() => {
    if (open) {
      setTyped("");
      setAttempted(false);
      setCopied(false);
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

  const handleCopy = useCallback(async () => {
    if (!typeToConfirm) {
      return;
    }
    try {
      await navigator.clipboard.writeText(typeToConfirm);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // fallback: select input text
      setCopied(false);
    }
  }, [typeToConfirm]);

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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            onClick={handleClose}
          >
            <motion.div
              animate="animate"
              aria-label={title}
              aria-modal="true"
              className="surface-frosted flex w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial="initial"
              onClick={(event) => event.stopPropagation()}
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
                  <TypeToConfirmField
                    attempted={attempted}
                    copied={copied}
                    onCopy={handleCopy}
                    onTypedText={setTyped}
                    satisfied={satisfied}
                    typed={typed}
                    typeToConfirm={typeToConfirm}
                  />
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
                  aria-disabled={!satisfied}
                  className={cn(
                    "press-feedback transition-opacity",
                    destructive && !satisfied && "opacity-50"
                  )}
                  disabled={!satisfied}
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

/**
 * The "type the name to confirm" field, with the copy shortcut beside it.
 *
 * It owns the paste handling because WebViews occasionally deliver clipboard
 * text without firing a change event: mirroring it on the next microtask keeps
 * the typed text — and the confirm button — in step either way.
 */
function TypeToConfirmField({
  attempted,
  copied,
  onCopy,
  onTypedText,
  satisfied,
  typeToConfirm,
  typed,
}: {
  attempted: boolean;
  copied: boolean;
  onCopy: () => void;
  onTypedText: (value: string) => void;
  satisfied: boolean;
  typeToConfirm: string;
  typed: string;
}) {
  const handleTypedChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onTypedText(event.target.value);
    },
    [onTypedText]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData("text");
      if (!pasted) {
        return;
      }
      const target = event.currentTarget;
      // Run after the browser has applied the default input value.
      queueMicrotask(() => onTypedText(target.value));
    },
    [onTypedText]
  );

  return (
    <div className="block text-caption text-foreground">
      <div className="inline-flex flex-wrap items-center gap-1.5">
        <label htmlFor="confirm-type-input">
          Type{" "}
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-semibold">
            {typeToConfirm}
          </span>{" "}
          to confirm
        </label>
        <Button
          aria-label={`Copy ${typeToConfirm}`}
          className="h-6 px-1.5"
          onClick={onCopy}
          size="sm"
          type="button"
          variant="ghost"
        >
          {copied ? (
            <Check className="size-3.5 text-[var(--success)]" />
          ) : (
            <Copy className="size-3.5" />
          )}
          <span className="text-[11px]">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <input
        aria-label={`Type ${typeToConfirm} to confirm`}
        autoComplete="off"
        autoCorrect="off"
        className={cn(
          "mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
          attempted && !satisfied && "border-destructive"
        )}
        id="confirm-type-input"
        onChange={handleTypedChange}
        onPaste={handlePaste}
        spellCheck={false}
        value={typed}
      />
      {attempted && !satisfied ? (
        <span className="mt-1 block text-destructive">
          Text does not match.
        </span>
      ) : null}
    </div>
  );
}
