import { cn } from "@cmis/ui/lib/utils";
import { type ChangeEvent, useCallback } from "react";

import { MEDICINE_FORMS, STRENGTH_UNITS } from "../../../domain/vocabulary";
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
 */
export function StepDetails({
  itemName,
  preFilled,
  category,
  form,
  packSize,
  strengthUnit,
  strengthValue,
  showErrors,
  onNameChange,
  onCategoryChange,
  onFormChange,
  onPackSizeChange,
  onStrengthUnitChange,
  onStrengthValueChange,
}: {
  itemName: string;
  preFilled: boolean;
  category: InventoryCategory;
  form: string;
  packSize: string;
  strengthUnit: string;
  strengthValue: string;
  showErrors: boolean;
  onNameChange: (value: string) => void;
  onCategoryChange: (value: InventoryCategory) => void;
  onFormChange: (value: string) => void;
  onPackSizeChange: (value: string) => void;
  onStrengthUnitChange: (value: string) => void;
  onStrengthValueChange: (value: string) => void;
}) {
  const nameMissing = showErrors && itemName.trim().length === 0;
  const packTooLong = packSize.trim().length > PACK_SIZE_MAX_LENGTH;

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
              value={packSize}
            />
            {packTooLong ? (
              <ValidationMessage
                message={`Pack size must be ${PACK_SIZE_MAX_LENGTH} characters or fewer.`}
              />
            ) : null}
          </label>
        </div>
      </fieldset>
    </div>
  );
}
