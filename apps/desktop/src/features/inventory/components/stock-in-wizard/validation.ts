import type { InventoryItem } from "../../types";
import type { StepDetailsState, StockInDraft } from "./types";

export function validateStep(s: number, draft: StockInDraft): boolean {
  if (s === 1) {
    return draft.identifier.trim().length > 0;
  }
  if (s === 2) {
    return draft.name.trim().length > 0 && draft.category.trim().length > 0;
  }
  if (s === 3) {
    const expiryDate = draft.expiry ? new Date(draft.expiry) : null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const future = expiryDate ? expiryDate > now : false;
    return (
      draft.batch.trim().length > 0 &&
      future &&
      Number.isFinite(draft.qty) &&
      draft.qty >= 1
    );
  }
  return true;
}

export function allStepsValid(draft: StockInDraft): boolean {
  return (
    validateStep(1, draft) && validateStep(2, draft) && validateStep(3, draft)
  );
}

/** Step 2 fields as one value, so "prefill from an item" is stated once. */
export function detailsFromItem(item: InventoryItem): StepDetailsState {
  return {
    category: item.category,
    form: item.form,
    name: item.name,
    packSize: item.packSize,
    strengthUnit: item.strengthUnit,
    strengthValue: item.strengthValue,
  };
}
