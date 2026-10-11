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

/**
 * The one editable-list dropdown, shared by every list the operator can extend.
 *
 * A term or a category is the same shape of problem: a list in a table, a name
 * that is stored on the item rather than referenced by id, a panel that can
 * create, rename and delete, and a rule that a list entry in use cannot be
 * deleted. `CategoryPicker` and `VocabularyPicker` are both thin wrappers over
 * this — they supply the query, the three mutations and the wording, and nothing
 * else. That is deliberate: two 700-line pickers differing only in a noun is how
 * the second one drifts from the first.
 *
 * It is a `Popover` rather than a menu because a menu cannot host what this
 * needs. Renaming and creating want a text field inside the panel, and a
 * keyboard-driven menu closes on select and runs typeahead over the keys the
 * operator types — both of which fight an inline form. A popover has neither
 * problem, and the app already uses one for the same reason in
 * `apple-date-picker`.
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

export type TermPickerVariant = "cell" | "field" | "filter";

const TRIGGER_CLASS: Record<TermPickerVariant, string> = {
  cell: CELL_TRIGGER_CLASS,
  field: FIELD_TRIGGER_CLASS,
  filter: FILTER_TRIGGER_CLASS,
};

/** One list entry, as the panel needs it — id for the writes, name for the field. */
export interface TermEntry {
  id: string;
  name: string;
  /** How many items carry this name. `0` hides the counter. */
  usageCount: number;
}

/** The mutation result shapes the panel reads back after a successful write. */
export interface TermRenameOutcome {
  itemsUpdated: number;
  /**
   * Pre-0009 request rows whose copied text could not be repaired. Optional, so
   * the category wrapper — which has no such cascade — can omit it.
   */
  requestsUnresolved?: number;
}

/**
 * The three writes, injected rather than imported.
 *
 * The panel must not know whether it is driving React Query against a category
 * table or a vocabulary table, and a prop is cheaper to test than a module mock.
 */
export interface TermWrites {
  busy: boolean;
  create: (
    name: string,
    handlers: {
      onError: (error: Error) => void;
      onSuccess: (term: TermEntry) => void;
    }
  ) => void;
  remove: (
    id: string,
    handlers: { onError: (error: Error) => void; onSuccess: () => void }
  ) => void;
  rename: (
    variables: { id: string; name: string },
    handlers: {
      onError: (error: Error) => void;
      onSuccess: (outcome: TermRenameOutcome) => void;
    }
  ) => void;
}

/** Every operator-facing sentence, so the two wrappers can speak their own noun. */
export interface TermCopy {
  createErrorTitle: string;
  /** Heading of the inline form when creating. */
  createLabel: string;
  /** The link under the list: `"New category"`, `"New strength unit"`. */
  createLinkLabel: string;
  deleteBlockedDescription: (name: string, count: number) => string;
  deleteBlockedTitle: (name: string) => string;
  deleteErrorTitle: string;
  emptyMessage: string;
  errorMessage: string;
  loadingMessage: string;
  /** Longest a name may be, mirroring the table's own rule. */
  maxLength: number;
  /** `"All categories"` — the popover's own accessible name. */
  panelLabel: string;
  renameErrorTitle: string;
  renameLabel: string;
  /** `"Category"` — the trigger's accessible name when it carries no label. */
  triggerName: string;
}

export function defaultTermCopy(noun: string): TermCopy {
  const capitalize = (value: string) =>
    value.length === 0
      ? value
      : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
  return {
    createErrorTitle: `Could not add the ${noun}`,
    createLabel: `New ${noun}`,
    createLinkLabel: `New ${noun}`,
    // "it" rather than the term's name: this sentence sits directly under
    // `Cannot delete <name>`, so repeating the name reads as a stutter.
    deleteBlockedDescription: (_name, count) =>
      `${count} ${count === 1 ? "item uses" : "items use"} it. Reassign them first.`,
    deleteBlockedTitle: (name) => `Cannot delete ${name}`,
    deleteErrorTitle: `Could not delete the ${noun}`,
    emptyMessage: `No ${noun}s yet — add the first one below.`,
    errorMessage: `Could not read the ${noun}s.`,
    loadingMessage: `Loading ${noun}s…`,
    maxLength: 40,
    panelLabel: capitalize(`${noun}s`),
    renameErrorTitle: `Could not rename the ${noun}`,
    renameLabel: `Rename ${noun}`,
    triggerName: capitalize(noun),
  };
}

/**
 * What the panel is doing instead of listing. One object, so two inline forms
 * can never be open at once.
 */
type PanelMode =
  | { kind: "list" }
  | { kind: "create"; value: string }
  | { kind: "rename"; id: string; name: string; value: string }
  | { kind: "confirm-delete"; id: string; name: string };

/** One entry: pick it, or rename/delete the list entry behind it. */
function TermOptionRow({
  entry,
  onRename,
  onRequestDelete,
  onSelect,
  selected,
}: {
  entry: TermEntry;
  onRename: (entry: TermEntry) => void;
  onRequestDelete: (entry: TermEntry) => void;
  onSelect: (name: string) => void;
  selected: boolean;
}) {
  const handleSelect = useCallback(
    () => onSelect(entry.name),
    [entry.name, onSelect]
  );
  const handleRename = useCallback(() => onRename(entry), [entry, onRename]);
  const handleDelete = useCallback(
    () => onRequestDelete(entry),
    [entry, onRequestDelete]
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
        <span className="truncate">{entry.name}</span>
        {entry.usageCount > 0 ? (
          <span className="ml-auto shrink-0 text-caption text-muted-foreground tabular-nums">
            {entry.usageCount}
          </span>
        ) : null}
      </button>
      <button
        aria-label={`Rename ${entry.name}`}
        className={ICON_BUTTON_CLASS}
        onClick={handleRename}
        type="button"
      >
        <Pencil aria-hidden className="size-3.5" />
      </button>
      <button
        aria-label={`Delete ${entry.name}`}
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

/** The list itself, plus the link that opens the inline form. */
function TermList({
  allLabel,
  clearLabel,
  copy,
  entries,
  hasError,
  isLoading,
  onCreateRequest,
  onRename,
  onRequestDelete,
  onSelect,
  value,
}: {
  allLabel?: string;
  clearLabel?: string;
  copy: TermCopy;
  entries: TermEntry[];
  hasError: boolean;
  isLoading: boolean;
  onCreateRequest: () => void;
  onRename: (entry: TermEntry) => void;
  onRequestDelete: (entry: TermEntry) => void;
  onSelect: (name: string) => void;
  value: string;
}) {
  const handleSelectAll = useCallback(() => onSelect("All"), [onSelect]);
  const handleClear = useCallback(() => onSelect(""), [onSelect]);
  const showEmpty = !(isLoading || hasError) && entries.length === 0;

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

        {/* A native `<select>` could be emptied by choosing its blank option.
            A popover has no such affordance, and these fields are documented as
            optional — so without this row there would be no way to record "not
            stated" once a term had been picked. */}
        {clearLabel !== undefined && value !== "" && value !== "All" ? (
          <button
            className={cn(OPTION_CLASS, "text-muted-foreground")}
            onClick={handleClear}
            type="button"
          >
            <Check aria-hidden className="size-3.5 shrink-0 opacity-0" />
            <span className="truncate">{clearLabel}</span>
          </button>
        ) : null}

        {entries.map((entry) => (
          <TermOptionRow
            entry={entry}
            key={entry.id}
            onRename={onRename}
            onRequestDelete={onRequestDelete}
            onSelect={onSelect}
            selected={value === entry.name}
          />
        ))}

        {isLoading ? (
          <p className="px-2 py-1.5 text-caption text-muted-foreground">
            {copy.loadingMessage}
          </p>
        ) : null}
        {hasError ? (
          <p className="px-2 py-1.5 text-caption text-destructive" role="alert">
            {copy.errorMessage}
          </p>
        ) : null}
        {showEmpty ? (
          <p className="px-2 py-1.5 text-caption text-muted-foreground">
            {copy.emptyMessage}
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
          {copy.createLinkLabel}
        </button>
      </div>
    </>
  );
}

/** The inline create/rename field. Enter submits, Escape goes back. */
function TermNameForm({
  busy,
  copy,
  inputId,
  label,
  onCancel,
  onChange,
  onSubmit,
  value,
}: {
  busy: boolean;
  copy: TermCopy;
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
          maxLength={copy.maxLength}
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
function TermDeleteConfirm({
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
 * It owns which inline form is open and drives the three mutations, so the
 * dropdown around it only has to own "is it open" and the way the trigger reads.
 * The entries come in as props — the query belongs to the wrapper, which is also
 * the one that knows when a pick should close the popover.
 */
function TermPanel({
  allLabel,
  clearLabel,
  copy,
  entries,
  hasError,
  inputId,
  isLoading,
  normalize,
  onChange,
  onSelect,
  validate,
  value,
  writes,
}: {
  allLabel?: string;
  clearLabel?: string;
  copy: TermCopy;
  entries: TermEntry[];
  hasError: boolean;
  inputId: string;
  isLoading: boolean;
  normalize: (raw: string) => string;
  onChange: (name: string) => void;
  onSelect: (name: string) => void;
  validate: (
    name: string,
    existing: readonly string[],
    options?: { ignore?: string }
  ) => string | null;
  value: string;
  writes: TermWrites;
}) {
  const [mode, setMode] = useState<PanelMode>({ kind: "list" });

  // Stable across renders: the submit callbacks below depend on it, and a fresh
  // array per render would rebuild them on every keystroke.
  const names = useMemo(() => entries.map((entry) => entry.name), [entries]);

  const openCreateForm = useCallback(() => {
    setMode({ kind: "create", value: "" });
  }, []);

  const openRenameForm = useCallback((entry: TermEntry) => {
    setMode({
      id: entry.id,
      kind: "rename",
      name: entry.name,
      value: entry.name,
    });
  }, []);

  const backToList = useCallback(() => setMode({ kind: "list" }), []);

  const requestDelete = useCallback(
    (entry: TermEntry) => {
      if (entry.usageCount > 0) {
        toast.error(copy.deleteBlockedTitle(entry.name), {
          description: copy.deleteBlockedDescription(
            entry.name,
            entry.usageCount
          ),
        });
        return;
      }
      setMode({ id: entry.id, kind: "confirm-delete", name: entry.name });
    },
    [copy]
  );

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
    const clean = normalize(mode.value);
    const problem = validate(clean, names);
    if (problem !== null) {
      toast.error(copy.createErrorTitle, { description: problem });
      return;
    }
    writes.create(clean, {
      onError: (mutationError: Error) =>
        toast.error(copy.createErrorTitle, {
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
  }, [copy, mode, names, normalize, onChange, validate, writes]);

  const submitRename = useCallback(() => {
    if (mode.kind !== "rename") {
      return;
    }
    const { id, name: previousName } = mode;
    const clean = normalize(mode.value);
    const problem = validate(clean, names, { ignore: previousName });
    if (problem !== null) {
      toast.error(copy.renameErrorTitle, { description: problem });
      return;
    }
    writes.rename(
      { id, name: clean },
      {
        onError: (mutationError: Error) =>
          toast.error(copy.renameErrorTitle, {
            description: mutationError.message,
          }),
        onSuccess: (outcome) => {
          // The field holds the name itself, so a rename has to carry it along
          // or the form would save a term that no longer exists.
          if (value === previousName) {
            onChange(clean);
          }
          setMode({ kind: "list" });
          const unresolved = outcome.requestsUnresolved ?? 0;
          toast.success(`Renamed to ${clean}`, {
            description: describeRename(outcome.itemsUpdated, unresolved),
          });
        },
      }
    );
  }, [copy, mode, names, normalize, onChange, validate, value, writes]);

  const confirmDelete = useCallback(() => {
    if (mode.kind !== "confirm-delete") {
      return;
    }
    const { id, name: deleted } = mode;
    writes.remove(id, {
      onError: (mutationError: Error) =>
        toast.error(copy.deleteErrorTitle, {
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
  }, [copy, mode, onChange, value, writes]);

  const creating = mode.kind === "create";
  const editing = mode.kind === "rename";

  return (
    <>
      {mode.kind === "list" ? (
        <TermList
          allLabel={allLabel}
          clearLabel={clearLabel}
          copy={copy}
          entries={entries}
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
        <TermNameForm
          busy={writes.busy}
          copy={copy}
          inputId={inputId}
          label={creating ? copy.createLabel : copy.renameLabel}
          onCancel={backToList}
          onChange={handleModeValue}
          onSubmit={creating ? submitCreate : submitRename}
          value={mode.value}
        />
      ) : null}

      {mode.kind === "confirm-delete" ? (
        <TermDeleteConfirm
          busy={writes.busy}
          name={mode.name}
          onCancel={backToList}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}

/**
 * What a rename moved, in one sentence.
 *
 * The unresolved-request count is not decoration: a pre-0009 request row is
 * matched by its copied text, so a rename that could not repair one leaves that
 * request's history unreachable, and the operator is the only one who can
 * re-link it.
 */
function describeRename(itemsUpdated: number, unresolved: number): string {
  const parts: string[] = [];
  if (itemsUpdated === 0) {
    parts.push("No items used this.");
  } else {
    parts.push(
      `${itemsUpdated} ${itemsUpdated === 1 ? "item now uses" : "items now use"} the new name.`
    );
  }
  if (unresolved > 0) {
    parts.push(
      `${unresolved} older ${unresolved === 1 ? "request" : "requests"} could not be relinked — check their history.`
    );
  }
  return parts.join(" ");
}

export interface TermPickerProps {
  /** `"All"`-style row for the filter bars; omitted by the forms. */
  allLabel?: string;
  "aria-label"?: string;
  className?: string;
  /**
   * A row that empties the field, shown only while a value is set. Omit it where
   * a value cannot be unset — the filter bars, where "no filter" is already the
   * `All` row.
   */
  clearLabel?: string;
  copy: TermCopy;
  /**
   * Locks the field: the trigger stops opening and reads as unavailable. Used
   * where a choice made elsewhere makes this list inapplicable (V4).
   */
  disabled?: boolean;
  entries: TermEntry[];
  /** Field-level message rendered under the trigger. */
  error?: string | null;
  hasError: boolean;
  /** Rendered under the control when there is no error. */
  hint?: ReactNode;
  /** Red border without a message — what a delivery-sheet cell reports. */
  invalid?: boolean;
  isLoading: boolean;
  /** Rendered above the trigger; omitted by the filter bars, which have no room. */
  label?: ReactNode;
  /** Named to match a `<label>` in the surrounding form; also the trigger's id. */
  name?: string;
  normalize: (raw: string) => string;
  onChange: (name: string) => void;
  placeholder?: string;
  /** Tooltip for the unlabelled cell variant. */
  title?: string;
  validate: (
    name: string,
    existing: readonly string[],
    options?: { ignore?: string }
  ) => string | null;
  value: string;
  variant?: TermPickerVariant;
  writes: TermWrites;
}

export function TermPicker({
  "aria-label": ariaLabel,
  allLabel,
  className,
  clearLabel,
  copy,
  disabled,
  entries,
  error,
  hasError,
  hint,
  invalid,
  isLoading,
  label,
  name,
  normalize,
  onChange,
  placeholder,
  title,
  validate,
  value,
  variant = "field",
  writes,
}: TermPickerProps) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const inputId = `${labelId}-name`;

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
  const display = collapsed ? (placeholder ?? "") : value;

  // A `span` rather than a `div`: the delivery sheet renders this inside its
  // cell chrome, and a block element inside a phrasing one is invalid HTML.
  return (
    <span className={cn("block", className)}>
      {label === undefined ? null : (
        <span className={FIELD_LABEL_CLASS} id={labelId}>
          {label}
        </span>
      )}

      <Popover
        onOpenChange={disabled ? undefined : handleOpenChange}
        open={disabled ? false : open}
      >
        <PopoverTrigger
          aria-disabled={disabled ? true : undefined}
          aria-invalid={rejected ? true : undefined}
          aria-label={
            label === undefined ? (ariaLabel ?? copy.triggerName) : undefined
          }
          aria-labelledby={label === undefined ? undefined : labelId}
          className={cn(
            TRIGGER_CLASS[variant],
            rejected && "border-destructive",
            disabled && "cursor-not-allowed opacity-50"
          )}
          disabled={disabled}
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
              aria-label={copy.panelLabel}
              className="surface-frosted w-64 max-w-[calc(100vw-2rem)] p-2"
            >
              <TermPanel
                allLabel={allLabel}
                clearLabel={clearLabel}
                copy={copy}
                entries={entries}
                hasError={hasError}
                inputId={inputId}
                isLoading={isLoading}
                normalize={normalize}
                onChange={onChange}
                onSelect={select}
                validate={validate}
                value={value}
                writes={writes}
              />
            </PopoverPopup>
          </PopoverPositioner>
        </PopoverPortal>
      </Popover>

      {variant === "field" ? <FieldMessages error={error} hint={hint} /> : null}
    </span>
  );
}
