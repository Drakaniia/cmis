import { cn } from "@cmis/ui/lib/utils";
import { type ChangeEvent, useCallback } from "react";

import type { ItemDraftErrors } from "../../../domain/item-update";
import { packSizeText } from "../../../domain/pack-size";
import { CategoryPicker } from "../../category-picker";
import { VocabularyPicker } from "../../vocabulary-picker";
import { FIELD_CLASS, PACK_SIZE_MAX_LENGTH } from "../constants";
import type { InventoryCategory } from "../types";
import { ValidationMessage } from "./validation-message";

/**
 * Step 2 — Item Details, replacing the dead Unit dropdown with the four fields
 * the template actually stores (decision 15).
 *
 * All four are optional and never block Next (decision 7): a delivery arrives
 * with a lot number and a count, and refusing to record it because nobody typed
 * a pack size would be worse than an incomplete row. Rows that stay incomplete
 * are flagged through `dosage_missing` instead.
 *
 * The **structured pack pair** (pack-size F3, D4) is collected here too. The
 * pack-size text above it is the leftover bucket the split produced, so the
 * multiple arithmetic reads has to be typed as a number and a container — it is
 * what lets the delivery step turn a box into base units (F4).
 */

/**
 * The pack pair, module level so React never remounts the inputs mid-edit (and
 * never drops focus) when the step re-renders on each keystroke. The values are
 * plain (not events), so the step above stays a form and owns no handlers.
 */
function PackPairFields({
  disabled,
  error,
  unitError,
  onPackQtyChange,
  onPackUnitChange,
  packQty,
  packUnit,
}: {
  /** V4 — the dose form is "box", so no pack can be recorded at all. */
  disabled?: boolean;
  /** V1–V6, from the shared `validatePackFields`, keyed by field. */
  error?: string;
  unitError?: string;
  onPackQtyChange: (value: number | "") => void;
  onPackUnitChange: (value: string) => void;
  packQty: number | "";
  packUnit: string;
}) {
  const handleQtyChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      // `""` is the pair's "not recorded", never `NaN`: a cleared field must
      // store nothing rather than a non-integer (F2).
      const raw = event.target.value.trim();
      const parsed = Number(raw);
      onPackQtyChange(raw === "" || !Number.isFinite(parsed) ? "" : parsed);
    },
    [onPackQtyChange]
  );
  const handleUnitChange = useCallback(
    (value: string) => onPackUnitChange(value),
    [onPackUnitChange]
  );

  return (
    <>
      <label
        className={cn(
          "block font-medium text-caption text-foreground",
          disabled && "opacity-50"
        )}
      >
        Pack quantity
        <input
          aria-invalid={error !== undefined}
          className={cn(
            FIELD_CLASS,
            error !== undefined && "border-destructive",
            disabled && "cursor-not-allowed bg-muted"
          )}
          disabled={disabled}
          onChange={handleQtyChange}
          placeholder="10"
          type="number"
          value={packQty === "" ? "" : packQty}
        />
        {error ? <ValidationMessage message={error} /> : null}
      </label>
      {/* A picker, not a `<select>`: the container list is editable, and V6
          refuses a pack unit that is not in it — so a clinic whose container is
          missing needs somewhere to add it without abandoning the delivery. */}
      <VocabularyPicker
        disabled={disabled}
        error={unitError}
        kind="pack_unit"
        name="stock-in-pack-unit"
        onChange={handleUnitChange}
        value={packUnit}
      />
    </>
  );
}

export function StepDetails({
  itemName,
  preFilled,
  category,
  form,
  packQty,
  packSize,
  packUnit,
  strengthUnit,
  strengthValue,
  showErrors,
  packDisabled,
  packErrors,
  packWarnings,
  onNameChange,
  onCategoryChange,
  onFormChange,
  onPackQtyChange,
  onPackSizeChange,
  onPackUnitChange,
  onStrengthUnitChange,
  onStrengthValueChange,
}: {
  itemName: string;
  preFilled: boolean;
  category: InventoryCategory;
  form: string;
  packQty: number | "";
  packSize: string;
  packUnit: string;
  strengthUnit: string;
  strengthValue: string;
  showErrors: boolean;
  /** V4 — the chosen dose form is "box", so the pack pair cannot be recorded. */
  packDisabled: boolean;
  /** The shared pack rules' errors, keyed by field (F7). */
  packErrors: ItemDraftErrors;
  /** Soft pack notes (V3, V5) — shown, never blocking. */
  packWarnings: readonly string[];
  onNameChange: (value: string) => void;
  onCategoryChange: (value: InventoryCategory) => void;
  onFormChange: (value: string) => void;
  onPackQtyChange: (value: number | "") => void;
  onPackSizeChange: (value: string) => void;
  onPackUnitChange: (value: string) => void;
  onStrengthUnitChange: (value: string) => void;
  onStrengthValueChange: (value: string) => void;
}) {
  const nameMissing = showErrors && itemName.trim().length === 0;
  const categoryMissing = showErrors && category.trim().length === 0;
  // The pair's own text, when it has one (D24) — what the column will store.
  const derivedPackSize = packSizeText({ packQty, packUnit });
  const packTooLong =
    derivedPackSize === "" && packSize.trim().length > PACK_SIZE_MAX_LENGTH;

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onNameChange(event.target.value),
    [onNameChange]
  );
  const handleStrengthValueChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onStrengthValueChange(event.target.value),
    [onStrengthValueChange]
  );
  const handleStrengthUnitChange = useCallback(
    (value: string) => onStrengthUnitChange(value),
    [onStrengthUnitChange]
  );
  const handleFormChange = useCallback(
    (value: string) => onFormChange(value),
    [onFormChange]
  );
  const handlePackSizeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onPackSizeChange(event.target.value),
    [onPackSizeChange]
  );
  const handleCategoryChange = useCallback(
    (value: string) => onCategoryChange(value),
    [onCategoryChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 2 — Item Details {preFilled ? "(pre-filled)" : ""}
      </h3>
      <label className="block font-medium text-caption text-foreground">
        Item name
        <input
          className={cn(FIELD_CLASS, nameMissing && "border-destructive")}
          onChange={handleNameChange}
          placeholder="e.g., Paracetamol"
          value={itemName}
        />
        {nameMissing ? <ValidationMessage message="Name required." /> : null}
      </label>
      {/* The list is editable from here, so a delivery that introduces a new
          grouping does not have to be recorded as the wrong one (§7.3). */}
      <CategoryPicker
        error={categoryMissing ? "Category is required." : undefined}
        invalid={categoryMissing}
        label="Category"
        name="stock-in-category"
        onChange={handleCategoryChange}
        placeholder="Select category"
        value={category}
      />
      <fieldset className="space-y-2 rounded-md border border-border/50 p-3">
        <legend className="px-1 text-caption text-muted-foreground">
          Strength &amp; form <span>(all optional)</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-medium text-caption text-foreground">
            Strength value
            <input
              className={FIELD_CLASS}
              onChange={handleStrengthValueChange}
              placeholder="500 or 200/200/5"
              value={strengthValue}
            />
          </label>
          {/* Both lists are editable from here, for the same reason the category
              one is: a delivery that names a unit or a form the shipped list
              does not have would otherwise have to be recorded as the wrong
              one, and `baseUnitFor` renders an unknown form as a bare `unit` in
              every quantity on screen. */}
          <VocabularyPicker
            kind="strength_unit"
            name="stock-in-strength-unit"
            onChange={handleStrengthUnitChange}
            value={strengthUnit}
          />
          <VocabularyPicker
            kind="form"
            name="stock-in-form"
            onChange={handleFormChange}
            value={form}
          />
          <label className="block font-medium text-caption text-foreground">
            Pack size
            <input
              className={cn(FIELD_CLASS, packTooLong && "border-destructive")}
              onChange={handlePackSizeChange}
              placeholder="(100/box)"
              readOnly={derivedPackSize !== ""}
              value={derivedPackSize === "" ? packSize : derivedPackSize}
            />
            <span className="mt-1 block text-caption text-muted-foreground">
              {derivedPackSize === ""
                ? "Legacy text — kept as typed while the pair below is blank."
                : `Reads as ${derivedPackSize}, derived from the pair.`}
            </span>
            {packTooLong ? (
              <ValidationMessage
                message={`Pack size must be ${PACK_SIZE_MAX_LENGTH} characters or fewer.`}
              />
            ) : null}
          </label>

          {/* F3/D4 — the multiple arithmetic reads. The text above follows it.
              Each rule is shown under the field it asks the operator to fix, and
              as soon as it is broken: Next is disabled by these, so a message
              held back until Next would leave the step looking stuck. */}
          <PackPairFields
            disabled={packDisabled}
            error={packErrors.packQty}
            onPackQtyChange={onPackQtyChange}
            onPackUnitChange={onPackUnitChange}
            packQty={packQty}
            packUnit={packUnit}
            unitError={packErrors.packUnit}
          />
        </div>

        {/* V4 — the compatibility rule, stated where the operator met it. The
            pair above is disabled rather than merely warned, so an invalid
            selection cannot be made and there is nothing to submit. */}
        {packDisabled ? (
          <p
            className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2.5 py-1.5 text-[var(--warning)] text-caption"
            role="status"
          >
            “{form.trim() || "Box"}” is its own base unit, so a pack quantity
            and pack unit do not apply. The pack fields are disabled — choose a
            different form to record a pack.
          </p>
        ) : null}

        {/* V3/V5 — soft notes on a pair that is usable, so "a pack of 1" and
            "a bulk form" read as guidance rather than as a hidden rule. */}
        {packWarnings.map((warning) => (
          <p
            className="text-[var(--warning)] text-caption"
            key={warning}
            role="status"
          >
            {warning}
          </p>
        ))}
      </fieldset>
    </div>
  );
}
