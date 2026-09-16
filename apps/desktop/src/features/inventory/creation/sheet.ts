import {
  type BatchDraft,
  batchQty,
  type CreationDraft,
  identityKeysOf,
  newBatchDraftRow,
  newProductDraft,
  type ProductDraft,
} from "./draft";
import {
  activeRows,
  type DraftIssue,
  draftLabel,
  type IdentityMatch,
  validateNewProduct,
} from "./validate-draft";

/**
 * The delivery sheet's model (spec §7.4): N product groups, each holding its
 * own batch rows, plus the shared defaults that seed new groups.
 *
 * Everything here is pure, so the two mechanisms the spec insists are mentally
 * distinct stay demonstrably distinct: **defaults are a stencil** (they touch
 * only groups created after they were set) and **apply-to-selected** is the
 * explicit re-stamp. Keeping both in one testable module is what stops the grid
 * from quietly growing a third, accidental meaning.
 */

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

function nextGroupId(): string {
  groupCounter += 1;
  return `group-${groupCounter}`;
}

/**
 * A copy of a batch row without its lot number or row key: duplicating a
 * delivery rarely means "and the same lot again", which is blocked anyway.
 */
function copyBatchRow(row: BatchDraft): BatchDraft {
  return newBatchDraftRow({
    expiry: row.expiry,
    notes: row.notes,
    qty: row.qty,
    supplier: row.supplier,
  });
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

export function addSheetGroup(
  groups: SheetGroup[],
  defaults: SheetDefaults
): { group: SheetGroup; groups: SheetGroup[] } {
  const group = newSheetGroup(defaults);
  return { group, groups: [...groups, group] };
}

/**
 * A product-level edit. Touching one of the five shared-default fields marks it
 * overridden, which is what the grid renders as "set here" — and what
 * apply-to-selected is allowed to clear.
 */
export function patchSheetGroup(
  groups: SheetGroup[],
  groupId: string,
  patch: Partial<ProductDraft>
): SheetGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) {
      return group;
    }
    const touched = SHEET_DEFAULT_FIELDS.filter(
      (field) => patch[field] !== undefined
    );
    return {
      ...group,
      overridden: [...new Set([...group.overridden, ...touched])],
      product: { ...group.product, ...patch },
    };
  });
}

/**
 * A SKU the operator typed is theirs from then on, so `deriveSku` stops
 * overwriting it on the next name blur (spec §10.2).
 */
export function setGroupSku(
  groups: SheetGroup[],
  groupId: string,
  sku: string
): SheetGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, product: { ...group.product, sku }, skuTouched: true }
      : group
  );
}

export function setGroupBatches(
  groups: SheetGroup[],
  groupId: string,
  batches: BatchDraft[]
): SheetGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, product: { ...group.product, batches } }
      : group
  );
}

function mapBatches(
  groups: SheetGroup[],
  groupId: string,
  mapper: (batches: BatchDraft[]) => BatchDraft[]
): SheetGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? {
          ...group,
          product: { ...group.product, batches: mapper(group.product.batches) },
        }
      : group
  );
}

export function appendBatchRow(
  groups: SheetGroup[],
  groupId: string
): SheetGroup[] {
  return mapBatches(groups, groupId, (batches) => [
    ...batches,
    newBatchDraftRow(),
  ]);
}

export function duplicateBatchRow(
  groups: SheetGroup[],
  groupId: string,
  rowId: string
): SheetGroup[] {
  return mapBatches(groups, groupId, (batches) => {
    const index = batches.findIndex((row) => row.id === rowId);
    if (index === -1) {
      return batches;
    }
    const next = [...batches];
    next.splice(index + 1, 0, copyBatchRow(batches[index]));
    return next;
  });
}

export function removeBatchRow(
  groups: SheetGroup[],
  groupId: string,
  rowId: string
): SheetGroup[] {
  return mapBatches(groups, groupId, (batches) =>
    batches.filter((row) => row.id !== rowId)
  );
}

export function moveBatchRow(
  groups: SheetGroup[],
  groupId: string,
  rowId: string,
  delta: -1 | 1
): SheetGroup[] {
  return mapBatches(groups, groupId, (batches) => {
    const index = batches.findIndex((row) => row.id === rowId);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= batches.length) {
      return batches;
    }
    const next = [...batches];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return next;
  });
}

/**
 * The copy keeps everything except what makes the product itself — name, SKU and
 * the lot numbers. Anything else would either collide on identity or invent a
 * lot that was never delivered.
 */
export function duplicateSheetGroup(
  groups: SheetGroup[],
  groupId: string
): { group: SheetGroup | null; groups: SheetGroup[] } {
  const index = groups.findIndex((group) => group.id === groupId);
  if (index === -1) {
    return { group: null, groups };
  }
  const source = groups[index];
  const copy: SheetGroup = {
    id: nextGroupId(),
    overridden: [...source.overridden],
    product: {
      ...source.product,
      batches: source.product.batches.map(copyBatchRow),
      name: "",
      sku: "",
    },
    skuTouched: false,
  };
  const next = [...groups];
  next.splice(index + 1, 0, copy);
  return { group: copy, groups: next };
}

export function removeSheetGroup(
  groups: SheetGroup[],
  groupId: string
): SheetGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

export function moveSheetGroup(
  groups: SheetGroup[],
  groupId: string,
  delta: -1 | 1
): SheetGroup[] {
  const index = groups.findIndex((group) => group.id === groupId);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= groups.length) {
    return groups;
  }
  const next = [...groups];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/** Drag-and-drop reorder: the dragged group lands where it was dropped. */
export function reorderSheetGroups(
  groups: SheetGroup[],
  fromId: string,
  toId: string
): SheetGroup[] {
  const from = groups.findIndex((group) => group.id === fromId);
  const to = groups.findIndex((group) => group.id === toId);
  if (from === -1 || to === -1 || from === to) {
    return groups;
  }
  const next = [...groups];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Overrides only the selected groups, and only for the fields asked for. A blank
 * default is skipped rather than written, so "apply supplier" can never silently
 * erase a supplier the operator typed.
 */
export function applyDefaultsToGroups(
  groups: SheetGroup[],
  groupIds: readonly string[],
  defaults: SheetDefaults,
  fields: readonly SheetDefaultField[] = SHEET_DEFAULT_FIELDS
): SheetGroup[] {
  const wanted = new Set(groupIds);
  return groups.map((group) => {
    if (!wanted.has(group.id)) {
      return group;
    }
    return {
      ...group,
      overridden: group.overridden.filter((field) => !fields.includes(field)),
      product: applyDefaultFields(group.product, defaults, fields),
    };
  });
}

/** Rows a group actually writes: blank rows are not stock (matching §10.4). */
export function groupWritableRows(group: SheetGroup): BatchDraft[] {
  return activeRows(group.product.batches, {
    allowIncomplete: group.product.zeroStock,
  });
}

export function groupTotals(group: SheetGroup): {
  batches: number;
  units: number;
} {
  const rows = groupWritableRows(group);
  return {
    batches: rows.length,
    units: rows.reduce((sum, row) => sum + batchQty(row), 0),
  };
}

export function sheetTotals(groups: SheetGroup[]): SheetTotals {
  let batches = 0;
  let units = 0;
  for (const group of groups) {
    const totals = groupTotals(group);
    batches += totals.batches;
    units += totals.units;
  }
  return { batches, groups: groups.length, units };
}

export function groupsToDraft(groups: SheetGroup[]): CreationDraft {
  return {
    additions: [],
    newProducts: groups.map((group) => group.product),
  };
}

/**
 * Sheet-wide validation (spec §9.3, §10.1). Each group is judged against the
 * real inventory *and* against the groups above it, so two rows claiming the
 * same medicine or the same SKU block before the commit rather than racing
 * inside it.
 */
export function validateSheet(
  groups: SheetGroup[],
  ctx: SheetContext
): SheetValidation {
  const errors: SheetIssue[] = [];
  const warnings: SheetIssue[] = [];
  const sheetSkus = new Map<string, number>();
  const sheetIdentities = new Map<string, number>();

  for (const [index, group] of groups.entries()) {
    const attach = (issue: DraftIssue): SheetIssue => ({
      ...issue,
      groupId: group.id,
    });
    const result = validateNewProduct(group.product, {
      identities: ctx.identities,
      now: ctx.now,
      skus: ctx.skus,
    });
    errors.push(...result.errors.map(attach));
    warnings.push(...result.warnings.map(attach));

    const label = draftLabel(group.product);
    const key = identityKeysOf(group.product).find((candidate) =>
      ctx.identities?.has(candidate)
    );
    if (key) {
      const match = ctx.identities?.get(key);
      errors.push({
        field: "name",
        groupId: group.id,
        message: `${label} is already in inventory${
          match?.sku ? ` (${match.sku})` : ""
        } — add batches to it instead of creating a second product.`,
      });
    }

    const sku = group.product.sku.trim();
    if (sku !== "") {
      const takenAt = sheetSkus.get(sku.toLowerCase());
      if (takenAt === undefined) {
        sheetSkus.set(sku.toLowerCase(), index);
      } else {
        errors.push({
          field: "sku",
          groupId: group.id,
          message: `${sku} is already used by group ${takenAt + 1} on this sheet.`,
        });
      }
    }

    const repeated = identityKeysOf(group.product).find((candidate) => {
      const seenAt = sheetIdentities.get(candidate);
      return seenAt !== undefined && seenAt !== index;
    });
    if (repeated) {
      errors.push({
        field: "name",
        groupId: group.id,
        message: `${label} is the same medicine as group ${
          (sheetIdentities.get(repeated) ?? 0) + 1
        } on this sheet — merge their batches into one group.`,
      });
    }
    for (const candidate of identityKeysOf(group.product)) {
      if (!sheetIdentities.has(candidate)) {
        sheetIdentities.set(candidate, index);
      }
    }
  }

  return { errors, warnings };
}
