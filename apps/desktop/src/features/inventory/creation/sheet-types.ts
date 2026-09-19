import type { ProductDraft } from "./draft";
import type { DraftIssue, IdentityMatch } from "./validate-draft";

/** The five headers the strip can stamp — decision 38 keeps threshold among them. */
export const SHEET_DEFAULT_FIELDS = [
  "category",
  "form",
  "strengthUnit",
  "supplier",
  "threshold",
] as const;

export type SheetDefaultField = (typeof SHEET_DEFAULT_FIELDS)[number];

export type SheetDefaults = Pick<ProductDraft, SheetDefaultField>;

export interface SheetGroup {
  /** Local row key only; never written to the database. */
  id: string;
  /** Fields the operator typed by hand — shown marked, cleared on re-stamp. */
  overridden: SheetDefaultField[];
  product: ProductDraft;
  /** Once true the SKU is the operator's, so `deriveSku` never overwrites it. */
  skuTouched: boolean;
}

export interface SheetTotals {
  batches: number;
  groups: number;
  units: number;
}

export interface SheetIssue extends DraftIssue {
  /** Which group produced the issue, so the review step can jump back to it. */
  groupId: string;
}

export interface SheetValidation {
  errors: SheetIssue[];
  warnings: SheetIssue[];
}

export interface SheetContext {
  identities?: Map<string, IdentityMatch>;
  now?: Date;
  skus: Set<string>;
}
