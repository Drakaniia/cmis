import { deriveStatus } from "../import/inventory-status";
import type { InventoryItem, InventoryStatus } from "../types";
import { isPackIncomplete, packSizeText } from "./pack-size";
import { composeDisplayName, isDetailsIncomplete } from "./strength";
import { PACK_UNITS } from "./vocabulary";

/**
 * Stock detail modal §10 — the rules behind the Edit form.
 *
 * Kept out of the panel so the interesting part (what a save *means* for
 * `status`, `display_name` and `detailsIncomplete`) is testable without
 * rendering, and so the panel stays a form.
 *
 * The four strength fields are optional and never block a save (decision 15 /
 * the strength spec's own rule). `form` and `strengthUnit` come from the
 * canonical `domain/vocabulary.ts` lists, which the export writer also reads,
 * and every derived label comes from `domain/strength.ts` rather than a rule of
 * this file's own — so the form and the importer cannot disagree.
 */

/** §10.1 — `pack_size` is capped so it cannot run away in the template column. */
const PACK_SIZE_MAX = 40;

export interface ItemEditDraft {
  category: string;
  form: string;
  name: string;
  /** `""` when untyped — the pack multiple the pair stores (pack-size F2). */
  packQty: number | "";
  packSize: string;
  packUnit: string;
  qty: number;
  sku: string;
  strengthUnit: string;
  strengthValue: string;
  supplier: string;
  threshold: number;
}

export interface ItemDraftErrors {
  name?: string;
  packQty?: string;
  packSize?: string;
  packUnit?: string;
  qty?: string;
  sku?: string;
  threshold?: string;
}

/** The exact column values a save writes. */
export interface ItemUpdateValues {
  category: string;
  display_name: string;
  dosage_missing: number;
  form: string;
  name: string;
  pack_qty: number;
  pack_size: string;
  pack_unit: string;
  qty: number;
  sku: string;
  status: InventoryStatus;
  strength_unit: string;
  strength_value: string;
  supplier: string;
  threshold: number;
}

/** Dose forms measured in bulk, where a pack multiple is discouraged (V5, N4). */
const BULK_FORMS = new Set([
  "cream",
  "drops",
  "gel",
  "lotion",
  "ointment",
  "solution",
  "spray",
  "susp",
  "suspension",
  "syrup",
]);

function isWholeNumber(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

export function draftFromItem(item: InventoryItem): ItemEditDraft {
  const packQty = item.packQty ?? 0;
  return {
    category: item.category,
    form: item.form,
    name: item.name,
    packQty: packQty > 0 ? packQty : "",
    packSize: item.packSize,
    packUnit: item.packUnit ?? "",
    qty: item.qty,
    sku: item.sku,
    strengthUnit: item.strengthUnit,
    strengthValue: item.strengthValue,
    supplier: item.supplier,
    threshold: item.threshold,
  };
}

const PACK_UNIT_TOKENS = new Set<string>(PACK_UNITS);

/**
 * The pack rules V1–V6, shared by the new-product form and the edit panel.
 * Returns errors keyed by field, plus warnings the caller lists on review.
 */
export function validatePackFields(draft: {
  form: string;
  packQty: number | "";
  packUnit: string;
}): { errors: ItemDraftErrors; warnings: string[] } {
  const errors: ItemDraftErrors = {};
  const warnings: string[] = [];
  const rawQty = draft.packQty;
  const unit = draft.packUnit.trim();
  const qtyTyped = rawQty !== "";
  const form = draft.form.trim().toLowerCase();

  // V6 — the container must come from the shared vocabulary.
  if (unit !== "" && !PACK_UNIT_TOKENS.has(unit.toLowerCase())) {
    errors.packUnit = `“${unit}” is not a pack unit — choose one from the list.`;
  }

  if (qtyTyped) {
    if (!(Number.isInteger(rawQty) && rawQty >= 1)) {
      // V1 — a non-integer, zero or negative multiple is not a pack.
      errors.packQty = "Pack quantity must be a whole number, 1 or more.";
    } else if (rawQty === 1) {
      // V3 — allowed, warned.
      warnings.push("A pack of 1 is the same as the base unit.");
    }
    if (rawQty !== 1 && unit === "") {
      // V2 — a bare multiple is meaningless.
      errors.packUnit = "Choose the pack unit (box, strip, …).";
    }
  } else if (unit !== "") {
    // V1 — a unit with no quantity.
    errors.packQty = "Enter how many base units one pack holds.";
  }

  // V4 — `form = box` is itself the base unit; a pack on top double-counts (D15).
  if (form === "box" && (qtyTyped || unit !== "")) {
    errors.packUnit = "An item whose form is “box” cannot also record a pack.";
  }

  // V5 — a bulk measure has no meaningful pack multiple; warn only (N4).
  if (BULK_FORMS.has(form) && (qtyTyped || unit !== "")) {
    warnings.push(
      "This is a bulk form — a pack multiple is unusual and no conversion is applied."
    );
  }

  return { errors, warnings };
}

/**
 * §10.1 validation. `items` is the whole inventory because `inventory_items.sku`
 * is UNIQUE; the item's own row is excluded so re-saving an untouched SKU is
 * not a collision with itself.
 */
export function validateItemDraft(
  draft: ItemEditDraft,
  items: InventoryItem[],
  itemId: string
): ItemDraftErrors {
  const errors: ItemDraftErrors = {};

  if (draft.name.trim() === "") {
    errors.name = "Name is required.";
  }

  const sku = draft.sku.trim();
  if (sku === "") {
    errors.sku = "SKU is required.";
  } else if (
    items.some(
      (item) =>
        item.id !== itemId &&
        item.sku.trim().toLowerCase() === sku.toLowerCase()
    )
  ) {
    errors.sku = "Another product already uses this SKU.";
  }

  if (!(isWholeNumber(draft.qty) && draft.qty >= 0)) {
    errors.qty = "Quantity must be a whole number, 0 or more.";
  }

  if (!(isWholeNumber(draft.threshold) && draft.threshold >= 0)) {
    errors.threshold = "Threshold must be a whole number, 0 or more.";
  }

  if (draft.packSize.trim().length > PACK_SIZE_MAX) {
    errors.packSize = `Pack size must be ${PACK_SIZE_MAX} characters or fewer.`;
  }

  Object.assign(errors, validatePackFields(draft).errors);

  return errors;
}

/**
 * §10.2 — everything a save recomputes.
 *
 * `display_name` is written because that stored label is what dispense requests
 * match against, so a save has to leave it describing the values it just wrote.
 * `dosage` is deliberately not written: the strength columns are the source of
 * truth and the drop migration is the legacy column's only remaining caller.
 */
export function buildItemUpdate(
  _item: InventoryItem,
  draft: ItemEditDraft
): ItemUpdateValues {
  // The text is derived from the pair when there is one, so a save that names a
  // pack writes `10/box` and the label follows (D24).
  const packItem = {
    form: draft.form.trim(),
    packQty: draft.packQty,
    packUnit: draft.packUnit,
  };
  const derivedText = packSizeText(packItem);
  const parts = {
    form: draft.form.trim(),
    packSize: derivedText === "" ? draft.packSize.trim() : derivedText,
    strengthUnit: draft.strengthUnit.trim(),
    strengthValue: draft.strengthValue.trim(),
  };

  return {
    category: draft.category.trim(),
    display_name: composeDisplayName({ ...parts, name: draft.name.trim() }),
    // Repurposed as "details incomplete" (§10.2), plus the pack pair for a
    // pack-forming item (V7).
    dosage_missing:
      isDetailsIncomplete(parts) || isPackIncomplete(packItem) ? 1 : 0,
    form: parts.form,
    name: draft.name.trim(),
    pack_qty: draft.packQty === "" ? 0 : draft.packQty,
    pack_size: parts.packSize,
    pack_unit: draft.packUnit.trim(),
    qty: draft.qty,
    sku: draft.sku.trim(),
    status: deriveStatus(draft.qty, draft.threshold),
    strength_unit: parts.strengthUnit,
    strength_value: parts.strengthValue,
    supplier: draft.supplier.trim(),
    threshold: draft.threshold,
  };
}

/**
 * §10.4 — requests and dispensing records reference the medicine by text, so a
 * rename can silently orphan them. Only the name matters here; every other
 * field is free to change without a warning.
 */
export function isRename(item: InventoryItem, draft: ItemEditDraft): boolean {
  return item.name.trim() !== draft.name.trim();
}

/** §10.3 — the divergence the form has to show before it saves. */
export function batchQuantityTotal(item: InventoryItem): number {
  return item.batches.reduce((sum, batch) => sum + batch.qty, 0);
}
