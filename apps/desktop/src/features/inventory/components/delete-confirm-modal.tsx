import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "@/features/admin/components/confirm-modal";

/**
 * CMIS-UI-09 §12 + spec §7.7 — the one delete modal behind all four entry
 * points (product, batch, bulk, reverse a stock-in).
 *
 * It layers three things onto `ConfirmModal`: a **consequence summary** computed
 * before opening so the operator reads real numbers rather than prose, an
 * optional reason that lands on `trash_records.reason`, and copy that says
 * whether the action is recoverable — the typed word distinguishes reversible
 * (`DELETE`) from permanent (`PURGE`), so it must not read like an
 * irreversible cliff when it is not one.
 */

export const DELETE_REASON_PICKS = [
  "Duplicate entry",
  "Discontinued",
  "Entered in error",
  "Expired stock",
] as const;

function ReasonPick({
  label,
  onPick,
}: {
  label: string;
  onPick: (label: string) => void;
}) {
  const handleClick = useCallback(() => onPick(label), [label, onPick]);
  return (
    <Button
      className="press-feedback h-6 px-2 text-[11px]"
      onClick={handleClick}
      size="sm"
      type="button"
      variant="outline"
    >
      {label}
    </Button>
  );
}

function ReasonField({
  onChange,
  reason,
}: {
  onChange: (value: string) => void;
  reason: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    [onChange]
  );

  return (
    <div className="block text-caption text-foreground">
      <label htmlFor="delete-reason">Reason (optional)</label>
      <div className="mt-1 flex flex-wrap gap-1">
        {DELETE_REASON_PICKS.map((pick) => (
          <ReasonPick key={pick} label={pick} onPick={onChange} />
        ))}
      </div>
      <textarea
        aria-label="Reason for deleting"
        className="mt-1 min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        id="delete-reason"
        onChange={handleChange}
        placeholder="Why is this being removed?"
        value={reason}
      />
    </div>
  );
}

export function DeleteConfirmModal({
  open,
  onOpenChange,
  title,
  consequences,
  confirmLabel,
  confirmWord = "DELETE",
  reversible = true,
  onConfirm,
  extra,
}: {
  /** Real numbers, one line each — never a paragraph of prose. */
  consequences: string[];
  confirmLabel?: string;
  confirmWord?: "DELETE" | "PURGE";
  /** Rendered under the reason field, e.g. a SKU-collision resolution. */
  extra?: ReactNode;
  onConfirm: (reason: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reversible?: boolean;
  title: string;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    onConfirm(reason.trim());
  }, [onConfirm, reason]);

  return (
    <ConfirmModal
      confirmLabel={
        confirmLabel ??
        (confirmWord === "PURGE" ? "Delete permanently" : "Move to Trash")
      }
      description={
        <div className="space-y-2">
          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
            <p className="font-semibold text-caption text-foreground uppercase tracking-widest">
              What happens
            </p>
            <ul className="mt-1 space-y-0.5 text-caption text-foreground">
              {consequences.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p
            className={cn(
              "text-caption",
              reversible ? "text-muted-foreground" : "text-destructive"
            )}
          >
            {reversible
              ? "This can be restored from Trash."
              : "This cannot be undone."}
          </p>
        </div>
      }
      destructive
      onConfirm={handleConfirm}
      onOpenChange={onOpenChange}
      open={open}
      title={title}
      typeToConfirm={confirmWord}
    >
      <div className="space-y-3">
        <ReasonField onChange={setReason} reason={reason} />
        {extra}
      </div>
    </ConfirmModal>
  );
}
