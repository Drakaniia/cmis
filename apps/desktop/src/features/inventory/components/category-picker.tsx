import {
  Popover,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
} from "@cmis/ui/components/popover";
import { cn } from "@cmis/ui/lib/utils";
import { Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import {
  CATEGORY_NAME_MAX_LENGTH,
  type Category,
  normalizeCategoryName,
  validateCategoryName,
} from "../domain/categories";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from "../hooks/use-categories";

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
 * It is a `Popover` rather than a menu because a menu cannot host what this
 * needs. Renaming and creating want a text field inside the panel, and Radix's
 * menu closes on select and runs typeahead over the keys the operator types —
 * both of which fight an inline form. A popover has neither problem, and the
 * app already uses one for the same reason in `apple-date-picker`.
 *
 * Deletion follows the rule the Settings panel already stated: a category that
 * items still carry is refused, with the count that blocked it, rather than
 * quietly orphaning those rows.
 *
 * The panel is split into rows and small forms, each with stable handlers:
 * rebuilding an arrow per row on every render is what `noJsxPropsBind` warns
 * about, and a dropdown that re-renders on every keystroke is one that drops
 * focus mid-name.
 */

const FIELD_LABEL_CLASS = "block font-medium text-caption text-foreground";
const FIELD_HINT_CLASS = "mt-1 block text-caption text-muted-foreground";
const FIELD_ERROR_CLASS = "mt-1 block text-caption text-destructive";

/** Field chrome for the forms, the wizard and the edit panel. */
const FIELD_TRIGGER_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

/** The compact pill the filter bars use. */
const FILTER_TRIGGER_CLASS =
  "press-feedback inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 font-medium text-xs hover:bg-accent hover:text-accent-foreground";

/** One 32px delivery-sheet cell, matching `CELL_CLASS` in `field-styles.ts`. */
const CELL_TRIGGER_CLASS =
  "flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-left text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

const OPTION_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground";
const ICON_BUTTON_CLASS =
  "press-feedback rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground";
const TEXT_BUTTON_CLASS =
  "press-feedback shrink-0 rounded-md px-2 py-1 font-medium text-muted-foreground text-xs hover:bg-accent";
const INLINE_INPUT_CLASS =
  "min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const LINK_BUTTON_CLASS =
  "press-feedback w-full rounded-md px-2 py-1.5 text-left font-medium text-primary text-xs hover:bg-accent";
const CONFIRM_BUTTON_CLASS =
  "press-feedback rounded-md bg-primary px-2 py-1.5 font-medium text-primary-foreground text-xs disabled:opacity-60";
const DESTRUCTIVE_BUTTON_CLASS =
  "press-feedback rounded-md bg-destructive px-2 py-1 font-medium text-white text-xs disabled:opacity-60";

export type CategoryPickerVariant = "cell" | "field" | "filter";

const TRIGGER_CLASS: Record<CategoryPickerVariant, string> = {
  cell: CELL_TRIGGER_CLASS,
  field: FIELD_TRIGGER_CLASS,
  filter: FILTER_TRIGGER_CLASS,
};

/**
 * What the panel is doing instead of listing categories. One object, so two
 * inline forms can never be open at once.
 */
type PanelMode =
  | { kind: "list" }
  | { kind: "create"; value: string }
  | { kind: "rename"; id: string; name: string; value: string }
  | { kind: "confirm-delete"; id: string; name: string };

/** One category: pick it, or rename/delete the list entry behind it. */
function CategoryOptionRow({
  category,
  onRename,
  onRequestDelete,
  onSelect,
  selected,
}: {
  category: Category;
  onRename: (category: Category) => void;
  onRequestDelete: (category: Category) => void;
  onSelect: (name: string) => void;
  selected: boolean;
}) {
  const handleSelect = useCallback(
    () => onSelect(category.name),
    [category.name, onSelect]
  );
  const handleRename = useCallback(
    () => onRename(category),
    [category, onRename]
  );
  const handleDelete = useCallback(
    () => onRequestDelete(category),
    [category, onRequestDelete]
  );

  return (
    <div className="flex items-center gap-1">
      <button
        aria-pressed={selected}
        className={cn(OPTION_CLASS, "flex-1")}
        onClick={handleSelect}
        type="button"
      >
        <Check
          aria-hidden
          className={cn(
            "size-3.5 shrink-0",
            selected ? "opacity-100" : "opacity-0"
          )}
        />
        <span className="truncate">{category.name}</span>
        {category.itemCount > 0 ? (
          <span className="ml-auto shrink-0 text-caption text-muted-foreground tabular-nums">
            {category.itemCount}
          </span>
        ) : null}
      </button>
      <button
        aria-label={`Rename ${category.name}`}
        className={ICON_BUTTON_CLASS}
        onClick={handleRename}
        type="button"
      >
        <Pencil aria-hidden className="size-3.5" />
      </button>
      <button
        aria-label={`Delete ${category.name}`}
        className={cn(
          ICON_BUTTON_CLASS,
          "hover:bg-destructive/10 hover:text-destructive"
        )}
        onClick={handleDelete}
        type="button"
      >
        <Trash2 aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

/** The list itself, plus the "New category" that opens the inline form. */
function CategoryList({
  allLabel,
  categories,
  hasError,
  isLoading,
  onCreateRequest,
  onRename,
  onRequestDelete,
  onSelect,
  value,
}: {
  allLabel?: string;
  categories: Category[];
  hasError: boolean;
  isLoading: boolean;
  onCreateRequest: () => void;
  onRename: (category: Category) => void;
  onRequestDelete: (category: Category) => void;
  onSelect: (name: string) => void;
  value: string;
}) {
  const handleSelectAll = useCallback(() => onSelect("All"), [onSelect]);
  const showEmpty = !(isLoading || hasError) && categories.length === 0;

  return (
    <>
      <div className="max-h-64 space-y-0.5 overflow-y-auto">
        {allLabel === undefined ? null : (
          <button
            aria-pressed={value === "All"}
            className={OPTION_CLASS}
            onClick={handleSelectAll}
            type="button"
          >
            <Check
              aria-hidden
              className={cn(
                "size-3.5 shrink-0",
                value === "All" ? "opacity-100" : "opacity-0"
              )}
            />
            <span className="truncate">{allLabel}</span>
          </button>
        )}

        {categories.map((category) => (
          <CategoryOptionRow
            category={category}
            key={category.id}
            onRename={onRename}
            onRequestDelete={onRequestDelete}
            onSelect={onSelect}
            selected={value === category.name}
          />
        ))}

        {isLoading ? (
          <p className="px-2 py-1.5 text-caption text-muted-foreground">
            Loading categories…
          </p>
        ) : null}
        {hasError ? (
          <p className="px-2 py-1.5 text-caption text-destructive" role="alert">
            Could not read the categories.
          </p>
        ) : null}
        {showEmpty ? (
          <p className="px-2 py-1.5 text-caption text-muted-foreground">
            No categories yet — add the first one below.
          </p>
        ) : null}
      </div>

      <div className="mt-1 border-border/40 border-t pt-1">
        <button
          className={LINK_BUTTON_CLASS}
          onClick={onCreateRequest}
          type="button"
        >
          <Plus aria-hidden className="mr-1 inline size-3.5" />
          New category
        </button>
      </div>
    </>
  );
}

/** The inline create/rename field. Enter submits, Escape goes back. */
function CategoryNameForm({
  busy,
  inputId,
  label,
  onCancel,
  onChange,
  onSubmit,
  value,
}: {
  busy: boolean;
  inputId: string;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  value: string;
}) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange]
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    },
    [onCancel]
  );
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      onSubmit();
    },
    [onSubmit]
  );

  return (
    <form className="space-y-2 p-1" onSubmit={handleSubmit}>
      <label
        className="block font-medium text-caption text-foreground"
        htmlFor={inputId}
      >
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          autoFocus
          className={INLINE_INPUT_CLASS}
          id={inputId}
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          value={value}
        />
        <button className={TEXT_BUTTON_CLASS} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
      <button className={CONFIRM_BUTTON_CLASS} disabled={busy} type="submit">
        {label.startsWith("New") ? "Add" : "Save"}
      </button>
    </form>
  );
}

/** A second click deletes: the row has no undo, so it asks once. */
function CategoryDeleteConfirm({
  busy,
  name,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 p-1">
      <p className="text-sm">
        Delete <strong>{name}</strong>? This cannot be undone.
      </p>
      <div className="flex justify-end gap-1">
        <button className={TEXT_BUTTON_CLASS} onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className={DESTRUCTIVE_BUTTON_CLASS}
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** The hint under a field, or the error that replaced it. */
function FieldMessages({
  error,
  hint,
}: {
  error?: string | null;
  hint?: ReactNode;
}) {
  if (error) {
    return <span className={FIELD_ERROR_CLASS}>{error}</span>;
  }
  if (hint === undefined) {
    return null;
  }
  return <span className={FIELD_HINT_CLASS}>{hint}</span>;
}

/**
 * The panel's contents: the list, and every write the list allows.
 *
 * It owns which inline form is open and the three mutations, so the dropdown
 * around it only has to own "is it open" and the way the trigger reads. The
 * categories themselves come in as props — the query belongs to the component
 * that renders the trigger, which is also the one that knows when a pick should
 * close it.
 */
function CategoryPanel({
  allLabel,
  categories,
  hasError,
  inputId,
  isLoading,
  onChange,
  onSelect,
  value,
}: {
  allLabel?: string;
  categories: Category[];
  hasError: boolean;
  inputId: string;
  isLoading: boolean;
  /** Moves the field's value without closing: create, rename, delete. */
  onChange: (name: string) => void;
  /** Moves the value and closes: the operator picked a row. */
  onSelect: (name: string) => void;
  value: string;
}) {
  const [mode, setMode] = useState<PanelMode>({ kind: "list" });
  const create = useCreateCategory();
  const rename = useRenameCategory();
  const remove = useDeleteCategory();
  const busy = create.isPending || rename.isPending || remove.isPending;

  // Stable across renders: the submit callbacks below depend on it, and a fresh
  // array per render would rebuild them on every keystroke.
  const names = useMemo(
    () => categories.map((category) => category.name),
    [categories]
  );

  const openCreateForm = useCallback(() => {
    setMode({ kind: "create", value: "" });
  }, []);

  const openRenameForm = useCallback((category: Category) => {
    setMode({
      id: category.id,
      kind: "rename",
      name: category.name,
      value: category.name,
    });
  }, []);

  const backToList = useCallback(() => setMode({ kind: "list" }), []);

  const requestDelete = useCallback((category: Category) => {
    if (category.itemCount > 0) {
      toast.error(`Cannot delete ${category.name}`, {
        description: `${category.itemCount} ${category.itemCount === 1 ? "item uses" : "items use"} it. Reassign them first.`,
      });
      return;
    }
    setMode({ id: category.id, kind: "confirm-delete", name: category.name });
  }, []);

  const handleModeValue = useCallback((next: string) => {
    setMode((previous) => {
      if (previous.kind === "create") {
        return { kind: "create", value: next };
      }
      if (previous.kind === "rename") {
        return { ...previous, value: next };
      }
      return previous;
    });
  }, []);

  const submitCreate = useCallback(() => {
    if (mode.kind !== "create") {
      return;
    }
    const clean = normalizeCategoryName(mode.value);
    const problem = validateCategoryName(clean, names);
    if (problem !== null) {
      toast.error("Could not add the category", { description: problem });
      return;
    }
    create.mutate(clean, {
      onError: (mutationError: Error) =>
        toast.error("Could not add the category", {
          description: mutationError.message,
        }),
      onSuccess: (created) => {
        // Select it straight away: the operator created it to use it here, and
        // the list they see refetches behind the scene.
        onChange(created.name);
        setMode({ kind: "list" });
        toast.success(`Added ${created.name}`);
      },
    });
  }, [create, mode, names, onChange]);

  const submitRename = useCallback(() => {
    if (mode.kind !== "rename") {
      return;
    }
    const { id, name: previousName } = mode;
    const clean = normalizeCategoryName(mode.value);
    const problem = validateCategoryName(clean, names, {
      ignore: previousName,
    });
    if (problem !== null) {
      toast.error("Could not rename the category", { description: problem });
      return;
    }
    rename.mutate(
      { id, name: clean },
      {
        onError: (mutationError: Error) =>
          toast.error("Could not rename the category", {
            description: mutationError.message,
          }),
        onSuccess: ({ itemsUpdated }) => {
          // The field holds the name itself, so a rename has to carry it along
          // or the form would save a category that no longer exists.
          if (value === previousName) {
            onChange(clean);
          }
          setMode({ kind: "list" });
          toast.success(`Renamed to ${clean}`, {
            description:
              itemsUpdated === 0
                ? "No items used this category."
                : `${itemsUpdated} ${itemsUpdated === 1 ? "item now uses" : "items now use"} the new name.`,
          });
        },
      }
    );
  }, [mode, names, onChange, rename, value]);

  const confirmDelete = useCallback(() => {
    if (mode.kind !== "confirm-delete") {
      return;
    }
    const { id, name: deleted } = mode;
    remove.mutate(id, {
      onError: (mutationError: Error) =>
        toast.error("Could not delete the category", {
          description: mutationError.message,
        }),
      onSuccess: () => {
        if (value === deleted) {
          onChange("");
        }
        setMode({ kind: "list" });
        toast.success(`${deleted} deleted`);
      },
    });
  }, [mode, onChange, remove, value]);

  const creating = mode.kind === "create";
  const editing = mode.kind === "rename";

  return (
    <>
      {mode.kind === "list" ? (
        <CategoryList
          allLabel={allLabel}
          categories={categories}
          hasError={hasError}
          isLoading={isLoading}
          onCreateRequest={openCreateForm}
          onRename={openRenameForm}
          onRequestDelete={requestDelete}
          onSelect={onSelect}
          value={value}
        />
      ) : null}

      {creating || editing ? (
        <CategoryNameForm
          busy={busy}
          inputId={inputId}
          label={creating ? "New category" : "Rename category"}
          onCancel={backToList}
          onChange={handleModeValue}
          onSubmit={creating ? submitCreate : submitRename}
          value={mode.value}
        />
      ) : null}

      {mode.kind === "confirm-delete" ? (
        <CategoryDeleteConfirm
          busy={busy}
          name={mode.name}
          onCancel={backToList}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}

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
  variant = "field",
  value,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const inputId = `${labelId}-name`;

  const { data, error: loadError, isLoading } = useCategories();
  const categories: Category[] = data ?? [];

  const handleOpenChange = useCallback((next: boolean) => setOpen(next), []);

  const select = useCallback(
    (chosen: string) => {
      onChange(chosen);
      handleOpenChange(false);
    },
    [handleOpenChange, onChange]
  );

  const rejected = Boolean(error) || Boolean(invalid);
  const collapsed = value === "" || value === "All";
  const display = collapsed ? placeholder : value;

  // A `span` rather than a `div`: the delivery sheet renders this inside its
  // cell chrome, and a block element inside a phrasing one is invalid HTML.
  return (
    <span className={cn("block", className)}>
      {label === undefined ? null : (
        <span className={FIELD_LABEL_CLASS} id={labelId}>
          {label}
        </span>
      )}

      <Popover onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger
          aria-invalid={rejected ? true : undefined}
          aria-label={
            label === undefined ? (ariaLabel ?? "Category") : undefined
          }
          aria-labelledby={label === undefined ? undefined : labelId}
          className={cn(
            TRIGGER_CLASS[variant],
            rejected && "border-destructive"
          )}
          id={name}
          title={title}
          type="button"
        >
          <span
            className={cn("truncate", collapsed && "text-muted-foreground")}
          >
            {display}
          </span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
        </PopoverTrigger>

        <PopoverPortal>
          <PopoverPositioner align="start" sideOffset={4}>
            <PopoverPopup
              aria-label="Categories"
              className="surface-frosted w-64 max-w-[calc(100vw-2rem)] p-2"
            >
              <CategoryPanel
                allLabel={allLabel}
                categories={categories}
                hasError={Boolean(loadError)}
                inputId={inputId}
                isLoading={isLoading}
                onChange={onChange}
                onSelect={select}
                value={value}
              />
            </PopoverPopup>
          </PopoverPositioner>
        </PopoverPortal>
      </Popover>

      {variant === "field" ? <FieldMessages error={error} hint={hint} /> : null}
    </span>
  );
}
