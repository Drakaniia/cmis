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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Package,
  Trash2,
} from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useRef,
} from "react";
import { daysUntilExpiry } from "../domain/expiry";
import { composeListLabel } from "../domain/strength";
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

/** Module-level so the row's event handlers are stable across renders. */
function stopPropagation(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function gridTemplate(selectable: boolean): string {
  return selectable
    ? "grid-cols-[32px_1.7fr_0.9fr_0.9fr_0.6fr_0.8fr_36px]"
    : "grid-cols-[1.7fr_0.9fr_0.9fr_0.6fr_0.8fr]";
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
  cols,
  item,
  rowHeight,
  selected,
  selectable,
  isChecked,
  onDelete,
  onRowRect,
  onSelect,
  onToggleSelect,
}: {
  cols: string;
  isChecked: boolean;
  item: InventoryItem;
  onDelete?: (item: InventoryItem) => void;
  onRowRect?: (rect: DOMRect | null) => void;
  onSelect: (id: string, rect: DOMRect | null) => void;
  onToggleSelect?: (id: string) => void;
  rowHeight: number;
  selectable: boolean;
  selected: boolean;
}) {
  const daysLeft = daysUntilExpiry(item.expiry);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onRowRect?.(rect);
      onSelect(item.id, rect);
    },
    [item.id, onRowRect, onSelect]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      onRowRect?.(rect);
      onSelect(item.id, rect);
    },
    [item.id, onRowRect, onSelect]
  );

  const handleToggle = useCallback(
    () => onToggleSelect?.(item.id),
    [item.id, onToggleSelect]
  );
  const handleDelete = useCallback(() => onDelete?.(item), [item, onDelete]);

  return (
    <div
      aria-selected={selected}
      className={cn(
        "group grid items-center gap-2 border-border/50 border-b px-2 text-left text-sm transition-colors hover:bg-muted/60",
        cols,
        selected &&
          "bg-accent text-accent-foreground ring-1 ring-primary/20 ring-inset",
        isChecked && "bg-primary/5",
        item.qty === 0 && "text-muted-foreground"
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="row"
      style={{ height: rowHeight }}
      tabIndex={0}
    >
      {selectable ? (
        <div className="flex items-center justify-center">
          {/* The row itself is click-to-select, so the checkbox and menu must not
           * bubble, or every action would also change the selection. */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: container only stops propagation */}
          <span
            onClick={stopPropagation}
            onKeyDown={stopPropagation}
            role="presentation"
          >
            <Checkbox
              aria-label={`Select ${item.displayName}`}
              checked={isChecked}
              onCheckedChange={handleToggle}
            />
          </span>
        </div>
      ) : null}

      {/* §8.1 — the Name cell carries `name + strength_value + strength_unit`,
       * so the medication reads recognizably without a new column. */}
      <span className="truncate font-medium" role="cell">
        {composeListLabel(item)}
        {daysLeft <= 7 && daysLeft >= 0 ? (
          <span className="ml-1 text-[10px] text-[var(--warning)]">
            • expiring
          </span>
        ) : null}
        {item.detailsIncomplete ? (
          <span
            className="ml-1 text-[10px] text-muted-foreground"
            title="Strength details incomplete — open the row to finish them"
          >
            • details
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

      {selectable ? (
        <div className="flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${item.displayName}`}
              className="press-feedback inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={stopPropagation}
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDelete}>
                <Trash2 aria-hidden className="size-3.5" />
                Delete product
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
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
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onDeleteItem,
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
  /** Adds the selection checkbox column and the per-row `⋯` menu. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  onDeleteItem?: (item: InventoryItem) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowHeight = density === "compact" ? 44 : 56;
  const cols = gridTemplate(selectable);
  const checked = selectedIds ?? new Set<string>();
  const allSelected =
    items.length > 0 && items.every((item) => checked.has(item.id));

  const handleToggleAll = useCallback(() => onToggleAll?.(), [onToggleAll]);

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
          className={cn(
            "grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1",
            cols
          )}
          role="row"
        >
          {[
            ...(selectable ? ["Select"] : []),
            "Name",
            "SKU",
            "Category",
            "Qty",
            "Status",
            ...(selectable ? ["Actions"] : []),
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
        className={cn(
          "sticky top-0 z-[1] grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1 font-medium text-caption",
          cols
        )}
        role="row"
      >
        {selectable ? (
          <div className="flex items-center justify-center">
            <Checkbox
              aria-label="Select the visible page"
              checked={allSelected}
              onCheckedChange={handleToggleAll}
            />
          </div>
        ) : null}
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
        {selectable ? <span className="sr-only">Actions</span> : null}
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
                  cols={cols}
                  isChecked={checked.has(item.id)}
                  item={item}
                  onDelete={onDeleteItem}
                  onRowRect={onRowRect}
                  onSelect={onSelect}
                  onToggleSelect={onToggleSelect}
                  rowHeight={rowHeight}
                  selectable={selectable}
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
