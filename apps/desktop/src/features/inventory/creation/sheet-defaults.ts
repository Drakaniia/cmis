import { newProductDraft, type ProductDraft } from "./draft";
import {
  SHEET_DEFAULT_FIELDS,
  type SheetDefaultField,
  type SheetDefaults,
  type SheetGroup,
} from "./sheet-types";

/** Blank means "not set" — it never wipes a value off a group (see §7.4). */
export function emptySheetDefaults(): SheetDefaults {
  return {
    category: "",
    form: "",
    strengthUnit: "",
    supplier: "",
    threshold: "",
  };
}

let groupCounter = 0;

export function nextGroupId(): string {
  groupCounter += 1;
  return `group-${groupCounter}`;
}

function applyOneDefault(
  product: ProductDraft,
  defaults: SheetDefaults,
  field: SheetDefaultField
): ProductDraft {
  switch (field) {
    case "category":
      return defaults.category.trim() === ""
        ? product
        : { ...product, category: defaults.category };
    case "form":
      return defaults.form.trim() === ""
        ? product
        : { ...product, form: defaults.form };
    case "strengthUnit":
      return defaults.strengthUnit.trim() === ""
        ? product
        : { ...product, strengthUnit: defaults.strengthUnit };
    case "supplier":
      return defaults.supplier.trim() === ""
        ? product
        : { ...product, supplier: defaults.supplier };
    case "threshold":
      return defaults.threshold === ""
        ? product
        : { ...product, threshold: defaults.threshold };
    default:
      return product;
  }
}

export function applyDefaultFields(
  product: ProductDraft,
  defaults: SheetDefaults,
  fields: readonly SheetDefaultField[] = SHEET_DEFAULT_FIELDS
): ProductDraft {
  let next = product;
  for (const field of fields) {
    next = applyOneDefault(next, defaults, field);
  }
  return next;
}

/**
 * Wraps a product the caller has already assembled — the paste path builds one
 * row at a time and must not have a stencil write over what the file said.
 */
export function sheetGroupFromProduct(
  product: ProductDraft,
  opts: { overridden?: SheetDefaultField[]; skuTouched?: boolean } = {}
): SheetGroup {
  return {
    id: nextGroupId(),
    overridden: opts.overridden ?? [],
    product,
    skuTouched: opts.skuTouched ?? false,
  };
}

/** A blank group: the per-product defaults, with the stencil stamped on top. */
export function newSheetGroup(
  defaults: SheetDefaults,
  seed: Partial<ProductDraft> = {}
): SheetGroup {
  return sheetGroupFromProduct(
    applyDefaultFields({ ...newProductDraft(), ...seed }, defaults)
  );
}
