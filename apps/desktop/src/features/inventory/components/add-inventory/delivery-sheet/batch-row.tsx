import { Button } from "@cmis/ui/components/button";
import { todayIso } from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { Copy, Trash2 } from "lucide-react";
import { useCallback } from "react";

import {
  type BatchDraft,
  displayNameOf,
  thresholdOf,
} from "../../../creation/draft";
import type { SheetGroup, SheetIssue } from "../../../creation/sheet-types";
import { CellDate, CellQty, CellStatic, CellText } from "../sheet-cells";
import { formatCount } from "../summary-text";
import { BATCH_TEMPLATE, inherited } from "./constants";
import { cellClass, frozenStyle } from "./grid";
import { rowIssue } from "./issues";
import type { SheetHandlers } from "./types";

export function BatchRow({
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
