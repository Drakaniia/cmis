import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { cn } from "@cmis/ui/lib/utils";
import { type ChangeEvent, type ReactNode, useCallback } from "react";
import { MEDICINE_FORMS, STRENGTH_UNITS } from "../../domain/vocabulary";
import { CategoryPicker } from "../category-picker";
import {
  CELL_CLASS,
  CELL_OVERRIDE_CLASS,
  CELL_STATIC_CLASS,
} from "./field-styles";

/**
 * The delivery sheet's grid cells (spec §7.4).
 *
 * A cell is unlabelled on purpose — the column header labels it — so each one
 * carries its own `aria-label` and stays one 32px row tall. That fixed height is
 * what lets the grid virtualize rows without measuring them.
 */

/**
 * The vocabularies the sheet's selects offer. Declared once so the strip and a
 * group row cannot drift into offering different dose forms.
 */
export const FORM_OPTIONS = MEDICINE_FORMS.map((form) => ({
  label: form,
  value: form,
}));

export const STRENGTH_UNIT_OPTIONS = STRENGTH_UNITS.map((unit) => ({
  label: unit,
  value: unit,
}));

/** The small "set here" marker on a stencil field the operator typed over. */
export function OverrideMark({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return (
    <span className={CELL_OVERRIDE_CLASS} title="Set on this group">
      set
    </span>
  );
}

function CellChrome({
  children,
  invalid,
  mark,
}: {
  children: ReactNode;
  invalid?: boolean;
  mark?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1",
        invalid && "text-destructive"
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <OverrideMark show={Boolean(mark)} />
    </div>
  );
}

export function CellText({
  invalid,
  label,
  mark,
  onBlur,
  onChange,
  placeholder,
  value,
}: {
  invalid?: boolean;
  label: string;
  mark?: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange]
  );
  const handleBlur = useCallback(() => onBlur?.(), [onBlur]);

  return (
    <CellChrome invalid={invalid} mark={mark}>
      <input
        aria-invalid={Boolean(invalid)}
        aria-label={label}
        className={cn(CELL_CLASS, invalid && "border-destructive")}
        onBlur={onBlur ? handleBlur : undefined}
        onChange={handleChange}
        placeholder={placeholder}
        title={label}
        value={value}
      />
    </CellChrome>
  );
}

export function CellSelect({
  invalid,
  label,
  mark,
  onChange,
  options,
  placeholder,
  value,
}: {
  invalid?: boolean;
  label: string;
  mark?: boolean;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder: string;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
    [onChange]
  );

  return (
    <CellChrome invalid={invalid} mark={mark}>
      <select
        aria-invalid={Boolean(invalid)}
        aria-label={label}
        className={cn(CELL_CLASS, "pr-1", invalid && "border-destructive")}
        onChange={handleChange}
        title={label}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </CellChrome>
  );
}

/**
 * The category cell. Unlike the other cells it is not a native `<select>`: the
 * list behind it is editable (create, rename, delete), which a `<select>` cannot
 * express — an `<option>` is not a place for buttons.
 */
export function CellCategory({
  invalid,
  label,
  mark,
  onChange,
  value,
}: {
  invalid?: boolean;
  label: string;
  mark?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <CellChrome invalid={invalid} mark={mark}>
      <CategoryPicker
        aria-label={label}
        invalid={invalid}
        onChange={onChange}
        placeholder={label}
        title={label}
        value={value}
        variant="cell"
      />
    </CellChrome>
  );
}

export function CellQty({
  invalid,
  label,
  min = 1,
  onChange,
  value,
}: {
  invalid?: boolean;
  label: string;
  min?: number;
  onChange: (value: number | "") => void;
  value: number | "";
}) {
  return (
    <QuantityStepper
      aria-label={label}
      className={cn("h-8", invalid && "border-destructive")}
      invalid={Boolean(invalid)}
      min={min}
      onChange={onChange}
      value={value}
    />
  );
}

export function CellDate({
  invalid,
  label,
  min,
  onChange,
  value,
}: {
  invalid?: boolean;
  label: string;
  min?: string;
  onChange: (iso: string) => void;
  value: string;
}) {
  return (
    <AppleDatePicker
      aria-label={label}
      className={cn("h-8", invalid && "border-destructive")}
      min={min}
      onChange={onChange}
      placeholder={label}
      value={value}
    />
  );
}

/** Read-only context cells: the group's name on a batch row, and its totals. */
export function CellStatic({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={CELL_STATIC_CLASS} title={title}>
      {children}
    </span>
  );
}
