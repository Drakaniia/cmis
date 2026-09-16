import {
  hasStrengthColumns,
  identityKeysOf as identityKeysForParts,
} from "../domain/identity";
import { composeDisplayName } from "../domain/strength";

/**
 * The draft a creation page holds before anything is written (spec §7.2–§7.4).
 *
 * It is deliberately a plain, serialisable shape with no IDs from the database:
 * a draft is *about* products, and only the commit step decides what to insert.
 * Pure helpers live here so the form, the review step and the tests all agree on
 * how a draft adds up.
 */

/** Product threshold default — the schema's own default (`0002_inventory.sql`). */
export const DEFAULT_THRESHOLD = 20;

export interface BatchDraft {
  batch: string;
  expiry: string;
  /** Local row key only; never written to the database. */
  id: string;
  notes: string;
  /** `""` means "not typed yet", which is what blocks submit. */
  qty: number | "";
  supplier: string;
}

export interface ProductDraft {
  batches: BatchDraft[];
  category: string;
  form: string;
  name: string;
  notes: string;
  packSize: string;
  sku: string;
  strengthUnit: string;
  strengthValue: string;
  /** Product-level supplier; a batch row's supplier overrides it when set. */
  supplier: string;
  threshold: number | "";
  /** Register the medicine with no stock at all (`needs_batch = 1`, status `out`). */
  zeroStock: boolean;
}

export interface BatchAdditionDraft {
  batches: BatchDraft[];
  itemId: string;
}

/** Everything one commit writes; the delivery sheet (§7.4) fills the same shape. */
export interface CreationDraft {
  additions: BatchAdditionDraft[];
  newProducts: ProductDraft[];
}

/**
 * What an identity key is built from.
 *
 * `dosage` is the legacy flat string, kept optional for exactly one situation:
 * resolving a product against a row the backfill has not reached yet. Nothing
 * writes a new `dosage` any more (decision 5).
 */
export interface IdentityInput {
  dosage?: string;
  form: string;
  name: string;
  packSize: string;
  strengthUnit: string;
  strengthValue: string;
}

let rowCounter = 0;

/** Stable-per-session row key; React needs one and it must not be the lot number. */
export function newBatchDraftRow(seed: Partial<BatchDraft> = {}): BatchDraft {
  rowCounter += 1;
  return {
    batch: "",
    expiry: "",
    id: `row-${rowCounter}`,
    notes: "",
    qty: "",
    supplier: "",
    ...seed,
  };
}

export function newProductDraft(): ProductDraft {
  return {
    batches: [newBatchDraftRow()],
    category: "",
    form: "",
    name: "",
    notes: "",
    packSize: "",
    sku: "",
    strengthUnit: "",
    strengthValue: "",
    supplier: "",
    threshold: DEFAULT_THRESHOLD,
    zeroStock: false,
  };
}

/** A typed qty, or 0 while the operator has not filled it in yet. */
export function batchQty(row: BatchDraft): number {
  return row.qty === "" ? 0 : row.qty;
}

export function draftTotalQty(batches: BatchDraft[]): number {
  return batches.reduce((sum, row) => sum + batchQty(row), 0);
}

export function draftBatchCount(batches: BatchDraft[]): number {
  return batches.length;
}

/** Earliest future expiry in the draft, or `null` when none is usable yet. */
export function earliestExpiry(batches: BatchDraft[]): string | null {
  const dates = batches
    .map((row) => row.expiry)
    .filter((expiry) => expiry.trim() !== "")
    .sort((a, b) => a.localeCompare(b));
  return dates[0] ?? null;
}

export function thresholdOf(draft: ProductDraft): number {
  return draft.threshold === "" ? DEFAULT_THRESHOLD : draft.threshold;
}

/** `name + strength + form + pack size`, the full display label (spec §5). */
export function displayNameOf(input: IdentityInput): string {
  return composeDisplayName(input);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Lot numbers are compared case- and whitespace-insensitively. */
export function normalizeLot(value: string): string {
  return normalize(value);
}

/**
 * Every key a product could be recognised by (spec §10.1, decision 9).
 *
 * The canonical and label keys come from `domain/identity.ts`, which is the same
 * pair the importer and the backfill use — that shared implementation is what
 * makes "import → backfill → re-import inserts nothing" true rather than
 * hopeful (§7.1). The legacy `dosage` key is added only while a row's strength
 * columns are still empty, so an un-backfilled database is still matched.
 */
export function identityKeysOf(input: IdentityInput): string[] {
  if (normalize(input.name) === "") {
    return [];
  }
  const keys = identityKeysForParts(input);
  if (!hasStrengthColumns(input)) {
    const dosage = normalize(input.dosage ?? "");
    if (dosage !== "") {
      keys.push(`${normalize(input.name)}|${dosage}`);
    }
  }
  return keys;
}

/** Row indexes whose lot number appears more than once, in draft order. */
export function duplicateBatchIndexes(rows: BatchDraft[]): number[] {
  const seen = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = normalize(row.batch);
    if (key === "") {
      return;
    }
    seen.set(key, [...(seen.get(key) ?? []), index]);
  });
  const duplicates: number[] = [];
  for (const indexes of seen.values()) {
    if (indexes.length > 1) {
      duplicates.push(...indexes);
    }
  }
  return duplicates.sort((a, b) => a - b);
}

export function emptyDraft(): CreationDraft {
  return { additions: [], newProducts: [] };
}
