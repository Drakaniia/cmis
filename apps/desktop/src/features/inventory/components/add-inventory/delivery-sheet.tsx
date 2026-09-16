import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { todayIso } from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ClipboardPaste,
  Copy,
  GripVertical,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type BatchDraft,
  displayNameOf,
  thresholdOf,
} from "../../creation/draft";
import {
  frozenOffset,
  SHEET_COLUMNS,
  SHEET_CONTENT_WIDTH,
} from "../../creation/paste";
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
  type SheetDefaultField,
  type SheetDefaults,
  type SheetGroup,
  type SheetIssue,
  type SheetValidation,
  setGroupBatches,
  setGroupSku,
  validateSheet,
} from "../../creation/sheet";
import { deriveSku } from "../../import/sku";
import { CARD_CLASS } from "./field-styles";
import type { ProductFormContext } from "./new-product-form";
import { PasteRowsDialog } from "./paste-rows-dialog";
import {
  CellCategory,
  CellDate,
  CellQty,
  CellSelect,
  CellStatic,
  CellText,
  FORM_OPTIONS,
  STRENGTH_UNIT_OPTIONS,
} from "./sheet-cells";
import { SheetDefaultsStrip } from "./sheet-defaults-strip";
import { formatCount, plural } from "./summary-text";

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

const ACTION_WIDTH = 150;
const GROUP_ROW_HEIGHT = 96;
const BATCH_ROW_HEIGHT = 48;

const px = (width: number): string => `${width}px`;

/**
 * Read-only context on a batch row: what the group already carries, or an em
 * dash when the group left the field blank.
 */
const inherited = (value: string): string =>
  value.trim() === "" ? "—" : value;

const FROZEN = SHEET_COLUMNS.filter((column) => column.frozen);
const FROZEN_WIDTH = FROZEN.reduce((sum, column) => sum + column.width, 0);
const FIRST_FROZEN_WIDTH = FROZEN[0]?.width ?? 0;

/** Batch rows track every column; the group row spans the batch columns. */
const BATCH_TEMPLATE = [
  ...SHEET_COLUMNS.map((column) => column.width),
  ACTION_WIDTH,
]
  .map(px)
  .join(" ");

const GROUP_TEMPLATE = [
  FIRST_FROZEN_WIDTH,
  FROZEN_WIDTH - FIRST_FROZEN_WIDTH,
  ...SHEET_COLUMNS.slice(FROZEN.length).map((column) => column.width),
  ACTION_WIDTH,
]
  .map(px)
  .join(" ");

const HEADER_TEMPLATE = BATCH_TEMPLATE;

interface SheetRowBase {
  group: SheetGroup;
  groupIndex: number;
}

type SheetRow =
  | (SheetRowBase & { kind: "group" })
  | (SheetRowBase & {
      batchRow: BatchDraft;
      indexInGroup: number;
      kind: "batch";
      lastInGroup: boolean;
    });

interface SheetHandlers {
  onAddBatch: (groupId: string) => void;
  onBatchChange: (
    groupId: string,
    rowId: string,
    patch: Partial<BatchDraft>
  ) => void;
  onDragStart: (groupId: string) => void;
  onDropOn: (groupId: string) => void;
  onDuplicateBatch: (groupId: string, rowId: string) => void;
  onDuplicateGroup: (groupId: string) => void;
  onGroupPatch: (
    groupId: string,
    patch: Parameters<typeof patchSheetGroup>[2]
  ) => void;
  onMoveBatch: (groupId: string, rowId: string, delta: -1 | 1) => void;
  onMoveGroup: (groupId: string, delta: -1 | 1) => void;
  onNameBlur: (groupId: string) => void;
  onRemoveBatch: (groupId: string, rowId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onSkuChange: (groupId: string, sku: string) => void;
  onToggleSelect: (groupId: string) => void;
}

/** Frozen cells stay put while the right zone scrolls; the offset is the width sum. */
function cellClass(index: number, tone: string): string {
  const column = SHEET_COLUMNS[index];
  return cn("min-w-0", column?.frozen && `sticky z-[1] ${tone}`);
}

function frozenStyle(index: number): CSSProperties | undefined {
  return SHEET_COLUMNS[index]?.frozen
    ? { left: frozenOffset(index) }
    : undefined;
}

function rowIssue(
  issues: SheetIssue[],
  rowId: string,
  column: string
): string | null {
  const found = issues.find(
    (issue) => issue.rowId === rowId && issue.field.endsWith(`.${column}`)
  );
  return found?.message ?? null;
}

function groupIssues(issues: SheetIssue[]): SheetIssue[] {
  return issues.filter((issue) => issue.rowId === undefined);
}

function IssueChip({ issues }: { issues: SheetIssue[] }) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <span
      aria-label={`${plural(issues.length, "issue", "issues")}: ${issues
        .map((issue) => issue.message)
        .join("; ")}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 font-medium text-[10px] text-destructive"
      role="status"
      title={issues.map((issue) => issue.message).join("\n")}
    >
      <TriangleAlert aria-hidden className="size-3" />
      {issues.length}
    </span>
  );
}

function GroupRow({
  dragging,
  group,
  groupIndex,
  groupCount,
  handlers,
  highlighted,
  issues,
  selected,
  showErrors,
  touched,
}: {
  dragging: boolean;
  group: SheetGroup;
  groupCount: number;
  groupIndex: number;
  handlers: SheetHandlers;
  highlighted: boolean;
  issues: SheetIssue[];
  selected: boolean;
  showErrors?: boolean;
  touched: ReadonlySet<string>;
  suppliers?: string[];
}) {
  const { product } = group;
  const totals = groupTotals(group);
  const own = groupIssues(issues);

  const handleToggle = useCallback(
    () => handlers.onToggleSelect(group.id),
    [group.id, handlers]
  );
  const handleDragStart = useCallback(
    () => handlers.onDragStart(group.id),
    [group.id, handlers]
  );
  const handleDrop = useCallback(
    () => handlers.onDropOn(group.id),
    [group.id, handlers]
  );
  const handleDragOver = useCallback(
    (event: { preventDefault: () => void }) => {
      event.preventDefault();
    },
    []
  );
  const handleName = useCallback(
    (value: string) => handlers.onGroupPatch(group.id, { name: value }),
    [group.id, handlers]
  );
  const handleSku = useCallback(
    (value: string) => handlers.onSkuChange(group.id, value),
    [group.id, handlers]
  );
  const handleCategory = useCallback(
    (value: string) => handlers.onGroupPatch(group.id, { category: value }),
    [group.id, handlers]
  );
  const handleStrength = useCallback(
    (value: string) =>
      handlers.onGroupPatch(group.id, { strengthValue: value }),
    [group.id, handlers]
  );
  const handleUnit = useCallback(
    (value: string) => handlers.onGroupPatch(group.id, { strengthUnit: value }),
    [group.id, handlers]
  );
  const handleForm = useCallback(
    (value: string) => handlers.onGroupPatch(group.id, { form: value }),
    [group.id, handlers]
  );
  const handlePack = useCallback(
    (value: string) => handlers.onGroupPatch(group.id, { packSize: value }),
    [group.id, handlers]
  );
  const handleThreshold = useCallback(
    (value: number | "") =>
      handlers.onGroupPatch(group.id, { threshold: value }),
    [group.id, handlers]
  );
  const handleNotes = useCallback(
    (value: string) => handlers.onGroupPatch(group.id, { notes: value }),
    [group.id, handlers]
  );
  const handleDuplicate = useCallback(
    () => handlers.onDuplicateGroup(group.id),
    [group.id, handlers]
  );
  const handleRemove = useCallback(
    () => handlers.onRemoveGroup(group.id),
    [group.id, handlers]
  );
  const handleAddBatch = useCallback(
    () => handlers.onAddBatch(group.id),
    [group.id, handlers]
  );
  const handleMoveUp = useCallback(
    () => handlers.onMoveGroup(group.id, -1),
    [group.id, handlers]
  );
  const handleMoveDown = useCallback(
    () => handlers.onMoveGroup(group.id, 1),
    [group.id, handlers]
  );
  const handleBlur = useCallback(
    () => handlers.onNameBlur(group.id),
    [group.id, handlers]
  );

  const mark = (field: SheetDefaultField): boolean =>
    group.overridden.includes(field);
  const shouldShowGroupField = (field: string) =>
    Boolean(showErrors) || touched.has(`${group.id}:${field}`);
  const errorFor = (field: string): string | null => {
    if (!shouldShowGroupField(field)) {
      return null;
    }
    return own.find((issue) => issue.field === field)?.message ?? null;
  };
  const visibleOwn = showErrors
    ? own
    : own.filter((issue) => touched.has(`${group.id}:${issue.field}`));

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: HTML5 drop target; reordering is also offered by the row's Move up/down buttons
    <div
      className={cn(
        "grid items-center gap-1.5 border-border/60 border-b py-2",
        highlighted
          ? "bg-destructive/5 ring-1 ring-destructive/40 ring-inset"
          : "bg-card"
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ gridTemplateColumns: GROUP_TEMPLATE }}
    >
      <div className={cellClass(0, "bg-card")} style={frozenStyle(0)}>
        <CellText
          invalid={Boolean(errorFor("name"))}
          label={`Product name for group ${groupIndex + 1}`}
          onBlur={handleBlur}
          onChange={handleName}
          placeholder="Medicine name"
          value={product.name}
        />
      </div>

      <div
        className="sticky z-[1] flex min-w-0 items-center gap-1.5 bg-card pl-1"
        style={{ left: FIRST_FROZEN_WIDTH }}
      >
        <Checkbox
          aria-label={`Select group ${groupIndex + 1}`}
          checked={selected}
          onCheckedChange={handleToggle}
        />
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: drag affordance only; keyboard users reorder with the row's Move up/down buttons */}
        <span
          className={cn(
            "inline-flex cursor-grab items-center text-muted-foreground",
            dragging && "text-primary"
          )}
          draggable
          onDragStart={handleDragStart}
          title="Drag to reorder"
        >
          <GripVertical aria-hidden className="size-4" />
        </span>
        <span className="truncate font-medium text-caption">
          Group {groupIndex + 1} of {groupCount}
        </span>
        <span className="truncate text-caption text-muted-foreground">
          {plural(totals.batches, "batch", "batches")} ·{" "}
          {formatCount(totals.units)} units
        </span>
        <IssueChip issues={visibleOwn} />
      </div>

      <div className="min-w-0">
        <CellText
          invalid={Boolean(errorFor("sku"))}
          label={`SKU for group ${groupIndex + 1}`}
          onChange={handleSku}
          placeholder="SKU-…"
          value={product.sku}
        />
      </div>
      <div className="min-w-0">
        <CellCategory
          invalid={Boolean(errorFor("category"))}
          label={`Category for group ${groupIndex + 1}`}
          mark={mark("category")}
          onChange={handleCategory}
          value={product.category}
        />
      </div>
      <div className="min-w-0">
        <CellText
          label={`Strength for group ${groupIndex + 1}`}
          onChange={handleStrength}
          placeholder="Strength"
          value={product.strengthValue}
        />
      </div>
      <div className="min-w-0">
        <CellSelect
          label={`Strength unit for group ${groupIndex + 1}`}
          mark={mark("strengthUnit")}
          onChange={handleUnit}
          options={STRENGTH_UNIT_OPTIONS}
          placeholder="Unit"
          value={product.strengthUnit}
        />
      </div>
      <div className="min-w-0">
        <CellSelect
          label={`Form for group ${groupIndex + 1}`}
          mark={mark("form")}
          onChange={handleForm}
          options={FORM_OPTIONS}
          placeholder="Form"
          value={product.form}
        />
      </div>
      <div className="min-w-0">
        <CellText
          label={`Pack size for group ${groupIndex + 1}`}
          onChange={handlePack}
          placeholder="Pack size"
          value={product.packSize}
        />
      </div>
      <div className="min-w-0">
        <CellStatic>—</CellStatic>
      </div>
      <div className="min-w-0">
        <CellQty
          label={`Threshold for group ${groupIndex + 1}`}
          min={0}
          onChange={handleThreshold}
          value={product.threshold}
        />
      </div>
      <div className="min-w-0">
        <CellText
          label={`Notes for group ${groupIndex + 1}`}
          onChange={handleNotes}
          placeholder="Notes"
          value={product.notes}
        />
      </div>

      <div className="flex items-center justify-end gap-1 pr-2">
        <Button
          aria-label={`Add a batch to group ${groupIndex + 1}`}
          className="press-feedback"
          onClick={handleAddBatch}
          size="sm"
          variant="outline"
        >
          <Plus aria-hidden className="size-3.5" />
          Batch
        </Button>
        <Button
          aria-label={`Move group ${groupIndex + 1} up`}
          disabled={groupIndex === 0}
          onClick={handleMoveUp}
          size="icon-sm"
          variant="ghost"
        >
          ↑
        </Button>
        <Button
          aria-label={`Move group ${groupIndex + 1} down`}
          disabled={groupIndex === groupCount - 1}
          onClick={handleMoveDown}
          size="icon-sm"
          variant="ghost"
        >
          ↓
        </Button>
        <Button
          aria-label={`Duplicate group ${groupIndex + 1}`}
          onClick={handleDuplicate}
          size="icon-sm"
          variant="ghost"
        >
          <Copy aria-hidden className="size-3.5" />
        </Button>
        <Button
          aria-label={`Remove group ${groupIndex + 1}`}
          onClick={handleRemove}
          size="icon-sm"
          variant="ghost"
        >
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function BatchRow({
  batchRow,
  group,
  groupIndex,
  handlers,
  indexInGroup,
  issues,
  lastInGroup,
  showErrors,
  touched,
}: {
  batchRow: BatchDraft;
  group: SheetGroup;
  groupIndex: number;
  handlers: SheetHandlers;
  indexInGroup: number;
  issues: SheetIssue[];
  lastInGroup: boolean;
  showErrors?: boolean;
  touched: ReadonlySet<string>;
  suppliers?: string[];
}) {
  const { product } = group;
  const label = `${product.name.trim() || `group ${groupIndex + 1}`} lot ${indexInGroup + 1}`;
  const shouldShow = (column: string) =>
    Boolean(showErrors) || touched.has(`${group.id}:${batchRow.id}:${column}`);

  const patch = useCallback(
    (next: Partial<BatchDraft>) =>
      handlers.onBatchChange(group.id, batchRow.id, next),
    [batchRow.id, group.id, handlers]
  );
  const handleBatch = useCallback(
    (value: string) => patch({ batch: value }),
    [patch]
  );
  const handleExpiry = useCallback(
    (value: string) => patch({ expiry: value }),
    [patch]
  );
  const handleQty = useCallback(
    (value: number | "") => patch({ qty: value }),
    [patch]
  );
  const handleNotes = useCallback(
    (value: string) => patch({ notes: value }),
    [patch]
  );
  const handleDuplicate = useCallback(
    () => handlers.onDuplicateBatch(group.id, batchRow.id),
    [batchRow.id, group.id, handlers]
  );
  const handleRemove = useCallback(
    () => handlers.onRemoveBatch(group.id, batchRow.id),
    [batchRow.id, group.id, handlers]
  );
  const handleMoveUp = useCallback(
    () => handlers.onMoveBatch(group.id, batchRow.id, -1),
    [batchRow.id, group.id, handlers]
  );
  const handleMoveDown = useCallback(
    () => handlers.onMoveBatch(group.id, batchRow.id, 1),
    [batchRow.id, group.id, handlers]
  );

  const tone = "bg-muted/30";

  return (
    <div
      className={cn(
        "grid items-center gap-1.5 border-b",
        lastInGroup ? "border-border/60" : "border-border/30"
      )}
      style={{ gridTemplateColumns: BATCH_TEMPLATE }}
    >
      <div
        className={cn(cellClass(0, tone), "border-primary/30 border-l-2")}
        style={frozenStyle(0)}
      >
        <CellStatic>
          {displayNameOf(product) || product.name || "Untitled"}
        </CellStatic>
      </div>
      <div className={cellClass(1, tone)} style={frozenStyle(1)}>
        <CellText
          invalid={
            shouldShow("batch") &&
            Boolean(rowIssue(issues, batchRow.id, "batch"))
          }
          label={`Lot number for ${label}`}
          onChange={handleBatch}
          placeholder="B-2027-01"
          value={batchRow.batch}
        />
      </div>
      <div className={cellClass(2, tone)} style={frozenStyle(2)}>
        <CellDate
          invalid={
            shouldShow("expiry") &&
            Boolean(rowIssue(issues, batchRow.id, "expiry"))
          }
          label={`Expiry for ${label}`}
          min={todayIso()}
          onChange={handleExpiry}
          value={batchRow.expiry}
        />
      </div>
      <div className={cellClass(3, tone)} style={frozenStyle(3)}>
        <CellQty
          invalid={
            shouldShow("qty") && Boolean(rowIssue(issues, batchRow.id, "qty"))
          }
          label={`Quantity for ${label}`}
          onChange={handleQty}
          value={batchRow.qty}
        />
      </div>

      <div className="min-w-0">
        <CellStatic>{inherited(product.sku)}</CellStatic>
      </div>
      <div className="min-w-0">
        <CellStatic>{inherited(product.category)}</CellStatic>
      </div>
      <div className="min-w-0">
        <CellStatic>{inherited(product.strengthValue)}</CellStatic>
      </div>
      <div className="min-w-0">
        <CellStatic>{inherited(product.strengthUnit)}</CellStatic>
      </div>
      <div className="min-w-0">
        <CellStatic>{inherited(product.form)}</CellStatic>
      </div>
      <div className="min-w-0">
        <CellStatic>{inherited(product.packSize)}</CellStatic>
      </div>
      <div className="min-w-0">
        <CellStatic>—</CellStatic>
      </div>
      <div className="min-w-0">
        <CellStatic>{formatCount(thresholdOf(product))}</CellStatic>
      </div>
      <div className="min-w-0">
        <CellText
          label={`Batch notes for ${label}`}
          onChange={handleNotes}
          placeholder="Delivery note"
          value={batchRow.notes}
        />
      </div>

      <div className="flex items-center justify-end gap-1 pr-2">
        <Button
          aria-label={`Move ${label} up`}
          disabled={indexInGroup === 0}
          onClick={handleMoveUp}
          size="icon-sm"
          variant="ghost"
        >
          ↑
        </Button>
        <Button
          aria-label={`Move ${label} down`}
          disabled={lastInGroup}
          onClick={handleMoveDown}
          size="icon-sm"
          variant="ghost"
        >
          ↓
        </Button>
        <Button
          aria-label={`Duplicate ${label}`}
          onClick={handleDuplicate}
          size="icon-sm"
          variant="ghost"
        >
          <Copy aria-hidden className="size-3.5" />
        </Button>
        <Button
          aria-label={`Remove ${label}`}
          onClick={handleRemove}
          size="icon-sm"
          variant="ghost"
        >
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

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
