import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { cn } from "@cmis/ui/lib/utils";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useCallback } from "react";

import { groupTotals } from "../../../creation/sheet";
import type {
  SheetDefaultField,
  SheetGroup,
  SheetIssue,
} from "../../../creation/sheet-types";
import {
  CellCategory,
  CellQty,
  CellSelect,
  CellStatic,
  CellText,
  FORM_OPTIONS,
  STRENGTH_UNIT_OPTIONS,
} from "../sheet-cells";
import { formatCount, plural } from "../summary-text";
import { FIRST_FROZEN_WIDTH, GROUP_TEMPLATE } from "./constants";
import { cellClass, frozenStyle } from "./grid";
import { groupIssues, IssueChip } from "./issues";
import type { SheetHandlers } from "./types";

export function GroupRow({
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
