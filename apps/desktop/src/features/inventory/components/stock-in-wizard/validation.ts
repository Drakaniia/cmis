import type { ItemDraftErrors } from "../../domain/item-update";
import { validatePackFields } from "../../domain/item-update";
import type { InventoryItem } from "../../types";
import type { StepDetailsState, StockInDraft } from "./types";

/**
 * The pack rules V1–V6, as this wizard sees them (F3).
 *
 * The rules themselves live in `domain/item-update.ts` and are shared with the
 * item form and the delivery sheet, so the wizard, the sheet and the panel
 * cannot refuse different shapes (F7). Only the wiring is here.
 */
export function packErrors(draft: {
  form: string;
  packQty: number | "";
  packUnit: string;
}): ItemDraftErrors {
  return validatePackFields(draft).errors;
}

export function validateStep(s: number, draft: StockInDraft): boolean {
  if (s === 1) {
    return draft.identifier.trim().length > 0;
  }
  if (s === 2) {
    return (
      draft.name.trim().length > 0 &&
      draft.category.trim().length > 0 &&
      // The four strength fields stay optional (decision 7), but a pack pair
      // that cannot mean anything (a unit with no multiple, a multiple with no
      // unit, a pack on `form = box`) is a shape error, not a gap — so it blocks
      // Next like a missing name does (V1, V2, V4).
      Object.keys(packErrors(draft)).length === 0
    );
  }
  if (s === 3) {
    // Soft batch/expiry: empty batch is auto-generated on confirm,
    // past expiry is a warning not a block (user requested soft validation).
    // Only qty is hard-required for a meaningful stock-in.
    return Number.isFinite(draft.qty) && draft.qty >= 1;
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
  // The pair prefills with the rest: a stock-in on an item that already records
  // `10/box` must not look as if the pack were unrecorded (F3, D24).
  const packQty = item.packQty ?? 0;
  return {
    category: item.category,
    form: item.form,
    name: item.name,
    packQty: packQty > 0 ? packQty : "",
    packSize: item.packSize,
    packUnit: item.packUnit ?? "",
    strengthUnit: item.strengthUnit,
    strengthValue: item.strengthValue,
  };
}
