import { type ReactNode, useCallback, useMemo } from "react";
import { VOCABULARY_LABEL, type VocabularyKind } from "../domain/vocabulary";
import {
  normalizeTermName,
  validateTermName,
} from "../domain/vocabulary-terms";
import {
  useCreateVocabularyTerm,
  useDeleteVocabularyTerm,
  useRenameVocabularyTerm,
  useVocabularyTerms,
} from "../hooks/use-vocabulary-terms";
import {
  defaultTermCopy,
  type TermEntry,
  TermPicker,
  type TermPickerVariant,
} from "./term-picker";

/**
 * The strength unit, dose form and pack unit dropdowns, with the list managed
 * from inside them (migration 0013).
 *
 * This is the same gesture the category dropdown has offered since migration
 * 0006, applied to the three lists that were still native `<select>` elements. It
 * matters for a specific reason: `validatePackFields` V6 refuses a pack unit
 * that is not in the list, and `baseUnitFor` renders an unknown dose form as the
 * bare token `unit` in every quantity on screen. So before this, a clinic that
 * stocks in a container or a form the list did not name had two bad options and
 * no good one — record it as the wrong thing, or edit source and ship a build.
 *
 * Every field that asks for one of these renders this: the stock-in wizard's
 * Step 2, the item edit panel, the new-product form and the delivery sheet's
 * defaults strip. A unit added while doing a stock-in is immediately available
 * everywhere else, because there is one list.
 */

/**
 * One copy object per kind, built once.
 *
 * `defaultTermCopy` allocates a dozen closures, so calling it during render
 * would hand the panel a new `copy` identity on every keystroke and defeat the
 * memoisation the panel depends on.
 */
const COPY_BY_KIND: Record<
  VocabularyKind,
  ReturnType<typeof defaultTermCopy>
> = {
  form: defaultTermCopy("form"),
  pack_unit: defaultTermCopy("pack unit"),
  strength_unit: defaultTermCopy("strength unit"),
};

export interface VocabularyPickerProps {
  /** Accessible name for the unlabelled `cell` variant. */
  "aria-label"?: string;
  className?: string;
  /**
   * Locks the field — used by the stock-in wizard when the chosen dose form
   * makes a pack impossible (V4), so an invalid selection cannot be made.
   */
  disabled?: boolean;
  /** Field-level message rendered under the trigger. */
  error?: string | null;
  /** Rendered under the control when there is no error. */
  hint?: ReactNode;
  invalid?: boolean;
  /** Which list this field edits. */
  kind: VocabularyKind;
  /**
   * Rendered above the trigger. Defaults to the kind's own column label
   * (`"Strength unit"`) in the `field` variant, and to nothing in `cell` — a
   * grid cell is unlabelled because the column header already labels it, and a
   * label there would push the 32px row out of the height the virtualizer
   * assumes.
   */
  label?: ReactNode;
  /** Named to match a `<label>` in the surrounding form; also the trigger's id. */
  name?: string;
  onChange: (name: string) => void;
  /** Defaults to `"— select"`, matching the `<option value="">—</option>` it replaces. */
  placeholder?: string;
  title?: string;
  value: string;
  /** `"cell"` is the compact 32px delivery-sheet cell. */
  variant?: TermPickerVariant;
}

export function VocabularyPicker({
  "aria-label": ariaLabel,
  className,
  disabled,
  error,
  hint,
  invalid,
  kind,
  label,
  name,
  onChange,
  placeholder = "— select",
  title,
  value,
  variant = "field",
}: VocabularyPickerProps) {
  const { data, error: loadError, isLoading } = useVocabularyTerms(kind);
  const create = useCreateVocabularyTerm();
  const rename = useRenameVocabularyTerm();
  const remove = useDeleteVocabularyTerm();

  const entries = useMemo<TermEntry[]>(
    () =>
      (data ?? []).map((term) => ({
        id: term.id,
        name: term.name,
        usageCount: term.usageCount,
      })),
    [data]
  );

  const writes = useMemo(
    () => ({
      busy: create.isPending || rename.isPending || remove.isPending,
      create: (
        termName: string,
        handlers: {
          onError: (mutationError: Error) => void;
          onSuccess: (term: TermEntry) => void;
        }
      ) => {
        create.mutate(
          { kind, name: termName },
          {
            onError: handlers.onError,
            onSuccess: (created) =>
              handlers.onSuccess({
                id: created.id,
                name: created.name,
                usageCount: created.usageCount,
              }),
          }
        );
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
          onSuccess: (outcome: {
            itemsUpdated: number;
            requestsUnresolved?: number;
          }) => void;
        }
      ) => {
        rename.mutate(variables, {
          onError: handlers.onError,
          onSuccess: handlers.onSuccess,
        });
      },
    }),
    [create, kind, remove, rename]
  );

  const validate = useCallback(
    (
      termName: string,
      existing: readonly string[],
      options?: { ignore?: string }
    ) => validateTermName(termName, existing, options),
    []
  );

  return (
    <TermPicker
      aria-label={ariaLabel ?? VOCABULARY_LABEL[kind]}
      className={className}
      clearLabel="— not recorded"
      copy={COPY_BY_KIND[kind]}
      disabled={disabled}
      entries={entries}
      error={error}
      hasError={Boolean(loadError)}
      hint={hint}
      invalid={invalid}
      isLoading={isLoading}
      label={variant === "field" ? (label ?? VOCABULARY_LABEL[kind]) : label}
      name={name}
      normalize={normalizeTermName}
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
