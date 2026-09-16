import { Button } from "@cmis/ui/components/button";
import { todayIso } from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  type BatchDraft,
  duplicateBatchIndexes,
  newBatchDraftRow,
} from "../../creation/draft";
import type { DraftValidation } from "../../creation/validate-draft";
import { DateField, StepperField, TextField } from "./fields";
import { batchSummary } from "./summary-text";

/**
 * Spec §7.2 Section B — the repeatable batch row editor, shared by Path 1 and
 * Path 2 so a lot row means the same thing wherever it is typed.
 *
 * Reorder is keyboard-driven rather than drag-and-drop: row order is never
 * written to the database, so a pointer drag would buy nothing an operator on a
 * keyboard could not already do.
 */

interface BatchRowsEditorProps {
  /** Zero-stock products may have no rows at all (spec §10.4). */
  allowEmpty: boolean;
  batches: BatchDraft[];
  /** Set while the review step is pointing back at one row. */
  highlightRowId?: string | null;
  /** @deprecated supplier UI removed — kept for type compatibility */
  inheritedSupplier?: string;
  onChange: (batches: BatchDraft[]) => void;
  /** When true all validation errors are forced visible (after Review click). */
  showErrors?: boolean;
  /** @deprecated supplier UI removed — kept for type compatibility */
  suppliers?: string[];
  validation: DraftValidation;
}

function issueFor(
  validation: DraftValidation,
  rowId: string,
  column: string
): string | null {
  const error = validation.errors.find(
    (issue) => issue.rowId === rowId && issue.field.endsWith(`.${column}`)
  );
  return error?.message ?? null;
}

function BatchRow({
  canRemove,
  duplicated,
  focus,
  highlighted,
  index,
  isFirst,
  isLast,
  onDuplicate,
  onMove,
  onPatch,
  onRemove,
  row,
  showErrors,
  touched,
  validation,
  onTouched,
}: {
  canRemove: boolean;
  duplicated: boolean;
  focus: boolean;
  highlighted: boolean;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onDuplicate: (rowId: string) => void;
  onMove: (rowId: string, delta: -1 | 1) => void;
  onPatch: (rowId: string, patch: Partial<BatchDraft>) => void;
  onRemove: (rowId: string) => void;
  row: BatchDraft;
  showErrors?: boolean;
  touched: Set<string>;
  validation: DraftValidation;
  onTouched: (rowId: string, column: string) => void;
}) {
  const label = row.batch.trim() || `row ${index + 1}`;
  const shouldShow = (column: string) =>
    Boolean(showErrors) || touched.has(`${row.id}:${column}`);
  const batchError = shouldShow("batch")
    ? issueFor(validation, row.id, "batch")
    : null;
  const expiryError = shouldShow("expiry")
    ? issueFor(validation, row.id, "expiry")
    : null;
  const qtyError = shouldShow("qty")
    ? issueFor(validation, row.id, "qty")
    : null;
  const showDuplicated = shouldShow("batch") && duplicated;

  const handleBatch = useCallback(
    (value: string) => {
      onTouched(row.id, "batch");
      onPatch(row.id, { batch: value });
    },
    [onPatch, onTouched, row.id]
  );
  const handleExpiry = useCallback(
    (value: string) => {
      onTouched(row.id, "expiry");
      onPatch(row.id, { expiry: value });
    },
    [onPatch, onTouched, row.id]
  );
  const handleQty = useCallback(
    (value: number | "") => {
      onTouched(row.id, "qty");
      onPatch(row.id, { qty: value });
    },
    [onPatch, onTouched, row.id]
  );
  const handleNotes = useCallback(
    (value: string) => onPatch(row.id, { notes: value }),
    [onPatch, row.id]
  );
  const handleDuplicate = useCallback(
    () => onDuplicate(row.id),
    [onDuplicate, row.id]
  );
  const handleRemove = useCallback(() => onRemove(row.id), [onRemove, row.id]);
  const handleMoveUp = useCallback(() => onMove(row.id, -1), [onMove, row.id]);
  const handleMoveDown = useCallback(() => onMove(row.id, 1), [onMove, row.id]);

  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-3",
        highlighted ? "border-destructive" : "border-border"
      )}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField
          autoFocus={focus}
          error={
            batchError ??
            (showDuplicated ? "Duplicate batch number on this product." : null)
          }
          label="Batch / Lot"
          name={`batch-${row.id}`}
          onChange={handleBatch}
          placeholder="B-2027-01"
          value={row.batch}
        />

        <DateField
          error={expiryError}
          label="Expiry"
          min={todayIso()}
          name={`expiry-${row.id}`}
          onChange={handleExpiry}
          placeholder="Select expiry date"
          value={row.expiry}
        />

        <StepperField
          ariaLabel={`Quantity for ${label}`}
          error={qtyError}
          label="Qty"
          min={1}
          name={`qty-${row.id}`}
          onChange={handleQty}
          placeholder="0"
          value={row.qty}
        />

        <TextField
          className="sm:col-span-2"
          label={
            <>
              Batch notes{" "}
              <span className="text-muted-foreground">(optional)</span>
            </>
          }
          name={`notes-${row.id}`}
          onChange={handleNotes}
          placeholder="Delivery note…"
          value={row.notes}
        />
      </div>

      <div className="mt-2 flex items-center justify-end gap-1">
        <Button
          aria-label={`Move ${label} up`}
          disabled={isFirst}
          onClick={handleMoveUp}
          size="sm"
          variant="ghost"
        >
          <ChevronUp aria-hidden className="size-4" />
        </Button>
        <Button
          aria-label={`Move ${label} down`}
          disabled={isLast}
          onClick={handleMoveDown}
          size="sm"
          variant="ghost"
        >
          <ChevronDown aria-hidden className="size-4" />
        </Button>
        <Button onClick={handleDuplicate} size="sm" variant="ghost">
          <Copy aria-hidden className="size-3.5" />
          Duplicate
        </Button>
        <Button
          aria-label={`Remove ${label}`}
          disabled={!canRemove}
          onClick={handleRemove}
          size="sm"
          variant="ghost"
        >
          <Trash2 aria-hidden className="size-3.5" />
          Remove
        </Button>
      </div>
    </li>
  );
}

export function BatchRowsEditor({
  allowEmpty,
  batches,
  highlightRowId,
  onChange,
  showErrors,
  validation,
}: BatchRowsEditorProps) {
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(() => new Set<string>());
  const handleTouched = useCallback((rowId: string, column: string) => {
    const key = `${rowId}:${column}`;
    setTouched((prev) => {
      if (prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);
  // Client-side only: the message comes from validation, so the two cannot drift.
  const duplicateIndexes = useMemo(
    () => new Set(duplicateBatchIndexes(batches)),
    [batches]
  );

  const patch = useCallback(
    (rowId: string, updates: Partial<BatchDraft>) => {
      onChange(
        batches.map((row) => (row.id === rowId ? { ...row, ...updates } : row))
      );
    },
    [batches, onChange]
  );

  const duplicate = useCallback(
    (rowId: string) => {
      const index = batches.findIndex((entry) => entry.id === rowId);
      if (index === -1) {
        return;
      }
      // A copy keeps everything except the lot number: duplicating a delivery
      // rarely means "and the same lot again", which is blocked anyway.
      const copy: BatchDraft = {
        ...newBatchDraftRow(batches[index]),
        batch: "",
      };
      const next = [...batches];
      next.splice(index + 1, 0, copy);
      setFocusRowId(copy.id);
      onChange(next);
    },
    [batches, onChange]
  );

  const remove = useCallback(
    (rowId: string) => {
      onChange(batches.filter((entry) => entry.id !== rowId));
    },
    [batches, onChange]
  );

  const move = useCallback(
    (rowId: string, delta: -1 | 1) => {
      const index = batches.findIndex((entry) => entry.id === rowId);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= batches.length) {
        return;
      }
      const next = [...batches];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      onChange(next);
    },
    [batches, onChange]
  );

  const add = useCallback(() => {
    const row = newBatchDraftRow();
    setFocusRowId(row.id);
    onChange([...batches, row]);
  }, [batches, onChange]);

  // One row must survive unless the product is being created with zero stock
  // (spec §10.4): removing the last row would leave nothing to create.
  const removable = allowEmpty || batches.length > 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground text-sm">Batches</h3>
        <p
          aria-live="polite"
          className="text-caption text-muted-foreground tabular-nums"
        >
          {batchSummary(batches)}
        </p>
      </div>

      {batches.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-caption text-muted-foreground">
          No batches — this product will be registered with zero stock.
        </p>
      ) : null}

      <ul className="space-y-2">
        {batches.map((row, index) => (
          <BatchRow
            canRemove={removable}
            duplicated={duplicateIndexes.has(index)}
            focus={row.id === focusRowId}
            highlighted={highlightRowId === row.id}
            index={index}
            isFirst={index === 0}
            isLast={index === batches.length - 1}
            key={row.id}
            onDuplicate={duplicate}
            onMove={move}
            onPatch={patch}
            onRemove={remove}
            onTouched={handleTouched}
            row={row}
            showErrors={showErrors}
            touched={touched}
            validation={validation}
          />
        ))}
      </ul>

      <Button
        className="press-feedback"
        onClick={add}
        size="sm"
        variant="outline"
      >
        <Plus aria-hidden className="size-3.5" />
        Add batch
      </Button>
    </div>
  );
}
