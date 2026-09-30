import { type ReactNode, useCallback, useMemo } from "react";

import {
  CATEGORY_NAME_MAX_LENGTH,
  normalizeCategoryName,
  validateCategoryName,
} from "../domain/categories";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from "../hooks/use-categories";
import {
  defaultTermCopy,
  type TermEntry,
  TermPicker,
  type TermPickerVariant,
} from "./term-picker";

/**
 * The one category dropdown, with the list managed from inside it.
 *
 * Every place that asks for a category — the new-product form, the delivery
 * sheet and its defaults strip, the stock-in wizard, the edit panel and both
 * filter bars — renders this component, so creating a category while filling in
 * a delivery is the same gesture everywhere and lands in the same table
 * (migration 0006). The Settings → Categories panel edits that table too: there
 * is no second copy to drift.
 *
 * All the behaviour lives in `TermPicker`, which the strength unit, dose form
 * and pack unit pickers share — a category and a vocabulary term are the same
 * shape of problem, and two 700-line pickers differing only in a noun is how the
 * second one drifts. What this file owns is the category query, the three
 * mutations and the wording.
 *
 * Deletion follows the rule the Settings panel already stated: a category that
 * items still carry is refused, with the count that blocked it, rather than
 * quietly orphaning those rows.
 */

const CATEGORY_COPY = {
  ...defaultTermCopy("category"),
  maxLength: CATEGORY_NAME_MAX_LENGTH,
};

export type CategoryPickerVariant = TermPickerVariant;

export interface CategoryPickerProps {
  /** `"All"`-style row for the filter bars; omitted by the forms. */
  allLabel?: string;
  "aria-label"?: string;
  className?: string;
  /** Field-level message rendered under the trigger. */
  error?: string | null;
  /** Rendered under the control when there is no error. */
  hint?: ReactNode;
  /** Red border without a message — what a delivery-sheet cell reports. */
  invalid?: boolean;
  /** Rendered above the trigger; omitted by the filter bars, which have no room. */
  label?: ReactNode;
  /** Named to match a `<label>` in the surrounding form; also the trigger's id. */
  name?: string;
  onChange: (name: string) => void;
  placeholder?: string;
  /** Tooltip for the unlabelled cell variant. */
  title?: string;
  value: string;
  /** `"filter"` is the compact bar pill, `"cell"` the 32px sheet cell. */
  variant?: CategoryPickerVariant;
}

export function CategoryPicker({
  "aria-label": ariaLabel,
  allLabel,
  className,
  error,
  hint,
  invalid,
  label,
  name,
  onChange,
  placeholder = "Choose a category",
  title,
  value,
  variant = "field",
}: CategoryPickerProps) {
  const { data, error: loadError, isLoading } = useCategories();
  const create = useCreateCategory();
  const rename = useRenameCategory();
  const remove = useDeleteCategory();

  const entries = useMemo<TermEntry[]>(
    () =>
      (data ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        usageCount: category.itemCount,
      })),
    [data]
  );

  // Rebuilt whenever any mutation object changes, which React Query does on
  // every state transition — including `isPending` — so the panel's `busy`
  // flag and the handlers it holds can never come from different renders.
  const writes = useMemo(
    () => ({
      busy: create.isPending || rename.isPending || remove.isPending,
      create: (
        categoryName: string,
        handlers: {
          onError: (mutationError: Error) => void;
          onSuccess: (term: TermEntry) => void;
        }
      ) => {
        create.mutate(categoryName, {
          onError: handlers.onError,
          onSuccess: (created) =>
            handlers.onSuccess({
              id: created.id,
              name: created.name,
              usageCount: created.itemCount,
            }),
        });
      },
      remove: (
        id: string,
        handlers: { onError: (error: Error) => void; onSuccess: () => void }
      ) => {
        remove.mutate(id, {
          onError: handlers.onError,
          onSuccess: handlers.onSuccess,
        });
      },
      rename: (
        variables: { id: string; name: string },
        handlers: {
          onError: (error: Error) => void;
          onSuccess: (outcome: { itemsUpdated: number }) => void;
        }
      ) => {
        rename.mutate(variables, {
          onError: handlers.onError,
          onSuccess: handlers.onSuccess,
        });
      },
    }),
    [create, remove, rename]
  );

  const validate = useCallback(
    (
      categoryName: string,
      existing: readonly string[],
      options?: { ignore?: string }
    ) => validateCategoryName(categoryName, existing, options),
    []
  );

  return (
    <TermPicker
      allLabel={allLabel}
      aria-label={ariaLabel}
      className={className}
      copy={CATEGORY_COPY}
      entries={entries}
      error={error}
      hasError={Boolean(loadError)}
      hint={hint}
      invalid={invalid}
      isLoading={isLoading}
      label={label}
      name={name}
      normalize={normalizeCategoryName}
      onChange={onChange}
      placeholder={placeholder}
      title={title}
      validate={validate}
      value={value}
      variant={variant}
      writes={writes}
    />
  );
}
