import { cn } from "@cmis/ui/lib/utils";
import { type ChangeEvent, useCallback } from "react";

import type { ItemDraftErrors } from "../../../domain/item-update";
import { packSizeText } from "../../../domain/pack-size";
import {
  MEDICINE_FORMS,
  PACK_UNITS,
  STRENGTH_UNITS,
} from "../../../domain/vocabulary";
import { CategoryPicker } from "../../category-picker";
import { FIELD_CLASS, PACK_SIZE_MAX_LENGTH, SELECT_CLASS } from "../constants";
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
  error,
  unitError,
  onPackQtyChange,
  onPackUnitChange,
  packQty,
  packUnit,
}: {
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
    (event: ChangeEvent<HTMLSelectElement>) =>
      onPackUnitChange(event.target.value),
    [onPackUnitChange]
  );

  return (
    <>
      <label className="block font-medium text-caption text-foreground">
        Pack quantity
        <input
          aria-invalid={error !== undefined}
          className={cn(
            FIELD_CLASS,
            error !== undefined && "border-destructive"
          )}
          onChange={handleQtyChange}
          placeholder="10"
          type="number"
          value={packQty === "" ? "" : packQty}
        />
        {error ? <ValidationMessage message={error} /> : null}
      </label>
      <label className="block font-medium text-caption text-foreground">
        Pack unit
        <select
          aria-invalid={unitError !== undefined}
          className={SELECT_CLASS}
          onChange={handleUnitChange}
          value={packUnit}
        >
          <option value="">—</option>
          {PACK_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
        {unitError ? <ValidationMessage message={unitError} /> : null}
      </label>
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
  packErrors,
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
  /** The shared pack rules' errors, keyed by field (F7). */
  packErrors: ItemDraftErrors;
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
    (event: ChangeEvent<HTMLSelectElement>) =>
      onStrengthUnitChange(event.target.value),
    [onStrengthUnitChange]
  );
  const handleFormChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => onFormChange(event.target.value),
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
          <label className="block font-medium text-caption text-foreground">
            Strength unit
            <select
              className={SELECT_CLASS}
              onChange={handleStrengthUnitChange}
              value={strengthUnit}
            >
              <option value="">—</option>
              {STRENGTH_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-medium text-caption text-foreground">
            Form
            <select
              className={SELECT_CLASS}
              onChange={handleFormChange}
              value={form}
            >
              <option value="">—</option>
              {MEDICINE_FORMS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
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
            error={packErrors.packQty}
            onPackQtyChange={onPackQtyChange}
            onPackUnitChange={onPackUnitChange}
            packQty={packQty}
            packUnit={packUnit}
            unitError={packErrors.packUnit}
          />
        </div>
      </fieldset>
    </div>
  );
}
