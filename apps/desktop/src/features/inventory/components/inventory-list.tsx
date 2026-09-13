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
import * as React from "react";
import { daysUntilExpiry } from "../mock";
import type { InventoryItem, SortKey } from "../types";

function StatusDot({ status }: { status: InventoryItem["status"] }) {
  const color =
    status === "in"
      ? "bg-[var(--success)]"
      : status === "low"
        ? "bg-[var(--warning)]"
        : status === "out"
          ? "bg-destructive"
          : "bg-[var(--warning)]";
  const label =
    status === "in"
      ? "In"
      : status === "low"
        ? "Low"
        : status === "out"
          ? "Out"
          : "Expiring";
  return (
    <span aria-label={label} className="inline-flex items-center gap-1.5">
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
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowHeight = density === "compact" ? 44 : 56;

  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => rowHeight,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });

  const sortedIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return (
        <ArrowUpDown aria-hidden className="size-3 text-muted-foreground" />
      );
    }
    return sortDir === "asc" ? (
      <ArrowUp aria-hidden className="size-3 text-foreground" />
    ) : (
      <ArrowDown aria-hidden className="size-3 text-foreground" />
    );
  };

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
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              className="w-full rounded-md"
              key={i}
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
          <button
            aria-sort={
              sortKey === col.key
                ? sortDir === "asc"
                  ? "ascending"
                  : "descending"
                : "none"
            }
            className="flex items-center gap-1 text-left hover:text-foreground"
            key={col.key}
            onClick={() => onSort(col.key)}
            type="button"
          >
            {col.label}
            {sortedIcon(col.key)}
          </button>
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
            const selected = item.id === selectedId;
            const daysLeft = daysUntilExpiry(item.expiry);
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
                <button
                  aria-selected={selected}
                  className={cn(
                    "grid w-full grid-cols-[1.7fr_0.9fr_0.9fr_0.6fr_0.8fr] items-center gap-2 border-border/50 border-b px-2 text-left text-sm transition-colors hover:bg-muted/60",
                    selected &&
                      "bg-accent text-accent-foreground ring-1 ring-primary/20 ring-inset",
                    item.qty === 0 && "text-muted-foreground"
                  )}
                  onClick={(e) => {
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    onRowRect?.(rect);
                    onSelect(item.id, rect);
                  }}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
