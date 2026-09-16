import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@cmis/ui/components/empty";
import { Skeleton } from "@cmis/ui/components/skeleton";
import { cn } from "@cmis/ui/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { densitySpring } from "@/lib/motion";
import {
  EXPIRY_STATUS_CONFIG,
  expiryLabel,
  relativeExpiryText,
} from "../domain/expiry";
import { composeListLabel } from "../domain/strength";
import type { ExpiryRow, SortKey } from "../types";
import { StockDetailMenu } from "./stock-detail-menu";

/**
 * CMIS-UI-03 §2 + §3 — Expiry Table List
 * Clinical-grade hierarchy: expiry date column uses left-edge time bar (4px)
 * colored by urgency, plus badge + relative time text.
 * Default sort: expiry ascending (soonest first).
 * Row height: 44/56 per density toggle.
 *
 * Stock detail modal §6 — the whole row is the activator for the detail view.
 * Controls carry `data-row-control` and swallow the click, so a checkbox toggle
 * or a Dispose never doubles as "open details". Roving tabindex keeps the list a
 * single tab stop with arrow-key movement inside it.
 */

const SKELETON_ROW_KEYS = Array.from(
  { length: 8 },
  (_, index) => `expiry-skeleton-${index}`
);

/** Anything inside a control subtree must not also open the detail modal. */
const ROW_CONTROL_SELECTOR = "[data-row-control]";

function rowKeyOf(row: ExpiryRow): string {
  return `${row.item.id}-${row.batch.batch}`;
}

function rowBackgroundColor(status: ExpiryRow["expiryStatus"]): string {
  if (status === "expired") {
    return "oklch(0.58 0.22 27 / 0.05)";
  }
  // A fully transparent *colour*, not the `transparent` keyword: motion cannot
  // interpolate to the keyword and warns on every row it animates.
  return "oklch(0 0 0 / 0)";
}

/** §6.4 — announce item, batch, expiry, status and qty, not just the name. */
function rowAriaLabel(row: ExpiryRow): string {
  const config = EXPIRY_STATUS_CONFIG[row.expiryStatus];
  const expiry = row.batch.expiry
    ? `expiring ${expiryLabel(row.batch.expiry)}`
    : "no expiry on record";
  return `${row.item.displayName}, batch ${row.batch.batch}, ${expiry}, ${config.label}, ${row.batch.qty} units`;
}

function ariaSortFor(
  sortKey: SortKey,
  columnKey: SortKey,
  sortDir: "asc" | "desc"
): "ascending" | "descending" | "none" {
  if (sortKey !== columnKey) {
    return "none";
  }
  return sortDir === "asc" ? "ascending" : "descending";
}

function sortIcon(
  activeKey: SortKey,
  dir: "asc" | "desc",
  key: SortKey
): ReactElement {
  if (activeKey !== key) {
    return <ArrowUpDown aria-hidden className="size-3 text-muted-foreground" />;
  }
  return dir === "asc" ? (
    <ArrowUp aria-hidden className="size-3 text-foreground" />
  ) : (
    <ArrowDown aria-hidden className="size-3 text-foreground" />
  );
}

function SortHeaderButton({
  activeKey,
  columnKey,
  dir,
  label,
  onSort,
}: {
  activeKey: SortKey;
  columnKey: SortKey;
  dir: "asc" | "desc";
  label: string;
  onSort: (key: SortKey) => void;
}) {
  const handleSort = useCallback(() => onSort(columnKey), [columnKey, onSort]);
  return (
    <button
      aria-sort={ariaSortFor(activeKey, columnKey, dir)}
      className="flex items-center gap-1 text-left hover:text-foreground"
      onClick={handleSort}
      type="button"
    >
      {label}
      {sortIcon(activeKey, dir, columnKey)}
    </button>
  );
}

function SelectAllCheckbox({
  allSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  onToggleAll: () => void;
}) {
  const handleChange = useCallback(() => onToggleAll(), [onToggleAll]);
  return (
    <Checkbox
      aria-label="Select all"
      checked={allSelected}
      onCheckedChange={handleChange}
    />
  );
}

function ExpiryRowItem({
  ariaLabel,
  gridCols,
  isSelected,
  onActivate,
  onDeleteBatch,
  onDispose,
  onExtend,
  onKeyDown,
  onOpenInStockManagement,
  onToggleBatch,
  onView,
  row,
  rowRef,
  showSku,
  tabIndex,
}: {
  ariaLabel: string;
  gridCols: string;
  isSelected: boolean;
  onActivate: (row: ExpiryRow, originRect: DOMRect | null) => void;
  onDeleteBatch?: (row: ExpiryRow) => void;
  onDispose: (row: ExpiryRow, originRect: DOMRect | null) => void;
  onExtend: (row: ExpiryRow, originRect: DOMRect | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onOpenInStockManagement: (row: ExpiryRow) => void;
  onToggleBatch: (key: string) => void;
  onView: (row: ExpiryRow, originRect: DOMRect | null) => void;
  row: ExpiryRow;
  rowRef: (element: HTMLDivElement | null) => void;
  showSku: boolean;
  tabIndex: number;
}) {
  const config = EXPIRY_STATUS_CONFIG[row.expiryStatus];
  const batchKey = rowKeyOf(row);

  const handleToggle = useCallback(
    () => onToggleBatch(batchKey),
    [batchKey, onToggleBatch]
  );

  const handleActivate = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      // A click that bubbled out of a control is the control's, not the row's.
      const target = event.target as HTMLElement | null;
      if (target?.closest(ROW_CONTROL_SELECTOR)) {
        return;
      }
      onActivate(row, event.currentTarget.getBoundingClientRect());
    },
    [onActivate, row]
  );

  const handleDispose = useCallback(
    (event: MouseEvent<HTMLElement>) =>
      onDispose(row, event.currentTarget.getBoundingClientRect()),
    [onDispose, row]
  );
  const handleExtend = useCallback(
    (event: MouseEvent<HTMLElement>) =>
      onExtend(row, event.currentTarget.getBoundingClientRect()),
    [onExtend, row]
  );
  const handleDelete = useCallback(
    () => onDeleteBatch?.(row),
    [onDeleteBatch, row]
  );
  const handleView = useCallback(() => onView(row, null), [onView, row]);
  const handleOpenInStockManagement = useCallback(
    () => onOpenInStockManagement(row),
    [onOpenInStockManagement, row]
  );

  return (
    <motion.div
      animate={{ backgroundColor: rowBackgroundColor(row.expiryStatus) }}
      aria-label={ariaLabel}
      className={cn(
        "group grid h-full cursor-pointer items-center gap-2 border-border/50 border-b px-2",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        gridCols
      )}
      onClick={handleActivate}
      onKeyDown={onKeyDown}
      ref={rowRef}
      role="row"
      tabIndex={tabIndex}
      transition={{ ...densitySpring, duration: 0.2 }}
    >
      {/* Checkbox — a control, so it swallows the row click */}
      <div className="flex items-center justify-center" data-row-control>
        <Checkbox
          aria-label={`Select ${row.item.displayName} batch ${row.batch.batch}`}
          checked={isSelected}
          onCheckedChange={handleToggle}
        />
      </div>

      {/* Item name + SKU on narrow. §6.2 — no nested control: the row is the
       * control now, and a button inside a clickable row is invalid markup. */}
      <span className="flex min-w-0 items-center gap-2 text-left">
        {/* 4px status bar — CMIS-UI-03 §2.1 — animated color on filter change */}
        <motion.span
          animate={{ backgroundColor: config.barColor }}
          aria-hidden
          className="h-8 w-1 shrink-0 rounded-full"
          transition={{ duration: 0.3 }}
        />
        {/* §8.1 — same short label as Stock Management: name + strength. */}
        <span className="min-w-0 truncate font-medium text-sm">
          {composeListLabel(row.item)}
        </span>
      </span>

      {/* SKU — hidden at 900–1199 per §6 */}
      {showSku ? (
        <span className="truncate text-caption" role="cell">
          {row.item.sku}
        </span>
      ) : null}

      {/* Batch */}
      <span className="truncate text-caption" role="cell">
        {row.batch.batch}
      </span>

      {/* Expiry + relative — CMIS-UI-03 §2 */}
      <span className="text-caption" role="cell">
        <span className="block">{expiryLabel(row.batch.expiry)}</span>
        <span className="text-muted-foreground">
          {relativeExpiryText(row.daysUntil)}
        </span>
      </span>

      {/* Qty */}
      <span className="text-caption" role="cell">
        {row.batch.qty}
      </span>

      {/* Status badge — CMIS-UI-03 §2.1 */}
      <span role="cell">
        <StatusBadge row={row} />
      </span>

      {/* Actions — always visible, and always swallowing the row click */}
      <div className="flex items-center justify-end gap-1" data-row-control>
        <Button
          aria-label="Dispose"
          className="press-feedback"
          onClick={handleDispose}
          size="icon-xs"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
        </Button>
        {row.expiryStatus === "expired" ||
        row.expiryStatus === "expiring-soon" ? (
          <Button
            aria-label="Extend expiry"
            className="press-feedback"
            onClick={handleExtend}
            size="icon-xs"
            variant="secondary"
          >
            <Clock className="size-3.5" />
          </Button>
        ) : null}
        <StockDetailMenu
          batchCode={row.batch.batch}
          itemName={row.item.displayName}
          onDeleteBatch={onDeleteBatch ? handleDelete : undefined}
          onOpenInStockManagement={handleOpenInStockManagement}
          onView={handleView}
          sku={row.item.sku}
        />
      </div>
    </motion.div>
  );
}

function StatusBadge({ row }: { row: ExpiryRow }) {
  const config = EXPIRY_STATUS_CONFIG[row.expiryStatus];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-[10px]",
        config.badgeClass
      )}
    >
      {row.expiryStatus === "expired" ? (
        <AlertTriangle aria-hidden className="size-3" />
      ) : null}
      {row.expiryStatus === "expiring-soon" ? (
        <Clock aria-hidden className="size-3" />
      ) : null}
      {config.label}
      {row.expiryStatus === "expired" ? (
        <span className="opacity-70">{relativeExpiryText(row.daysUntil)}</span>
      ) : null}
      {row.expiryStatus !== "expired" && row.expiryStatus !== "safe" ? (
        <span className="opacity-70">
          ({relativeExpiryText(row.daysUntil)})
        </span>
      ) : null}
    </span>
  );
}

export function ExpiryList({
  rows,
  sortKey,
  sortDir,
  onSort,
  loading = false,
  density,
  totalUnfiltered = 0,
  onClearFilters,
  selectedBatchKeys,
  onToggleBatch,
  onToggleAll,
  onDelete,
  onDispose,
  onExtend,
  onOpenInStockManagement,
  onView,
  showSku = true,
}: {
  rows: ExpiryRow[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  loading?: boolean;
  density: "compact" | "comfortable";
  totalUnfiltered?: number;
  onClearFilters?: () => void;
  selectedBatchKeys: Set<string>;
  onToggleBatch: (key: string) => void;
  onToggleAll: () => void;
  /** Spec §7.7 — moves one batch to Trash and corrects the product qty. */
  onDelete?: (row: ExpiryRow) => void;
  onDispose: (row: ExpiryRow, originRect: DOMRect | null) => void;
  onExtend: (row: ExpiryRow, originRect: DOMRect | null) => void;
  /** Decision 14 — jump to Stock Management with this item preselected. */
  onOpenInStockManagement: (row: ExpiryRow) => void;
  /** Decision 1 — the whole row opens the detail modal. */
  onView: (row: ExpiryRow, originRect: DOMRect | null) => void;
  /** CMIS-UI-03 §6 — false at 900–1199 to hide SKU column */
  showSku?: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [focusIndex, setFocusIndex] = useState(0);
  const rowHeight = density === "compact" ? 44 : 56;
  // CMIS-UI-03 §6 — grid columns adapt when SKU hidden
  const gridCols = showSku
    ? "grid-cols-[32px_1.6fr_0.8fr_1fr_0.6fr_1fr_1fr_80px]"
    : "grid-cols-[32px_1.6fr_1fr_0.6fr_1fr_1fr_80px]";
  const allSelected =
    rows.length > 0 && rows.every((r) => selectedBatchKeys.has(rowKeyOf(r)));

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => rowHeight,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });

  // Clamped rather than reset in an effect: re-filtering or re-sorting while a
  // row is focused must never leave the roving index pointing at nothing.
  const activeIndex =
    rows.length === 0 ? -1 : Math.min(focusIndex, rows.length - 1);

  const focusRow = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, rows.length - 1));
      setFocusIndex(clamped);
      const target = rows[clamped];
      if (target) {
        rowRefs.current.get(rowKeyOf(target))?.focus();
      }
    },
    [rows]
  );

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, index: number) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusRow(index + 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusRow(index - 1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        focusRow(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        focusRow(rows.length - 1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const row = rows[index];
        if (row) {
          onView(row, event.currentTarget.getBoundingClientRect());
        }
      }
    },
    [focusRow, onView, rows]
  );

  const registerRow = useCallback(
    (key: string, element: HTMLDivElement | null) => {
      if (element) {
        rowRefs.current.set(key, element);
        return;
      }
      rowRefs.current.delete(key);
    },
    []
  );

  const labels = useMemo(() => rows.map(rowAriaLabel), [rows]);

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className={cn(
            "grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1",
            gridCols
          )}
          role="row"
        >
          {[
            "Item",
            ...(showSku ? ["SKU"] : []),
            "Batch",
            "Expiry",
            "Qty",
            "Status",
            "Actions",
          ].map((label) => (
            <Skeleton
              className="h-3.5 w-full max-w-[80px] rounded"
              key={label}
            />
          ))}
        </div>
        <div className="flex-1 space-y-1 p-2">
          {SKELETON_ROW_KEYS.map((key) => (
            <Skeleton
              className="w-full rounded-md"
              key={key}
              style={{ height: rowHeight }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    const hasFilters = totalUnfiltered > 0;
    if (!hasFilters) {
      return (
        <div className="flex h-full min-h-[420px] w-full items-center justify-center p-6">
          <Empty className="w-full max-w-md border-0 bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle2 />
              </EmptyMedia>
              <EmptyTitle>No items expiring soon</EmptyTitle>
              <EmptyDescription>
                All clear! No items are expiring soon.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-[420px] w-full items-center justify-center p-6">
        <Empty className="w-full max-w-md border border-dashed bg-muted/20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 />
            </EmptyMedia>
            <EmptyTitle>No items match filters</EmptyTitle>
            <EmptyDescription>
              Try different filters or clear them to see all items.
            </EmptyDescription>
          </EmptyHeader>
          {onClearFilters ? (
            <EmptyContent>
              <Button
                className="press-feedback"
                onClick={onClearFilters}
                size="sm"
                variant="outline"
              >
                Clear filters
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — CMIS-UI-03 §2 table columns */}
      <div
        className={cn(
          "sticky top-0 z-[1] grid shrink-0 items-center gap-2 border-border/50 border-b bg-card/95 px-2 py-1 font-medium text-caption backdrop-blur-[6px]",
          gridCols
        )}
        role="row"
      >
        {/* Bulk select checkbox */}
        <div className="flex items-center justify-center">
          <SelectAllCheckbox
            allSelected={allSelected}
            onToggleAll={onToggleAll}
          />
        </div>
        {(
          [
            { key: "name" as SortKey, label: "Item" },
            ...(showSku
              ? ([{ key: "sku" as SortKey, label: "SKU" }] as const)
              : []),
            { key: "batch" as SortKey, label: "Batch" },
            { key: "expiry" as SortKey, label: "Expiry" },
            { key: "qty" as SortKey, label: "Qty" },
            { key: "status" as SortKey, label: "Status" },
          ] as const
        ).map((col) => (
          <SortHeaderButton
            activeKey={sortKey}
            columnKey={col.key}
            dir={sortDir}
            key={col.key}
            label={col.label}
            onSort={onSort}
          />
        ))}
        <span className="text-right">Actions</span>
      </div>
      {/* Virtual rows */}
      <div
        aria-label="Expiry alerts list"
        className="flex-1 overflow-auto"
        ref={parentRef}
        role="table"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const batchKey = rowKeyOf(row);

            return (
              <div
                data-index={virtualRow.index}
                key={batchKey}
                ref={virtualizer.measureElement}
                style={{
                  height: rowHeight,
                  left: 0,
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: "100%",
                }}
              >
                <ExpiryRowItem
                  ariaLabel={labels[virtualRow.index] ?? ""}
                  gridCols={gridCols}
                  isSelected={selectedBatchKeys.has(batchKey)}
                  onActivate={onView}
                  onDeleteBatch={onDelete}
                  onDispose={onDispose}
                  onExtend={onExtend}
                  onKeyDown={(event) =>
                    handleRowKeyDown(event, virtualRow.index)
                  }
                  onOpenInStockManagement={onOpenInStockManagement}
                  onToggleBatch={onToggleBatch}
                  onView={onView}
                  row={row}
                  rowRef={(element) => registerRow(batchKey, element)}
                  showSku={showSku}
                  tabIndex={virtualRow.index === activeIndex ? 0 : -1}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
