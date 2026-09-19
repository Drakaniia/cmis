import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { cn } from "@cmis/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useCallback } from "react";
import { DEFAULT_THRESHOLD } from "../../creation/draft";
import {
  SHEET_DEFAULT_FIELDS,
  type SheetDefaultField,
  type SheetDefaults,
} from "../../creation/sheet-types";
import { MEDICINE_FORMS, STRENGTH_UNITS } from "../../domain/vocabulary";
import { CategoryPicker } from "../category-picker";
import { CARD_CLASS } from "./field-styles";
import { SelectField, StepperField } from "./fields";
import { plural } from "./summary-text";

/**
 * Spec §7.4 — the strip that seeds new groups, and the one button that re-stamps
 * groups that already exist.
 *
 * The two mechanisms are deliberately kept apart, because conflating them is
 * what makes a spreadsheet-style grid unpredictable: setting a supplier here
 * never rewrites a row the operator already filled in.
 */

const FIELD_LABELS: Record<SheetDefaultField, string> = {
  category: "Category",
  form: "Form",
  strengthUnit: "Strength unit",
  supplier: "Supplier",
  threshold: "Threshold",
};

const ALL_FIELDS = [...SHEET_DEFAULT_FIELDS];

const FORM_OPTIONS = MEDICINE_FORMS.map((form) => ({
  label: form,
  value: form,
}));

const UNIT_OPTIONS = STRENGTH_UNITS.map((unit) => ({
  label: unit,
  value: unit,
}));

/** One field in the "Apply to selected" menu, with a handler stable per field. */
function ApplyFieldItem({
  field,
  onApply,
}: {
  field: SheetDefaultField;
  onApply: (fields: SheetDefaultField[]) => void;
}) {
  const handleClick = useCallback(() => onApply([field]), [field, onApply]);
  return (
    <DropdownMenuItem onClick={handleClick}>
      Apply {FIELD_LABELS[field]}
    </DropdownMenuItem>
  );
}

export function SheetDefaultsStrip({
  defaults,
  groupCount,
  onChange,
  onApply,
  selectedCount,
}: {
  defaults: SheetDefaults;
  groupCount: number;
  onChange: (next: SheetDefaults) => void;
  onApply: (fields: SheetDefaultField[]) => void;
  selectedCount: number;
  suppliers?: string[];
}) {
  const setCategory = useCallback(
    (value: string) => onChange({ ...defaults, category: value }),
    [defaults, onChange]
  );
  const setThreshold = useCallback(
    (value: number | "") => onChange({ ...defaults, threshold: value }),
    [defaults, onChange]
  );
  const setForm = useCallback(
    (value: string) => onChange({ ...defaults, form: value }),
    [defaults, onChange]
  );
  const setStrengthUnit = useCallback(
    (value: string) => onChange({ ...defaults, strengthUnit: value }),
    [defaults, onChange]
  );

  const handleApplyAll = useCallback(() => onApply(ALL_FIELDS), [onApply]);

  const hint =
    groupCount === 0
      ? "Applies to rows you add from now on."
      : `Applies to new rows · ${plural(
          groupCount,
          "existing row",
          "existing rows"
        )} unaffected · Apply to selected to change them`;

  return (
    <section
      aria-label="Shared defaults"
      className={cn(CARD_CLASS, "shrink-0 space-y-2")}
    >
      <div className="flex flex-wrap items-end gap-2">
        <CategoryPicker
          className="min-w-[150px] flex-1"
          label="Category"
          name="sheet-default-category"
          onChange={setCategory}
          placeholder="Choose a category"
          value={defaults.category}
        />
        <StepperField
          ariaLabel="Default low-stock threshold"
          className="w-[110px]"
          label="Threshold"
          min={0}
          name="sheet-default-threshold"
          onChange={setThreshold}
          placeholder={String(DEFAULT_THRESHOLD)}
          value={defaults.threshold}
        />
        <SelectField
          className="min-w-[120px]"
          label="Form"
          name="sheet-default-form"
          onChange={setForm}
          options={FORM_OPTIONS}
          placeholder="—"
          value={defaults.form}
        />
        <SelectField
          className="min-w-[120px]"
          label="Strength unit"
          name="sheet-default-strength-unit"
          onChange={setStrengthUnit}
          options={UNIT_OPTIONS}
          placeholder="—"
          value={defaults.strengthUnit}
        />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="press-feedback inline-flex h-8 items-center gap-1 rounded-md border border-input px-2.5 font-medium text-[12px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={selectedCount === 0}
            title={
              selectedCount === 0
                ? "Select groups first with the row checkboxes"
                : undefined
            }
          >
            Apply to selected
            <ChevronDown aria-hidden className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleApplyAll}>
              Apply all five fields
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {SHEET_DEFAULT_FIELDS.map((field) => (
              <ApplyFieldItem field={field} key={field} onApply={onApply} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p aria-live="polite" className="text-caption text-muted-foreground">
        {hint}
      </p>
    </section>
  );
}
