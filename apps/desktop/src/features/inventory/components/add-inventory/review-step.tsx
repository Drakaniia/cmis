import { Button } from "@cmis/ui/components/button";
import { useCallback, useMemo } from "react";
import { writableRows } from "../../creation/commit-creation";
import {
  type BatchDraft,
  batchQty,
  type CreationDraft,
  displayNameOf,
  type ProductDraft,
} from "../../creation/draft";
import type {
  DraftIssue,
  DraftValidation,
} from "../../creation/validate-draft";
import type { InventoryItem } from "../../types";
import { CARD_CLASS } from "./field-styles";
import {
  batchSummary,
  expMonthLabel,
  formatCount,
  plural,
} from "./summary-text";

/**
 * Spec §7.5 — the review step, shared by all three creation paths.
 *
 * It shows what is about to be written, not a summary of the form: every batch
 * row appears with its own quantity and expiry, and errors are buttons that lead
 * back to the row that produced them. Warnings are listed and never block.
 */

interface ReviewStepProps {
  draft: CreationDraft;
  items: InventoryItem[];
  onBack: () => void;
  onFix: (issue: DraftIssue) => void;
  onSubmit: () => void;
  pending: boolean;
  validation: DraftValidation;
}

interface ReviewGroup {
  batches: BatchDraft[];
  existingQty: number | null;
  key: string;
  label: string;
  meta: string;
}

function groupFromProduct(product: ProductDraft, index: number): ReviewGroup {
  const batches = writableRows(product);
  const label = displayNameOf(product);
  return {
    batches,
    existingQty: null,
    key: `new-${product.sku.trim()}-${index}`,
    label: label === "" ? "Untitled product" : label,
    meta: [product.category.trim(), product.sku.trim()]
      .filter((part) => part !== "")
      .join(" · "),
  };
}

export function ReviewStep({
  draft,
  items,
  onBack,
  onFix,
  onSubmit,
  pending,
  validation,
}: ReviewStepProps) {
  const products = useMemo(
    () => draft.newProducts.map(groupFromProduct),
    [draft.newProducts]
  );

  const additions = useMemo<ReviewGroup[]>(
    () =>
      draft.additions.map((addition, index) => {
        const item = items.find((entry) => entry.id === addition.itemId);
        return {
          batches: addition.batches,
          existingQty: item?.qty ?? null,
          key: `add-${addition.itemId}-${index}`,
          // The full label, not the bare name: the review is the last chance to
          // notice that the wrong strength is about to gain batches (§8.2).
          label: item?.displayName ?? "Existing product",
          meta: [
            item?.sku ?? "",
            item ? `${formatCount(item.qty)} in stock` : "",
          ]
            .filter((part) => part !== "")
            .join(" · "),
        };
      }),
    [draft.additions, items]
  );

  const batchCount = [...products, ...additions].reduce(
    (sum, group) => sum + group.batches.length,
    0
  );
  const productCount = products.length + additions.length;
  const blocked = validation.errors.length > 0;

  const handleFix = useCallback(
    (issue: DraftIssue) => () => onFix(issue),
    [onFix]
  );

  return (
    <div className="space-y-4">
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {plural(productCount, "product", "products")} ·{" "}
        {plural(batchCount, "batch", "batches")} ready to create
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <GroupColumn groups={products} title="New products" />
        <GroupColumn groups={additions} title="Additions to existing" />
      </div>

      {validation.warnings.length > 0 ? (
        <section className={CARD_CLASS}>
          <h3 className="font-medium text-caption text-foreground">
            {plural(validation.warnings.length, "warning", "warnings")} — these
            never block creation
          </h3>
          <ul className="mt-1 space-y-0.5">
            {validation.warnings.map((warning) => (
              <li
                className="text-caption text-muted-foreground"
                key={`${warning.field}-${warning.message}`}
              >
                • {warning.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {blocked ? (
        <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <h3 className="font-medium text-caption text-destructive">
            Fix these before creating
          </h3>
          <ul className="mt-1 space-y-1">
            {validation.errors.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>
                <button
                  className="press-feedback text-left text-caption text-destructive underline"
                  onClick={handleFix(issue)}
                  type="button"
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onBack} type="button" variant="ghost">
          Back to edit
        </Button>
        <Button
          className="press-feedback"
          disabled={blocked || pending}
          onClick={onSubmit}
          type="button"
        >
          {pending
            ? "Creating…"
            : `Create all (${plural(productCount, "product", "products")}, ${plural(batchCount, "batch", "batches")})`}
        </Button>
      </div>
    </div>
  );
}

function GroupColumn({
  groups,
  title,
}: {
  groups: ReviewGroup[];
  title: string;
}) {
  return (
    <section className={CARD_CLASS}>
      <h3 className="font-medium text-caption text-foreground">
        {title} ({groups.length})
      </h3>
      {groups.length === 0 ? (
        <p className="mt-1 text-caption text-muted-foreground">None.</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {groups.map((group) => (
            <li key={group.key}>
              <p className="font-medium text-sm">{group.label}</p>
              <p className="text-caption text-muted-foreground">
                {batchSummary(group.batches)}
                {group.existingQty === null
                  ? ""
                  : ` (existing qty ${formatCount(group.existingQty)} → ${formatCount(
                      group.existingQty +
                        group.batches.reduce(
                          (sum, row) => sum + batchQty(row),
                          0
                        )
                    )})`}
              </p>
              {group.meta === "" ? null : (
                <p className="text-caption text-muted-foreground">
                  {group.meta}
                </p>
              )}
              <ul className="mt-1 space-y-0.5">
                {group.batches.map((batch) => (
                  <li
                    className="flex items-center justify-between gap-2 text-caption text-muted-foreground"
                    key={batch.id}
                  >
                    <span className="truncate">
                      batch {batch.batch.trim() || "—"}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCount(batchQty(batch))} units
                      {batch.expiry
                        ? ` · exp ${expMonthLabel(batch.expiry)}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
