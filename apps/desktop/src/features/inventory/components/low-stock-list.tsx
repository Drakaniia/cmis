import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@cmis/ui/components/empty";
import { Skeleton } from "@cmis/ui/components/skeleton";
import { cn } from "@cmis/ui/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  MoreHorizontal,
  Package,
  ShoppingCart,
} from "lucide-react";
import { motion } from "motion/react";
import { type MouseEvent, type ReactElement, useCallback, useRef } from "react";

import { densitySpring } from "@/lib/motion";
import { getLeadTime, LOW_STOCK_STATUS_CONFIG } from "../mock-low-stock";
import type { LowStockRow, LowStockSortKey } from "../types";

const SKELETON_ROW_KEYS = Array.from(
  { length: 8 },
  (_, index) => `low-stock-skeleton-${index}`
);

function gridColsFor(
  showSku: boolean | undefined,
  showSupplier: boolean | undefined
): string {
  if (showSku && showSupplier) {
    return "grid-cols-[32px_1.4fr_0.6fr_1.2fr_0.6fr_0.5fr_0.6fr_0.9fr_80px]";
  }
  if (showSku) {
    return "grid-cols-[32px_1.4fr_0.6fr_1.2fr_0.6fr_0.5fr_0.9fr_80px]";
  }
  if (showSupplier) {
    return "grid-cols-[32px_1.4fr_1.2fr_0.6fr_0.5fr_0.6fr_0.9fr_80px]";
  }
  return "grid-cols-[32px_1.4fr_1.2fr_0.6fr_0.5fr_0.9fr_80px]";
}

function ariaSortFor(
  sortKey: LowStockSortKey,
  columnKey: LowStockSortKey,
  sortDir: "asc" | "desc"
): "ascending" | "descending" | "none" {
  if (sortKey !== columnKey) {
    return "none";
  }
  return sortDir === "asc" ? "ascending" : "descending";
}

function sortIcon(
  activeKey: LowStockSortKey,
  dir: "asc" | "desc",
  key: LowStockSortKey
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
  activeKey: LowStockSortKey;
  columnKey: LowStockSortKey;
  dir: "asc" | "desc";
  label: string;
  onSort: (key: LowStockSortKey) => void;
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

// ─── CMIS-UI-04 §2.1 — Status Badge ───────────────────────────────────────

function StatusBadge({ row }: { row: LowStockRow }) {
  const config = LOW_STOCK_STATUS_CONFIG[row.lowStockStatus];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-[10px]",
        config.badgeClass
      )}
    >
      {row.lowStockStatus === "out-of-stock" ? (
        <AlertCircle aria-hidden className="size-3" />
      ) : null}
      {row.lowStockStatus === "low-stock" ? (
        <AlertTriangle aria-hidden className="size-3" />
      ) : null}
      {config.label}
    </span>
  );
}

// ─── CMIS-UI-04 §2 — Inline Quantity Bar ───────────────────────────────────

function QuantityBar({
  row,
  animate = true,
}: {
  animate?: boolean;
  row: LowStockRow;
}) {
  const config = LOW_STOCK_STATUS_CONFIG[row.lowStockStatus];
  const fillPercent = row.gapPercent;

  return (
    <div className="flex items-center gap-2">
      <div
        aria-label={`${row.currentQty} of ${row.threshold} threshold`}
        aria-valuemax={row.threshold}
        aria-valuemin={0}
        aria-valuenow={row.currentQty}
        className="relative h-3 w-20 flex-1 overflow-hidden rounded-full bg-muted"
        role="meter"
      >
        {/* Fill bar — CMIS-UI-04 §5: scaleX animation on qty change */}
        <motion.div
          animate={{ scaleX: fillPercent / 100 }}
          className="absolute inset-y-0 left-0 origin-left rounded-full"
          initial={false}
          style={{ backgroundColor: config.barColor, width: "100%" }}
          transition={
            animate
              ? { ...densitySpring, type: "spring" as const }
              : { duration: 0 }
          }
        />
      </div>
      <span className="whitespace-nowrap text-caption text-muted-foreground tabular-nums">
        {row.currentQty} / {row.threshold}
      </span>
    </div>
  );
}

// ─── CMIS-UI-04 §2 — Gap Display ───────────────────────────────────────────

function GapDisplay({ row }: { row: LowStockRow }) {
  if (row.lowStockStatus === "out-of-stock") {
    return <span className="font-medium text-destructive text-xs">Out</span>;
  }
  if (row.gap <= 0) {
    return (
      <span className="font-medium text-muted-foreground text-xs">
        +{Math.abs(row.gap)}
      </span>
    );
  }
  return (
    <span className="font-medium text-[var(--warning)] text-xs tabular-nums">
      -{row.gap}
    </span>
  );
}

// ─── CMIS-UI-04 §3.2 — Supplier with Lead Time ────────────────────────────

function SupplierCell({ row }: { row: LowStockRow }) {
  const leadTime = getLeadTime(row.item.supplier);
  return (
    <span className="text-caption" role="cell">
      <span className="block truncate">{row.item.supplier}</span>
      {leadTime === null ? null : (
        <span className="text-muted-foreground">~{leadTime} days</span>
      )}
    </span>
  );
}

interface LowStockRowItemProps {
  gridCols: string;
  isHighlighted: boolean;
  isSelected: boolean;
  onAdjustThreshold: (row: LowStockRow, originRect: DOMRect | null) => void;
  onReorder: (row: LowStockRow, originRect: DOMRect | null) => void;
  onSelect: (id: string, rect: DOMRect | null) => void;
  onToggleItem: (id: string) => void;
  onView: (row: LowStockRow, originRect: DOMRect | null) => void;
  row: LowStockRow;
  showSku: boolean | undefined;
  showSupplier: boolean | undefined;
}

function LowStockRowItem({
  gridCols,
  isHighlighted,
  isSelected,
  row,
  showSku,
  showSupplier,
  onAdjustThreshold,
  onReorder,
  onSelect,
  onToggleItem,
  onView,
}: LowStockRowItemProps) {
  const config = LOW_STOCK_STATUS_CONFIG[row.lowStockStatus];

  const handleToggle = useCallback(
    () => onToggleItem(row.item.id),
    [onToggleItem, row.item.id]
  );

  const handleSelectItem = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      onSelect(row.item.id, event.currentTarget.getBoundingClientRect());
    },
    [onSelect, row.item.id]
  );

  const handleReorder = useCallback(
    (event: MouseEvent<HTMLElement>) =>
      onReorder(row, event.currentTarget.getBoundingClientRect()),
    [onReorder, row]
  );

  const handleAdjustThreshold = useCallback(
    (event: MouseEvent<HTMLElement>) =>
      onAdjustThreshold(row, event.currentTarget.getBoundingClientRect()),
    [onAdjustThreshold, row]
  );

  const handleView = useCallback(
    (event: MouseEvent<HTMLElement>) =>
      onView(row, event.currentTarget.getBoundingClientRect()),
    [onView, row]
  );

  return (
    <div
      className={cn(
        "group grid h-full items-center gap-2 border-border/50 border-b px-2 transition-colors",
        gridCols,
        isHighlighted && "bg-accent/50",
        row.lowStockStatus === "out-of-stock" && "bg-destructive/5"
      )}
      role="row"
      style={{ paddingRight: 16 }}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center">
        <Checkbox
          aria-label={`Select ${row.item.name}`}
          checked={isSelected}
          onCheckedChange={handleToggle}
        />
      </div>

      {/* Item name + 4px status edge bar — CMIS-UI-04 §2 */}
      <button
        className="flex min-w-0 items-center gap-2 text-left"
        onClick={handleSelectItem}
        type="button"
      >
        <span
          aria-hidden
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: config.edgeColor }}
        />
        <span className="min-w-0 truncate font-medium text-sm">
          {row.item.name}
        </span>
      </button>

      {/* SKU — hidden at narrower widths per §6 */}
      {showSku ? (
        <span className="truncate text-caption" role="cell">
          {row.item.sku}
        </span>
      ) : null}

      {/* Current Qty with inline bar — CMIS-UI-04 §2 */}
      <span role="cell">
        <QuantityBar row={row} />
      </span>

      {/* Threshold */}
      <span className="text-caption tabular-nums" role="cell">
        {row.threshold}
      </span>

      {/* Gap — CMIS-UI-04 §2 primary signal */}
      <span role="cell">
        <GapDisplay row={row} />
      </span>

      {/* Status badge — CMIS-UI-04 §2.1 */}
      <span role="cell">
        <StatusBadge row={row} />
      </span>

      {/* Supplier — CMIS-UI-04 §3.2 with lead time hint */}
      {showSupplier ? <SupplierCell row={row} /> : null}

      {/* Actions — always visible */}
      <div className="flex items-center justify-end gap-1">
        {/* Reorder — CMIS-UI-04 §3.1 primary action */}
        <Button
          aria-label={`Reorder ${row.item.name}`}
          className="press-feedback"
          onClick={handleReorder}
          size="icon-xs"
        >
          <ShoppingCart className="size-3.5" />
        </Button>
        {/* Adjust threshold — CMIS-UI-04 §3.1 */}
        <Button
          aria-label={`Adjust threshold for ${row.item.name}`}
          className="press-feedback"
          onClick={handleAdjustThreshold}
          size="icon-xs"
          variant="secondary"
        >
          <Package className="size-3.5" />
        </Button>
        {/* More menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="press-feedback inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleView}>
              View details
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── CMIS-UI-04 §3.1 — Low-Stock Table List ───────────────────────────────

export function LowStockList({
  rows,
  selectedId,
  onSelect,
  sortKey,
  sortDir,
  onSort,
  loading = false,
  density,
  totalUnfiltered = 0,
  onClearFilters,
  selectedIds,
  onToggleItem,
  onToggleAll,
  onReorder,
  onAdjustThreshold,
  onView,
  showSku = true,
  showSupplier = true,
}: {
  density: "compact" | "comfortable";
  loading?: boolean;
  onAdjustThreshold: (row: LowStockRow, originRect: DOMRect | null) => void;
  onClearFilters?: () => void;
  onReorder: (row: LowStockRow, originRect: DOMRect | null) => void;
  onRowRect?: (rect: DOMRect | null) => void;
  onSelect: (id: string, rect: DOMRect | null) => void;
  onSort: (k: LowStockSortKey) => void;
  onToggleAll: () => void;
  onToggleItem: (id: string) => void;
  onView: (row: LowStockRow, originRect: DOMRect | null) => void;
  rows: LowStockRow[];
  selectedId: string | null;
  selectedIds: Set<string>;
  showSku?: boolean;
  showSupplier?: boolean;
  sortDir: "asc" | "desc";
  sortKey: LowStockSortKey;
  totalUnfiltered?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowHeight = density === "compact" ? 44 : 56;

  // CMIS-UI-04 §6 — grid columns adapt at breakpoints
  const gridCols = gridColsFor(showSku, showSupplier);

  const allSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.item.id));

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => rowHeight,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className={cn(
            "grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1",
            gridCols
          )}
          role="row"
          style={{ paddingRight: 16 }}
        >
          {[
            "Item",
            "SKU",
            "Current",
            "Threshold",
            "Gap",
            "Status",
            "Supplier",
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
    return (
      <Empty className="border border-dashed bg-muted/20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2 />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters
              ? "No items match filters"
              : "All items are well-stocked."}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try different filters or clear them to see all items."
              : "No low-stock or out-of-stock items detected."}
          </EmptyDescription>
          {hasFilters && onClearFilters ? (
            <button
              className="mt-2 text-caption text-primary hover:underline"
              onClick={onClearFilters}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — CMIS-UI-04 §2 table columns */}
      <div
        className={cn(
          "sticky top-0 z-[1] grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1 font-medium text-caption",
          gridCols
        )}
        role="row"
        style={{ paddingRight: 16 }}
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
            { key: "name" as LowStockSortKey, label: "Item" },
            ...(showSku
              ? ([{ key: "sku" as LowStockSortKey, label: "SKU" }] as const)
              : []),
            { key: "qty" as LowStockSortKey, label: "Current" },
            { key: "threshold" as LowStockSortKey, label: "Threshold" },
            { key: "gap" as LowStockSortKey, label: "Gap" },
            { key: "status" as LowStockSortKey, label: "Status" },
            ...(showSupplier
              ? ([
                  { key: "supplier" as LowStockSortKey, label: "Supplier" },
                ] as const)
              : []),
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
        aria-label="Low-stock alerts list"
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

            return (
              <div
                data-index={virtualRow.index}
                key={row.item.id}
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
                <LowStockRowItem
                  gridCols={gridCols}
                  isHighlighted={row.item.id === selectedId}
                  isSelected={selectedIds.has(row.item.id)}
                  onAdjustThreshold={onAdjustThreshold}
                  onReorder={onReorder}
                  onSelect={onSelect}
                  onToggleItem={onToggleItem}
                  onView={onView}
                  row={row}
                  showSku={showSku}
                  showSupplier={showSupplier}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
