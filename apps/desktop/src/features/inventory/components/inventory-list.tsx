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
import { ArrowDown, ArrowUp, ArrowUpDown, Package } from "lucide-react";
import { type MouseEvent, type ReactElement, useCallback, useRef } from "react";
import { daysUntilExpiry } from "../mock";
import type { InventoryItem, SortKey } from "../types";

const STATUS_DOT_CONFIG: Record<
  InventoryItem["status"],
  { color: string; label: string }
> = {
  expiring: { color: "bg-[var(--warning)]", label: "Expiring" },
  in: { color: "bg-[var(--success)]", label: "In" },
  low: { color: "bg-[var(--warning)]", label: "Low" },
  out: { color: "bg-destructive", label: "Out" },
};

const SKELETON_ROW_KEYS = Array.from(
  { length: 8 },
  (_, index) => `inventory-skeleton-${index}`
);

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

function InventoryRow({
  item,
  rowHeight,
  selected,
  onRowRect,
  onSelect,
}: {
  item: InventoryItem;
  rowHeight: number;
  selected: boolean;
  onRowRect?: (rect: DOMRect | null) => void;
  onSelect: (id: string, rect: DOMRect | null) => void;
}) {
  const daysLeft = daysUntilExpiry(item.expiry);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onRowRect?.(rect);
      onSelect(item.id, rect);
    },
    [item.id, onRowRect, onSelect]
  );

  return (
    <button
      aria-selected={selected}
      className={cn(
        "grid w-full grid-cols-[1.7fr_0.9fr_0.9fr_0.6fr_0.8fr] items-center gap-2 border-border/50 border-b px-2 text-left text-sm transition-colors hover:bg-muted/60",
        selected &&
          "bg-accent text-accent-foreground ring-1 ring-primary/20 ring-inset",
        item.qty === 0 && "text-muted-foreground"
      )}
      onClick={handleClick}
      role="row"
      style={{ height: rowHeight }}
      type="button"
    >
      <span className="truncate font-medium" role="cell">
        {item.name}
        {daysLeft <= 7 && daysLeft >= 0 ? (
          <span className="ml-1 text-[10px] text-[var(--warning)]">
            • expiring
          </span>
        ) : null}
      </span>
      <span className="truncate text-caption" role="cell">
        {item.sku}
      </span>
      <span className="truncate text-caption" role="cell">
        {item.category}
      </span>
      <span
        className={cn(
          "text-caption",
          item.qty === 0 && "font-semibold text-destructive"
        )}
        role="cell"
      >
        {item.qty}
      </span>
      <span role="cell">
        <StatusDot status={item.status} />
      </span>
    </button>
  );
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

function StatusDot({ status }: { status: InventoryItem["status"] }) {
  const { color, label } = STATUS_DOT_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 rounded-full", color)} />
      <span className="text-xs">{label}</span>
    </span>
  );
}

export function InventoryList({
  items,
  selectedId,
  onSelect,
  sortKey,
  sortDir,
  onSort,
  loading = false,
  onRowRect,
  density,
  totalUnfiltered = 0,
  onClearFilters,
}: {
  items: InventoryItem[];
  selectedId: string | null;
  onSelect: (id: string, rect: DOMRect | null) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  loading?: boolean;
  onRowRect?: (rect: DOMRect | null) => void;
  density: "compact" | "comfortable";
  totalUnfiltered?: number;
  onClearFilters?: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowHeight = density === "compact" ? 44 : 56;

  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => rowHeight,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Skeleton header matching filter shimmer */}
        <div
          className="grid shrink-0 grid-cols-[1.7fr_0.9fr_0.9fr_0.6fr_0.8fr] items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1"
          role="row"
        >
          {["Name", "SKU", "Category", "Qty", "Status"].map((label) => (
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

  if (items.length === 0) {
    const hasFilters = totalUnfiltered > 0;
    return (
      <Empty className="border border-dashed bg-muted/20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No medicine matches" : "No inventory yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try different filters or clear them to see all items."
              : "Add your first item to get started."}
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
      {/* Header */}
      <div
        className="sticky top-0 z-[1] grid shrink-0 grid-cols-[1.7fr_0.9fr_0.9fr_0.6fr_0.8fr] items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1 font-medium text-caption"
        role="row"
      >
        {(
          [
            { key: "name" as SortKey, label: "Name" },
            { key: "sku" as SortKey, label: "SKU" },
            { key: "category" as SortKey, label: "Category" },
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
      </div>

      {/* Virtual rows */}
      <div
        aria-label="Inventory list"
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
            const item = items[virtualRow.index];
            return (
              <div
                data-index={virtualRow.index}
                key={item.id}
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
                <InventoryRow
                  item={item}
                  onRowRect={onRowRect}
                  onSelect={onSelect}
                  rowHeight={rowHeight}
                  selected={item.id === selectedId}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
