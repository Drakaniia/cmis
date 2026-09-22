import { draftHasPack, packSizeTextOf } from "../../../creation/draft";
import { expiryLabel } from "../../../domain/expiry";
import { describeQuantity } from "../../../domain/pack-size";
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
  // read it back (decision 18). The pack text is derived from the pair, exactly
  // as the write does (D24), so the label here cannot differ from the stored one.
  const label = composeDisplayName({
    form: draft.form,
    name: draft.name || draft.identifier,
    packSize: packSizeTextOf(draft),
    strengthUnit: draft.strengthUnit,
    strengthValue: draft.strengthValue,
  });
  // `draft.qty` is base units (F4), so a delivery typed as `5 box` reads back as
  // the mixed form: the shelf's number leads and the pack follows (G4, D11).
  const packItem = {
    form: draft.form,
    packQty: draft.packQty,
    packUnit: draft.packUnit,
  };
  const qtyLabel = draft.qty > 0 ? describeQuantity(draft.qty, packItem) : "—";
  const packNote = draftHasPack(draft)
    ? `One pack holds ${draft.packQty} ${draft.packUnit} — the quantity above is stored in base units.`
    : "No pack size recorded for this item — quantities are in base units.";
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
              {qtyLabel}
            </p>
          </div>
        </div>
        {draft.notes ? (
          <p className="mt-2 text-caption text-muted-foreground">
            Notes: {draft.notes}
          </p>
        ) : null}
      </div>
      <p className="text-caption text-muted-foreground">{packNote}</p>
      <p className="text-caption text-muted-foreground">
        Confirm enables only if all steps valid — currently{" "}
        {allValid ? "valid ✓" : "fix errors above"}
      </p>
    </div>
  );
}
