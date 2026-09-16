import { deriveStatus } from "../import/inventory-status";
import type { InventoryItem, InventoryStatus } from "../types";
import { composeDisplayName, isDetailsIncomplete } from "./strength";

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
  packSize: string;
  qty: number;
  sku: string;
  strengthUnit: string;
  strengthValue: string;
  supplier: string;
  threshold: number;
}

export interface ItemDraftErrors {
  name?: string;
  packSize?: string;
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
  pack_size: string;
  qty: number;
  sku: string;
  status: InventoryStatus;
  strength_unit: string;
  strength_value: string;
  supplier: string;
  threshold: number;
}

function isWholeNumber(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

export function draftFromItem(item: InventoryItem): ItemEditDraft {
  return {
    category: item.category,
    form: item.form,
    name: item.name,
    packSize: item.packSize,
    qty: item.qty,
    sku: item.sku,
    strengthUnit: item.strengthUnit,
    strengthValue: item.strengthValue,
    supplier: item.supplier,
    threshold: item.threshold,
  };
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
  const parts = {
    form: draft.form.trim(),
    packSize: draft.packSize.trim(),
    strengthUnit: draft.strengthUnit.trim(),
    strengthValue: draft.strengthValue.trim(),
  };

  return {
    category: draft.category.trim(),
    display_name: composeDisplayName({ ...parts, name: draft.name.trim() }),
    // Repurposed as "details incomplete" (§10.2).
    dosage_missing: isDetailsIncomplete(parts) ? 1 : 0,
    form: parts.form,
    name: draft.name.trim(),
    pack_size: parts.packSize,
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
