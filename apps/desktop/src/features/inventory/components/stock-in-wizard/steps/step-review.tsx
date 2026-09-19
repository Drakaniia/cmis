import { expiryLabel } from "../../../domain/expiry";
import { composeDisplayName } from "../../../domain/strength";
import type { StockInDraft } from "../types";

export function StepReview({
  draft,
  allValid,
}: {
  draft: StockInDraft;
  allValid: boolean;
}) {
  // The review shows the composed label rather than the raw parts, so the
  // operator sees the medication the way the lists and the dispense lookup will
  // read it back (decision 18).
  const label = composeDisplayName({
    form: draft.form,
    name: draft.name || draft.identifier,
    packSize: draft.packSize,
    strengthUnit: draft.strengthUnit,
    strengthValue: draft.strengthValue,
  });
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 4 — Review &amp; Submit
      </h3>
      <div className="rounded-lg border border-border bg-card p-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-caption text-muted-foreground">Item</p>
            <p className="font-medium">
              {label || "—"} {draft.isNew ? "(new)" : ""}
            </p>
            <p className="text-caption">{draft.category}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Batch</p>
            <p className="font-medium">{draft.batch || "—"}</p>
            <p className="text-caption">
              Expiry: {draft.expiry ? expiryLabel(draft.expiry) : "—"} · Qty:{" "}
              {draft.qty || "—"}
            </p>
          </div>
        </div>
        {draft.notes ? (
          <p className="mt-2 text-caption text-muted-foreground">
            Notes: {draft.notes}
          </p>
        ) : null}
      </div>
      <p className="text-caption text-muted-foreground">
        Confirm enables only if all steps valid — currently{" "}
        {allValid ? "valid ✓" : "fix errors above"}
      </p>
    </div>
  );
}
