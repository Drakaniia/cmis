import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ClipboardPaste, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BatchDraft } from "../../../creation/draft";
import { SHEET_COLUMNS, SHEET_CONTENT_WIDTH } from "../../../creation/paste";
import {
  addSheetGroup,
  appendBatchRow,
  applyDefaultsToGroups,
  duplicateBatchRow,
  duplicateSheetGroup,
  groupTotals,
  moveBatchRow,
  moveSheetGroup,
  patchSheetGroup,
  removeBatchRow,
  removeSheetGroup,
  reorderSheetGroups,
  setGroupBatches,
  setGroupSku,
} from "../../../creation/sheet";
import type {
  SheetDefaultField,
  SheetDefaults,
  SheetGroup,
  SheetValidation,
} from "../../../creation/sheet-types";
import { validateSheet } from "../../../creation/sheet-validation";
import { deriveSku } from "../../../import/sku";
import { CARD_CLASS } from "../field-styles";
import type { ProductFormContext } from "../new-product-form";
import { PasteRowsDialog } from "../paste-rows-dialog";
import { SheetDefaultsStrip } from "../sheet-defaults-strip";
import { formatCount, plural } from "../summary-text";
import { BatchRow } from "./batch-row";
import {
  ACTION_WIDTH,
  BATCH_ROW_HEIGHT,
  GROUP_ROW_HEIGHT,
  HEADER_TEMPLATE,
} from "./constants";
import { frozenStyle } from "./grid";
import { GroupRow } from "./group-row";
import type { SheetHandlers, SheetRow } from "./types";

/**
 * Spec §7.4 — the delivery sheet: several products, each with its own batches,
 * committed in one reviewable draft.
 *
 * The grid is virtualized over a flat list of **group rows and batch rows**,
 * because decision 20 says the row count "varies by month" and neither end of
 * that range may be allowed to hurt. Product-level columns stay on the group row
 * — the only place they can be edited — and each batch row repeats them as
 * read-only context, so a row means the same thing whichever half of the grid is
 * on screen.
 */
export function DeliverySheet({
  context,
  defaults,
  groups,
  highlightGroupId,
  onCancel,
  onChange,
  onDefaultsChange,
  onSubmit,
}: {
  context: ProductFormContext;
  defaults: SheetDefaults;
  groups: SheetGroup[];
  highlightGroupId?: string | null;
  onCancel: () => void;
  onChange: (groups: SheetGroup[]) => void;
  onDefaultsChange: (defaults: SheetDefaults) => void;
  onSubmit: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touchedGroups, setTouchedGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [touchedBatches, setTouchedBatches] = useState<Set<string>>(
    () => new Set()
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const markGroupTouched = useCallback((groupId: string, field: string) => {
    const key = `${groupId}:${field}`;
    setTouchedGroups((prev) => {
      if (prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);
  const markBatchTouched = useCallback(
    (groupId: string, rowId: string, field: string) => {
      const key = `${groupId}:${rowId}:${field}`;
      setTouchedBatches((prev) => {
        if (prev.has(key)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    []
  );

  const validation: SheetValidation = useMemo(
    () =>
      validateSheet(groups, {
        identities: context.identities,
        skus: context.skus,
      }),
    [context.identities, context.skus, groups]
  );

  const rows = useMemo<SheetRow[]>(() => {
    const flat: SheetRow[] = [];
    groups.forEach((group, groupIndex) => {
      flat.push({ group, groupIndex, kind: "group" });
      group.product.batches.forEach((batchRow, indexInGroup) => {
        flat.push({
          batchRow,
          group,
          groupIndex,
          indexInGroup,
          kind: "batch",
          lastInGroup: indexInGroup === group.product.batches.length - 1,
        });
      });
    });
    return flat;
  }, [groups]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) =>
      rows[index]?.kind === "group" ? GROUP_ROW_HEIGHT : BATCH_ROW_HEIGHT,
    getItemKey: (index) => {
      const row = rows[index];
      if (!row) {
        return `row-${index}`;
      }
      return row.kind === "group"
        ? `group-${row.group.id}`
        : `batch-${row.group.id}-${row.batchRow.id}`;
    },
    getScrollElement: () => scrollRef.current,
    overscan: 6,
  });

  // The review step's "fix this" links land here, so the offending group has to
  // be brought back into view rather than merely outlined.
  useEffect(() => {
    if (!highlightGroupId) {
      return;
    }
    const index = rows.findIndex((row) => row.group.id === highlightGroupId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "start" });
    }
  }, [highlightGroupId, rows, virtualizer]);

  const totals = useMemo(
    () =>
      groups.reduce(
        (sum, group) => {
          const groupTotal = groupTotals(group);
          return {
            batches: sum.batches + groupTotal.batches,
            units: sum.units + groupTotal.units,
          };
        },
        { batches: 0, units: 0 }
      ),
    [groups]
  );

  const toggleSelect = useCallback((groupId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleAddGroup = useCallback(() => {
    onChange(addSheetGroup(groups, defaults).groups);
  }, [defaults, groups, onChange]);

  const handleOpenPaste = useCallback(() => setPasteOpen(true), []);

  const handleAddBatch = useCallback(
    (groupId: string) => onChange(appendBatchRow(groups, groupId)),
    [groups, onChange]
  );

  const handleGroupPatch = useCallback(
    (groupId: string, patch: Parameters<typeof patchSheetGroup>[2]) => {
      for (const field of Object.keys(patch)) {
        markGroupTouched(groupId, field);
      }
      onChange(patchSheetGroup(groups, groupId, patch));
    },
    [groups, markGroupTouched, onChange]
  );

  const handleSkuChange = useCallback(
    (groupId: string, sku: string) => {
      markGroupTouched(groupId, "sku");
      onChange(setGroupSku(groups, groupId, sku));
    },
    [groups, markGroupTouched, onChange]
  );

  const handleBatchChange = useCallback(
    (groupId: string, rowId: string, patch: Partial<BatchDraft>) => {
      for (const field of Object.keys(patch)) {
        markBatchTouched(groupId, rowId, field);
      }
      const group = groups.find((entry) => entry.id === groupId);
      if (!group) {
        return;
      }
      onChange(
        setGroupBatches(
          groups,
          groupId,
          group.product.batches.map((row) =>
            row.id === rowId ? { ...row, ...patch } : row
          )
        )
      );
    },
    [groups, markBatchTouched, onChange]
  );

  const handleNameBlur = useCallback(
    (groupId: string) => {
      markGroupTouched(groupId, "name");
      const group = groups.find((entry) => entry.id === groupId);
      if (!group || group.skuTouched || group.product.name.trim() === "") {
        return;
      }
      onChange(
        patchSheetGroup(groups, groupId, {
          // The SKU's strength suffix comes from the stored column, not from
          // re-parsing a composed string (decision 10).
          sku: deriveSku(
            group.product.name,
            group.product.strengthValue,
            context.rawSkus
          ),
        })
      );
    },
    [context.rawSkus, groups, markGroupTouched, onChange]
  );

  const handleDuplicateGroup = useCallback(
    (groupId: string) => onChange(duplicateSheetGroup(groups, groupId).groups),
    [groups, onChange]
  );
  const handleRemoveGroup = useCallback(
    (groupId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
      onChange(removeSheetGroup(groups, groupId));
    },
    [groups, onChange]
  );
  const handleDuplicateBatch = useCallback(
    (groupId: string, rowId: string) =>
      onChange(duplicateBatchRow(groups, groupId, rowId)),
    [groups, onChange]
  );
  const handleRemoveBatch = useCallback(
    (groupId: string, rowId: string) =>
      onChange(removeBatchRow(groups, groupId, rowId)),
    [groups, onChange]
  );
  const handleMoveBatch = useCallback(
    (groupId: string, rowId: string, delta: -1 | 1) =>
      onChange(moveBatchRow(groups, groupId, rowId, delta)),
    [groups, onChange]
  );
  const handleMoveGroup = useCallback(
    (groupId: string, delta: -1 | 1) =>
      onChange(moveSheetGroup(groups, groupId, delta)),
    [groups, onChange]
  );

  const handleDragStart = useCallback((groupId: string) => {
    setDraggingId(groupId);
  }, []);
  const handleDropOn = useCallback(
    (groupId: string) => {
      if (draggingId && draggingId !== groupId) {
        onChange(reorderSheetGroups(groups, draggingId, groupId));
      }
      setDraggingId(null);
    },
    [draggingId, groups, onChange]
  );

  const handleApplyToSelected = useCallback(
    (fields: SheetDefaultField[]) =>
      onChange(
        applyDefaultsToGroups(groups, [...selectedIds], defaults, fields)
      ),
    [defaults, groups, onChange, selectedIds]
  );

  const handleClearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handlePasted = useCallback(
    (pasted: SheetGroup[], notice: string) => {
      // Reported where the rows landed, not only in the dialog that closed.
      setPasteNotice(notice);
      onChange([...groups, ...pasted]);
    },
    [groups, onChange]
  );

  const handlers = useMemo<SheetHandlers>(
    () => ({
      onAddBatch: handleAddBatch,
      onBatchChange: handleBatchChange,
      onDragStart: handleDragStart,
      onDropOn: handleDropOn,
      onDuplicateBatch: handleDuplicateBatch,
      onDuplicateGroup: handleDuplicateGroup,
      onGroupPatch: handleGroupPatch,
      onMoveBatch: handleMoveBatch,
      onMoveGroup: handleMoveGroup,
      onNameBlur: handleNameBlur,
      onRemoveBatch: handleRemoveBatch,
      onRemoveGroup: handleRemoveGroup,
      onSkuChange: handleSkuChange,
      onToggleSelect: toggleSelect,
    }),
    [
      handleAddBatch,
      handleBatchChange,
      handleDragStart,
      handleDropOn,
      handleDuplicateBatch,
      handleDuplicateGroup,
      handleGroupPatch,
      handleMoveBatch,
      handleMoveGroup,
      handleNameBlur,
      handleRemoveBatch,
      handleRemoveGroup,
      handleSkuChange,
      toggleSelect,
    ]
  );

  const blocked = validation.errors.length > 0;

  const handleReview = useCallback(() => {
    if (blocked) {
      setSubmitAttempted(true);
      return;
    }
    onSubmit();
  }, [blocked, onSubmit]);

  return (
    <div className="space-y-3">
      <SheetDefaultsStrip
        defaults={defaults}
        groupCount={groups.length}
        onApply={handleApplyToSelected}
        onChange={onDefaultsChange}
        selectedCount={selectedIds.size}
        suppliers={context.suppliers}
      />

      <div className="flex flex-wrap items-center gap-2">
        <p
          aria-live="polite"
          className="flex-1 text-caption text-muted-foreground"
        >
          {plural(groups.length, "group", "groups")} ·{" "}
          {plural(totals.batches, "batch", "batches")} ·{" "}
          {formatCount(totals.units)} units
          {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
        </p>
        {selectedIds.size > 0 ? (
          <Button onClick={handleClearSelection} size="sm" variant="ghost">
            Clear
          </Button>
        ) : null}
        <Button
          className="press-feedback"
          onClick={handleOpenPaste}
          size="sm"
          variant="outline"
        >
          <ClipboardPaste aria-hidden className="size-3.5" />
          Paste rows
        </Button>
        <Button
          className="press-feedback"
          onClick={handleAddGroup}
          size="sm"
          variant="outline"
        >
          <Plus aria-hidden className="size-3.5" />
          Add product
        </Button>
      </div>

      {pasteNotice ? (
        <p aria-live="polite" className="text-caption text-muted-foreground">
          {pasteNotice}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <div className={cn(CARD_CLASS, "border-dashed px-6 py-8 text-center")}>
          <p className="font-medium text-sm">Nothing on this sheet yet</p>
          <p className="mt-1 text-caption text-muted-foreground">
            Add a product row, or paste a delivery copied from a spreadsheet.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button
              className="press-feedback"
              onClick={handleAddGroup}
              size="sm"
            >
              <Plus aria-hidden className="size-3.5" />
              Add product
            </Button>
            <Button onClick={handleOpenPaste} size="sm" variant="outline">
              <ClipboardPaste aria-hidden className="size-3.5" />
              Paste rows
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="overflow-auto rounded-xl border border-border bg-card"
          ref={scrollRef}
        >
          <div
            style={{ width: Math.max(SHEET_CONTENT_WIDTH + ACTION_WIDTH, 640) }}
          >
            <div
              className="sticky top-0 z-[2] grid items-center gap-1.5 border-border/60 border-b bg-muted px-0 py-1.5 font-medium text-caption"
              role="presentation"
              style={{ gridTemplateColumns: HEADER_TEMPLATE }}
            >
              {SHEET_COLUMNS.map((column, index) => (
                <span
                  className={cn(
                    "min-w-0",
                    column.frozen && "sticky z-[1] bg-muted"
                  )}
                  key={column.key}
                  style={frozenStyle(index)}
                >
                  <span className="block truncate px-1">{column.label}</span>
                </span>
              ))}
              <span className="px-1 text-right">Actions</span>
            </div>

            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: "relative",
                width: "100%",
              }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                if (!row) {
                  return null;
                }
                return (
                  <div
                    key={item.key}
                    style={{
                      height: `${item.size}px`,
                      left: 0,
                      position: "absolute",
                      top: 0,
                      transform: `translateY(${item.start}px)`,
                      width: "100%",
                    }}
                  >
                    {row.kind === "group" ? (
                      <GroupRow
                        dragging={draggingId === row.group.id}
                        group={row.group}
                        groupCount={groups.length}
                        groupIndex={row.groupIndex}
                        handlers={handlers}
                        highlighted={highlightGroupId === row.group.id}
                        issues={validation.errors}
                        selected={selectedIds.has(row.group.id)}
                        showErrors={submitAttempted}
                        suppliers={context.suppliers}
                        touched={touchedGroups}
                      />
                    ) : (
                      <BatchRow
                        batchRow={row.batchRow}
                        group={row.group}
                        groupIndex={row.groupIndex}
                        handlers={handlers}
                        indexInGroup={row.indexInGroup}
                        issues={validation.errors}
                        lastInGroup={row.lastInGroup}
                        showErrors={submitAttempted}
                        suppliers={context.suppliers}
                        touched={touchedBatches}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          Back
        </Button>
        <Button
          className="press-feedback"
          disabled={groups.length === 0}
          onClick={handleReview}
          type="button"
        >
          Review
        </Button>
      </div>

      <PasteRowsDialog
        defaults={defaults}
        onOpenChange={setPasteOpen}
        onPasted={handlePasted}
        open={pasteOpen}
      />
    </div>
  );
}
