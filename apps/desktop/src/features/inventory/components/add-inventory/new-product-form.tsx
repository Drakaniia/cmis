import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { type FormEvent, useCallback, useMemo, useState } from "react";
import {
  batchQty,
  DEFAULT_THRESHOLD,
  displayNameOf,
  type ProductDraft,
} from "../../creation/draft";
import {
  type IdentityMatch,
  type ProductContext,
  validateNewProduct,
} from "../../creation/validate-draft";
import { MEDICINE_FORMS, STRENGTH_UNITS } from "../../domain/vocabulary";
import { deriveSku } from "../../import/sku";
import { CategoryPicker } from "../category-picker";
import { BatchRowsEditor } from "./batch-rows-editor";
import { CARD_CLASS } from "./field-styles";
import {
  CheckField,
  SelectField,
  StepperField,
  TextAreaField,
  TextField,
} from "./fields";
import { formatCount } from "./summary-text";

/**
 * Spec §7.2 — Path 1: one product, N batches, filled top to bottom and then
 * reviewed. Deliberately a form rather than a wizard: nothing here is
 * transactional until `Review` is pressed.
 */

/**
 * `categories` is deliberately absent: the picker reads the shared category
 * query itself, so there is no second copy of the list to pass down.
 */
export interface ProductFormContext extends ProductContext {
  /** SKUs as stored, for `deriveSku`'s collision loop. */
  rawSkus: Set<string>;
  suppliers: string[];
}

interface NewProductFormProps {
  context: ProductFormContext;
  draft: ProductDraft;
  highlightRowId?: string | null;
  onAddBatchesInstead: (match: IdentityMatch) => void;
  onCancel: () => void;
  onChange: (draft: ProductDraft) => void;
  onSubmit: () => void;
}

const STRENGTH_UNIT_OPTIONS = STRENGTH_UNITS.map((unit) => ({
  label: unit,
  value: unit,
}));

const FORM_OPTIONS = MEDICINE_FORMS.map((form) => ({
  label: form,
  value: form,
}));

function errorFor(
  validation: ReturnType<typeof validateNewProduct>,
  field: string
): string | null {
  return (
    validation.errors.find((issue) => issue.field === field)?.message ?? null
  );
}

export function NewProductForm({
  context,
  draft,
  highlightRowId,
  onAddBatchesInstead,
  onCancel,
  onChange,
  onSubmit,
}: NewProductFormProps) {
  // The SKU is prefilled from the name until the operator types one of their
  // own — from then on it is theirs, and a collision is surfaced rather than
  // silently suffixed (spec §10.2).
  const [skuTouched, setSkuTouched] = useState(draft.sku.trim() !== "");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const validation = useMemo(
    () =>
      validateNewProduct(draft, {
        identities: context.identities,
        skus: context.skus,
      }),
    [context.identities, context.skus, draft]
  );

  const markTouched = useCallback(
    (field: string) =>
      setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true })),
    []
  );
  const shouldShow = useCallback(
    (field: string) => submitAttempted || Boolean(touched[field]),
    [submitAttempted, touched]
  );

  const totalQty = useMemo(
    () => draft.batches.reduce((sum, row) => sum + batchQty(row), 0),
    [draft.batches]
  );

  const patch = useCallback(
    (updates: Partial<ProductDraft>) => {
      onChange({ ...draft, ...updates });
    },
    [draft, onChange]
  );

  const setName = useCallback(
    (value: string) => {
      markTouched("name");
      patch({ name: value });
    },
    [markTouched, patch]
  );
  const setSku = useCallback(
    (value: string) => {
      setSkuTouched(true);
      markTouched("sku");
      patch({ sku: value });
    },
    [markTouched, patch]
  );
  const setCategory = useCallback(
    (value: string) => {
      markTouched("category");
      patch({ category: value });
    },
    [markTouched, patch]
  );
  const setStrengthValue = useCallback(
    (value: string) => patch({ strengthValue: value }),
    [patch]
  );
  const setStrengthUnit = useCallback(
    (value: string) => patch({ strengthUnit: value }),
    [patch]
  );
  const setForm = useCallback(
    (value: string) => patch({ form: value }),
    [patch]
  );
  const setPackSize = useCallback(
    (value: string) => patch({ packSize: value }),
    [patch]
  );
  const setThreshold = useCallback(
    (value: number | "") => patch({ threshold: value }),
    [patch]
  );
  const setNotes = useCallback(
    (value: string) => patch({ notes: value }),
    [patch]
  );
  const setZeroStock = useCallback(
    (value: boolean) => patch({ zeroStock: value }),
    [patch]
  );
  const setBatches = useCallback(
    (batches: ProductDraft["batches"]) => patch({ batches }),
    [patch]
  );

  const handleNameBlur = useCallback(() => {
    markTouched("name");
    if (skuTouched || draft.name.trim() === "") {
      return;
    }
    patch({ sku: deriveSku(draft.name, draft.strengthValue, context.rawSkus) });
  }, [context.rawSkus, draft, markTouched, patch, skuTouched]);

  const handleAddBatches = useCallback(() => {
    if (validation.duplicateOf) {
      onAddBatchesInstead(validation.duplicateOf);
    }
  }, [onAddBatchesInstead, validation.duplicateOf]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (validation.valid) {
        onSubmit();
        return;
      }
      setSubmitAttempted(true);
      setTouched((prev) => ({
        ...prev,
        category: true,
        name: true,
        sku: true,
      }));
    },
    [onSubmit, validation.valid]
  );

  const nameError = shouldShow("name") ? errorFor(validation, "name") : null;
  const categoryError = shouldShow("category")
    ? errorFor(validation, "category")
    : null;
  const skuError = shouldShow("sku") ? errorFor(validation, "sku") : null;
  const displayName = displayNameOf(draft);
  const visibleErrors = submitAttempted ? validation.errors : [];

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {validation.duplicateOf ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-sm"
          role="alert"
        >
          <span className="flex-1">
            <strong>{draft.name.trim()}</strong> already exists
            {validation.duplicateOf.sku
              ? ` (${validation.duplicateOf.sku})`
              : ""}
            . Add batches to it instead?
          </span>
          <Button
            className="press-feedback"
            onClick={handleAddBatches}
            size="sm"
            variant="outline"
          >
            Add batches
          </Button>
        </div>
      ) : null}

      <section className={cn(CARD_CLASS, "space-y-3")}>
        <h2 className="font-semibold text-sm">Product</h2>

        <TextField
          error={nameError}
          hint={displayName === "" ? null : `Listed as: ${displayName}`}
          label="Medication name"
          name="new-product-name"
          onBlur={handleNameBlur}
          onChange={setName}
          placeholder="e.g., Paracetamol"
          value={draft.name}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            error={skuError}
            hint="Prefilled from the name — edit it freely."
            label="Stock code (SKU)"
            name="new-product-sku"
            onChange={setSku}
            placeholder="SKU-…"
            value={draft.sku}
          />

          <CategoryPicker
            error={categoryError}
            hint="Add one from the list if yours is missing."
            label="Category"
            name="new-product-category"
            onChange={setCategory}
            placeholder="Choose a category"
            value={draft.category}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <TextField
            label="Strength"
            name="new-product-strength"
            onChange={setStrengthValue}
            placeholder="500"
            value={draft.strengthValue}
          />
          <SelectField
            label="Unit"
            name="new-product-strength-unit"
            onChange={setStrengthUnit}
            options={STRENGTH_UNIT_OPTIONS}
            placeholder="—"
            value={draft.strengthUnit}
          />
          <SelectField
            label="Form"
            name="new-product-form"
            onChange={setForm}
            options={FORM_OPTIONS}
            placeholder="—"
            value={draft.form}
          />
          <TextField
            label="Pack size"
            name="new-product-pack-size"
            onChange={setPackSize}
            placeholder="10/box"
            value={draft.packSize}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StepperField
            ariaLabel="Low-stock threshold"
            hint="Flags the product as Low once stock drops below this."
            label="Low-stock threshold"
            min={0}
            name="new-product-threshold"
            onChange={setThreshold}
            placeholder={String(DEFAULT_THRESHOLD)}
            value={draft.threshold}
          />
        </div>

        <TextAreaField
          label={
            <>
              Notes <span className="text-muted-foreground">(optional)</span>
            </>
          }
          name="new-product-notes"
          onChange={setNotes}
          placeholder="Handling notes, storage…"
          value={draft.notes}
        />

        <CheckField
          checked={draft.zeroStock}
          label="Create with zero stock (register it before the delivery arrives)"
          name="new-product-zero-stock"
          onChange={setZeroStock}
        />
      </section>

      <section className={cn(CARD_CLASS, "space-y-3")}>
        <BatchRowsEditor
          allowEmpty={draft.zeroStock}
          batches={draft.batches}
          highlightRowId={highlightRowId}
          onChange={setBatches}
          showErrors={submitAttempted}
          validation={validation}
        />
        <p className="text-caption text-muted-foreground">
          Total quantity (from batches):{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatCount(totalQty)}
          </span>
        </p>
      </section>

      {visibleErrors.length > 0 ? (
        <ul className="space-y-1" role="alert">
          {visibleErrors.map((issue) => (
            <li className="text-caption text-destructive" key={issue.field}>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          Back
        </Button>
        <Button className="press-feedback" type="submit">
          Review
        </Button>
      </div>
    </form>
  );
}
