import { Button } from "@cmis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cmis/ui/components/dialog";
import { Textarea } from "@cmis/ui/components/textarea";
import { cn } from "@cmis/ui/lib/utils";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import {
  columnFor,
  groupsFromPaste,
  type ParsedPaste,
  parsePaste,
  SHEET_COLUMNS,
  type SheetColumn,
  type SheetColumnKey,
  type SheetMapping,
} from "../../creation/paste";
import type { SheetDefaults, SheetGroup } from "../../creation/sheet-types";
import { CELL_CLASS, HINT_CLASS } from "./field-styles";
import { formatCount, plural } from "./summary-text";

/**
 * Spec §7.4 — `Paste rows`.
 *
 * Paste only ever fills the draft: the parse is pure, the preview is the real
 * result, and an unrecognised header has to be dealt with explicitly rather than
 * guessed at, so a quantity can never quietly land in the pack-size column.
 */

type ColumnChoice = SheetColumnKey | "ignore";

const IGNORE = "ignore";

const PLACEHOLDER = [
  "Product name\tBatch / Lot\tExpiry\tQty",
  "Paracetamol\tB-2027-01\t2027-03-01\t200",
  "Paracetamol\tB-2027-02\t2027-05-01\t200",
  "Cetirizine\tC-1\t2027-12-01\t100",
].join("\n");

const COLUMN_OPTIONS = SHEET_COLUMNS.map((column: SheetColumn) => ({
  label: column.label,
  value: column.key,
}));

function effectiveMapping(
  parsed: ParsedPaste,
  overrides: Record<number, ColumnChoice>
): SheetMapping {
  const mapping: SheetMapping = { ...parsed.mapping };
  for (const [rawIndex, choice] of Object.entries(overrides)) {
    const index = Number(rawIndex);
    // A pasted column feeds one field at most, so anything it used to feed is
    // released first — including when the operator chose to ignore it.
    for (const [field, mapped] of Object.entries(mapping) as [
      SheetColumnKey,
      number,
    ][]) {
      if (mapped === index) {
        delete mapping[field];
      }
    }
    if (choice !== IGNORE) {
      mapping[choice] = index;
    }
  }
  return mapping;
}

export function PasteRowsDialog({
  defaults,
  onOpenChange,
  onPasted,
  open,
}: {
  defaults: SheetDefaults;
  onOpenChange: (open: boolean) => void;
  onPasted: (groups: SheetGroup[], notice: string) => void;
  open: boolean;
}) {
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Record<number, ColumnChoice>>({});

  const parsed = useMemo(() => parsePaste(text), [text]);
  const mapping = useMemo(
    () => effectiveMapping(parsed, overrides),
    [overrides, parsed]
  );

  const { headers } = parsed;
  /** Headers no column claimed and the operator has not decided about yet. */
  const undecided = useMemo(() => {
    if (!headers) {
      return [];
    }
    return headers
      .map((header, index) => ({ header, index }))
      .filter(
        ({ header, index }) =>
          overrides[index] === undefined && columnFor(header) === null
      );
  }, [headers, overrides]);

  const outcome = useMemo(() => {
    if (headers === null && text.trim() === "") {
      return null;
    }
    const prepared: ParsedPaste = { ...parsed, mapping };
    return groupsFromPaste(prepared, defaults);
  }, [defaults, headers, mapping, parsed, text]);

  const mappedIndexes = new Set(Object.values(mapping));
  const ignoredColumns = (headers ?? [])
    .map((header, index) => ({ header, index }))
    .filter(({ index }) => !mappedIndexes.has(index));

  const handleText = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    // A new paste is a new set of columns, so every decision starts over.
    setOverrides({});
  }, []);

  const handleChoice = useCallback((index: number, choice: ColumnChoice) => {
    setOverrides((prev) => ({ ...prev, [index]: choice }));
  }, []);

  // The column index is the identity here, so it travels on the element and
  // every row shares one handler instead of allocating one per render.
  const handleChoiceChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const index = Number(event.currentTarget.dataset.columnIndex);
      if (Number.isFinite(index)) {
        handleChoice(index, event.currentTarget.value as ColumnChoice);
      }
    },
    [handleChoice]
  );

  const handleAdd = useCallback(() => {
    if (!outcome) {
      return;
    }
    const notice =
      ignoredColumns.length === 0
        ? `Pasted ${plural(outcome.rows, "row", "rows")}`
        : `Pasted ${plural(outcome.rows, "row", "rows")} · ignored ${plural(
            ignoredColumns.length,
            "column",
            "columns"
          )}: ${ignoredColumns.map(({ header }) => header).join(", ")}`;
    onPasted(outcome.groups, notice);
    setText("");
    setOverrides({});
    onOpenChange(false);
  }, [ignoredColumns, onOpenChange, onPasted, outcome]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setText("");
        setOverrides({});
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleCancel = useCallback(
    () => handleOpenChange(false),
    [handleOpenChange]
  );

  const batchCount = outcome
    ? outcome.groups.reduce(
        (sum, group) => sum + group.product.batches.length,
        0
      )
    : 0;
  const blocked = undecided.length > 0 || batchCount === 0;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste rows</DialogTitle>
          <DialogDescription>
            Paste from a spreadsheet or a CSV. Columns are matched by their
            header when there is one, and by order when there is not. Nothing is
            written until you review the sheet.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          aria-label="Rows to paste"
          className="min-h-32 font-mono text-[11px]"
          onChange={handleText}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          value={text}
        />

        {undecided.length > 0 ? (
          <div
            className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2"
            role="alert"
          >
            <p className="text-caption">
              We couldn&apos;t match these columns:{" "}
              <strong>
                {undecided.map(({ header }) => header).join(", ")}
              </strong>
              . Tell us where they belong — or ignore them — before the rows are
              added.
            </p>
          </div>
        ) : null}

        {headers ? (
          <div className="space-y-1">
            <p className="font-medium text-caption">Map columns</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {headers.map((header, index) => {
                const matched = columnFor(header);
                const choice = overrides[index];
                const value: ColumnChoice = choice ?? matched?.key ?? IGNORE;
                const needsDecision = undecided.some(
                  (entry) => entry.index === index
                );
                // Paste columns are positional: the mapping is keyed by index,
                // so that index is the only stable identity a row can have.
                const columnLabel =
                  header.trim() === "" ? `Column ${index + 1}` : header;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: paste columns are positional, so the index is their identity
                  <li className="flex items-center gap-2" key={index}>
                    <span className="w-28 shrink-0 truncate text-caption text-muted-foreground">
                      {columnLabel}
                    </span>
                    <select
                      aria-label={`Column feeding ${columnLabel}`}
                      className={cn(
                        CELL_CLASS,
                        needsDecision && "border-[var(--warning)]"
                      )}
                      data-column-index={index}
                      onChange={handleChoiceChange}
                      value={value}
                    >
                      <option value={IGNORE}>Ignore</option>
                      {COLUMN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {outcome && batchCount > 0 ? (
          <p aria-live="polite" className={HINT_CLASS}>
            {plural(outcome.groups.length, "product", "products")} ·{" "}
            {plural(batchCount, "batch", "batches")}
            {parsed.headers ? "" : " · matched by column order"}
          </p>
        ) : null}

        {ignoredColumns.length > 0 ? (
          <p className={HINT_CLASS}>
            Ignoring{" "}
            {ignoredColumns
              .map(({ header }) => header || "an unnamed column")
              .join(", ")}
            {outcome ? ` · ${formatCount(outcome.rows)} rows read` : ""}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            className="press-feedback"
            onClick={handleCancel}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="press-feedback"
            disabled={blocked}
            onClick={handleAdd}
          >
            {batchCount === 0
              ? "Add rows"
              : `Add ${plural(batchCount, "batch", "batches")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
