import { validatePackFields } from "../domain/item-update";
import {
  type BatchDraft,
  batchQty,
  displayNameOf,
  duplicateBatchIndexes,
  identityKeysOf,
  normalizeLot,
  type ProductDraft,
} from "./draft";

/**
 * Draft validation (spec §9.3), as pure functions.
 *
 * Two buckets, and the difference matters: an **error** blocks `Create all`
 * because the row would be wrong in the database, while a **warning** is an
 * optional field left blank and only gets listed on the review step. Nothing
 * optional is ever allowed to block a write.
 */

export interface DraftIssue {
  /** Field path, e.g. `name`, `sku`, `batches.<rowId>.batch`. */
  field: string;
  message: string;
  /** Set for a batch row, so the review step can jump back to it. */
  rowId?: string;
}

export interface DraftValidation {
  errors: DraftIssue[];
  warnings: DraftIssue[];
}

/** An existing product a draft collides with. */
export interface IdentityMatch {
  id: string;
  name: string;
  sku: string;
}

export interface ProductValidation extends DraftValidation {
  /** Set when this medicine already exists — the caller offers "Add batches". */
  duplicateOf: IdentityMatch | null;
  valid: boolean;
}

export interface ProductContext {
  /** Keyed by every key `identityKeysOf` can produce for the existing row. */
  identities?: Map<string, IdentityMatch>;
  now?: Date;
  skus: Set<string>;
}

export interface BatchRowContext {
  /** Lot numbers already on the product (Path 2 — blocked, not warned). */
  existingBatches?: string[];
  now?: Date;
}

function todayIso(now: Date): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Expiry must be strictly after today, matching the wizard's `>` comparison. */
export function isFutureDate(iso: string, now: Date = new Date()): boolean {
  return iso > todayIso(now);
}

function field(row: BatchDraft, name: string): string {
  return `batches.${row.id}.${name}`;
}

function hasContent(row: BatchDraft): boolean {
  return (
    row.batch.trim() !== "" ||
    row.expiry.trim() !== "" ||
    row.qty !== "" ||
    row.supplier.trim() !== "" ||
    row.notes.trim() !== ""
  );
}

/**
 * Rows a zero-stock or partially-filled draft should not be judged on: an empty
 * `+ Add batch` row is not a mistake, it is an empty row.
 */
export function activeRows(
  rows: BatchDraft[],
  opts: { allowIncomplete: boolean }
): BatchDraft[] {
  if (!opts.allowIncomplete) {
    return rows;
  }
  return rows.filter(hasContent);
}

export function validateBatchRows(
  rows: BatchDraft[],
  ctx: BatchRowContext & { allowIncomplete?: boolean } = {}
): DraftValidation {
  const now = ctx.now ?? new Date();
  const errors: DraftIssue[] = [];
  const warnings: DraftIssue[] = [];
  const active = activeRows(rows, {
    allowIncomplete: ctx.allowIncomplete ?? false,
  });
  const duplicateIndexes = new Set(duplicateBatchIndexes(active));
  const existing = new Set(
    (ctx.existingBatches ?? []).map((lot) => normalizeLot(lot))
  );

  for (const [index, row] of active.entries()) {
    const label = row.batch.trim() || `row ${index + 1}`;
    if (row.batch.trim() === "") {
      errors.push({
        field: field(row, "batch"),
        message: "Enter the lot number.",
        rowId: row.id,
      });
    } else if (existing.has(normalizeLot(row.batch))) {
      errors.push({
        field: field(row, "batch"),
        message: `${label} already exists on this product.`,
        rowId: row.id,
      });
    }
    if (duplicateIndexes.has(index)) {
      errors.push({
        field: field(row, "batch"),
        message: "Duplicate batch number on this product.",
        rowId: row.id,
      });
    }
    if (row.expiry.trim() === "") {
      errors.push({
        field: field(row, "expiry"),
        message: "Enter the expiry date.",
        rowId: row.id,
      });
    } else if (!isFutureDate(row.expiry, now)) {
      errors.push({
        field: field(row, "expiry"),
        message: "Expiry must be after today.",
        rowId: row.id,
      });
    }
    if (batchQty(row) < 1) {
      errors.push({
        field: field(row, "qty"),
        message: "Quantity must be at least 1.",
        rowId: row.id,
      });
    }
    if (row.supplier.trim() === "") {
      warnings.push({
        field: field(row, "supplier"),
        message: `${label} has no supplier of its own.`,
        rowId: row.id,
      });
    }
  }

  return { errors, warnings };
}

export function validateNewProduct(
  draft: ProductDraft,
  ctx: ProductContext
): ProductValidation {
  const now = ctx.now ?? new Date();
  const errors: DraftIssue[] = [];
  const warnings: DraftIssue[] = [];

  if (draft.name.trim() === "") {
    errors.push({ field: "name", message: "Enter the medicine name." });
  }
  if (draft.category.trim() === "") {
    errors.push({ field: "category", message: "Choose a category." });
  }

  const sku = draft.sku.trim();
  if (sku === "") {
    errors.push({ field: "sku", message: "Enter a stock code (SKU)." });
  } else if (ctx.skus.has(sku.toLowerCase())) {
    errors.push({
      field: "sku",
      message: `${sku} is already used by another product.`,
    });
  }

  let duplicateOf: IdentityMatch | null = null;
  for (const key of identityKeysOf(draft)) {
    const match = ctx.identities?.get(key);
    if (match) {
      duplicateOf = match;
      break;
    }
  }

  const rows = activeRows(draft.batches, { allowIncomplete: draft.zeroStock });
  if (rows.length === 0 && !draft.zeroStock) {
    errors.push({
      field: "batches",
      message: "Add at least one batch, or tick “Create with zero stock”.",
    });
  }
  const rowValidation = validateBatchRows(draft.batches, {
    allowIncomplete: draft.zeroStock,
    now,
  });
  errors.push(...rowValidation.errors);
  warnings.push(...rowValidation.warnings);

  if (draft.strengthValue.trim() === "" && draft.strengthUnit.trim() === "") {
    warnings.push({
      field: "strength",
      message: "Strength is blank — the label will just show the name.",
    });
  }
  if (draft.form.trim() === "") {
    warnings.push({ field: "form", message: "Dose form is blank." });
  }
  if (draft.packSize.trim() === "") {
    warnings.push({ field: "packSize", message: "Pack size is blank." });
  }
  // The pack pair rules V1–V6 (V3/V5 are warnings, the rest block).
  const packValidation = validatePackFields(draft);
  for (const [field, message] of Object.entries(packValidation.errors)) {
    if (message) {
      errors.push({ field, message });
    }
  }
  for (const message of packValidation.warnings) {
    warnings.push({ field: "packQty", message });
  }
  if (draft.supplier.trim() === "") {
    warnings.push({ field: "supplier", message: "Supplier is blank." });
  }
  if (draft.notes.trim() === "") {
    warnings.push({ field: "notes", message: "Notes are blank." });
  }
  if (draft.threshold === "") {
    warnings.push({
      field: "threshold",
      message: "Threshold left blank — it defaults to 20.",
    });
  }
  if (draft.zeroStock) {
    warnings.push({
      field: "zeroStock",
      message:
        "Created with no stock — it will show as Out until a delivery lands.",
    });
  }

  return {
    duplicateOf,
    errors,
    valid: errors.length === 0,
    warnings,
  };
}

export function validateAddition(
  draft: { batches: BatchDraft[]; itemId: string | null },
  ctx: BatchRowContext & { itemName?: string } = {}
): DraftValidation {
  const errors: DraftIssue[] = [];
  const warnings: DraftIssue[] = [];

  if (!draft.itemId) {
    errors.push({ field: "itemId", message: "Choose a product first." });
  }
  const rowValidation = validateBatchRows(draft.batches, {
    existingBatches: ctx.existingBatches,
    now: ctx.now,
  });
  errors.push(...rowValidation.errors);
  warnings.push(...rowValidation.warnings);

  return { errors, warnings };
}

export function mergeValidation(
  ...validations: DraftValidation[]
): DraftValidation {
  return {
    errors: validations.flatMap((validation) => validation.errors),
    warnings: validations.flatMap((validation) => validation.warnings),
  };
}

/** The name the review step and the toast use for a draft. */
export function draftLabel(draft: ProductDraft): string {
  const display = displayNameOf(draft);
  return display === "" ? "Untitled product" : display;
}
