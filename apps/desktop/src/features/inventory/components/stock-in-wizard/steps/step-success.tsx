import { CheckCircle2 } from "lucide-react";

/**
 * Step 5 — the terminal screen after a delivery is submitted.
 *
 * It exists so a delivery run of several items does not have to be restarted:
 * the operator sees what was just logged and can either start the next item from
 * here or close the dialog. Both choices live in the footer (Stock In Another
 * Item / Done), so the body only has to report what was saved.
 */
export function StepSuccess({
  itemLabel,
  qtyLabel,
}: {
  itemLabel: string;
  qtyLabel: string;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">Step 5 — Done</h3>
      <div className="flex items-start gap-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 p-3">
        <CheckCircle2
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-[var(--success)]"
        />
        <div className="text-sm">
          <p className="font-medium text-foreground">Stocked in</p>
          <p className="text-muted-foreground">
            {itemLabel || "Item"} · +{qtyLabel}
          </p>
        </div>
      </div>
      <p className="text-caption text-muted-foreground">
        Add another delivery now, or close to finish.
      </p>
    </div>
  );
}
