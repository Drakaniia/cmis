import { identityKeysOf } from "./draft";
import type {
  SheetContext,
  SheetGroup,
  SheetIssue,
  SheetValidation,
} from "./sheet-types";
import {
  type DraftIssue,
  draftLabel,
  validateNewProduct,
} from "./validate-draft";

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
