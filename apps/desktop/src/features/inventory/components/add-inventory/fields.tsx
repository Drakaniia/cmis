import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { cn } from "@cmis/ui/lib/utils";
import { type ChangeEvent, type ReactNode, useCallback } from "react";
import {
  ERROR_CLASS,
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  SELECT_CLASS,
} from "./field-styles";

/**
 * The Add Inventory form controls.
 *
 * Each one owns the `ChangeEvent` → value translation and hands the caller a
 * plain value through a `useCallback`, so a form stays a list of field
 * definitions instead of a nest of inline handlers — the identity of each
 * handler has to be stable for the row editors to memoise at all.
 */

export interface SelectOption {
  label: string;
  value: string;
}

interface FieldChrome {
  /** Rendered after the control, under any error. */
  hint?: ReactNode;
  label: ReactNode;
  name: string;
}

function Messages({
  error,
  hint,
}: {
  error?: string | null;
  hint?: ReactNode;
}) {
  return (
    <>
      {hint ? <span className={HINT_CLASS}>{hint}</span> : null}
      {error ? <span className={ERROR_CLASS}>{error}</span> : null}
    </>
  );
}

export function TextField({
  autoFocus,
  className,
  error,
  hint,
  label,
  name,
  onBlur,
  onChange,
  placeholder,
  value,
}: FieldChrome & {
  autoFocus?: boolean;
  className?: string;
  error?: string | null;
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
    <label className={cn(LABEL_CLASS, className)} htmlFor={name}>
      {label}
      <input
        aria-invalid={Boolean(error)}
        autoFocus={autoFocus}
        className={cn(FIELD_CLASS, error && "border-destructive")}
        id={name}
        onBlur={onBlur ? handleBlur : undefined}
        onChange={handleChange}
        placeholder={placeholder}
        value={value}
      />
      <Messages error={error} hint={hint} />
    </label>
  );
}

export function TextAreaField({
  className,
  error,
  hint,
  label,
  name,
  onChange,
  placeholder,
  value,
}: FieldChrome & {
  className?: string;
  error?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    [onChange]
  );
  return (
    <label className={cn(LABEL_CLASS, className)} htmlFor={name}>
      {label}
      <textarea
        className={cn(
          FIELD_CLASS,
          "min-h-[64px]",
          error && "border-destructive"
        )}
        id={name}
        onChange={handleChange}
        placeholder={placeholder}
        value={value}
      />
      <Messages error={error} hint={hint} />
    </label>
  );
}

export function SelectField({
  className,
  error,
  hint,
  label,
  name,
  onChange,
  options,
  placeholder,
  value,
}: FieldChrome & {
  className?: string;
  error?: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
    [onChange]
  );
  return (
    <label className={cn(LABEL_CLASS, className)} htmlFor={name}>
      {label}
      <select
        aria-invalid={Boolean(error)}
        className={cn(SELECT_CLASS, error && "border-destructive")}
        id={name}
        onChange={handleChange}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Messages error={error} hint={hint} />
    </label>
  );
}

export function DateField({
  error,
  hint,
  label,
  min,
  name,
  onChange,
  placeholder,
  value,
}: FieldChrome & {
  error?: string | null;
  min?: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className={LABEL_CLASS} htmlFor={name}>
      {label}
      <AppleDatePicker
        className={cn("mt-1 h-9", error && "border-destructive")}
        id={name}
        min={min}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
      <Messages error={error} hint={hint} />
    </label>
  );
}

export function StepperField({
  ariaLabel,
  className,
  error,
  hint,
  label,
  min = 0,
  name,
  onChange,
  placeholder,
  value,
}: FieldChrome & {
  ariaLabel?: string;
  className?: string;
  error?: string | null;
  min?: number;
  onChange: (value: number | "") => void;
  placeholder?: string;
  value: number | "";
}) {
  return (
    <label className={cn(LABEL_CLASS, className)} htmlFor={name}>
      {label}
      <QuantityStepper
        aria-label={ariaLabel}
        className={cn("mt-1 h-9", error && "border-destructive")}
        id={name}
        invalid={Boolean(error)}
        min={min}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
      <Messages error={error} hint={hint} />
    </label>
  );
}

export function CheckField({
  checked,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  label: ReactNode;
  name: string;
  onChange: (checked: boolean) => void;
}) {
  const handleCheckedChange = useCallback(
    (next: boolean | "indeterminate") => onChange(next === true),
    [onChange]
  );
  return (
    <label className="flex items-center gap-2 text-sm" htmlFor={name}>
      <Checkbox
        checked={checked}
        id={name}
        onCheckedChange={handleCheckedChange}
      />
      {label}
    </label>
  );
}
