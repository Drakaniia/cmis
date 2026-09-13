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
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import * as React from "react";
import { densitySpring } from "@/lib/motion";
import {
  EXPIRY_STATUS_CONFIG,
  expiryLabel,
  relativeExpiryText,
} from "../mock-expiry";
import type { ExpiryRow, SortKey } from "../types";

/**
 * CMIS-UI-03 §2 + §3 — Expiry Table List
 * Clinical-grade hierarchy: expiry date column uses left-edge time bar (4px)
 * colored by urgency, plus badge + relative time text.
 * Default sort: expiry ascending (soonest first).
 * Row height: 44/56 per density toggle.
 */

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
      ) : row.expiryStatus === "expiring-soon" ? (
        <Clock aria-hidden className="size-3" />
      ) : null}
      {config.label}
      {row.expiryStatus !== "expired" && row.expiryStatus !== "safe" ? (
        <span className="opacity-70">
          ({relativeExpiryText(row.daysUntil)})
        </span>
      ) : row.expiryStatus === "expired" ? (
        <span className="opacity-70">{relativeExpiryText(row.daysUntil)}</span>
      ) : null}
    </span>
  );
}

export function ExpiryList({
  rows,
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
  selectedBatchKeys,
  onToggleBatch,
  onToggleAll,
  onDispose,
  onExtend,
  onView,
  showSku = true,
}: {
  rows: ExpiryRow[];
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
  selectedBatchKeys: Set<string>;
  onToggleBatch: (key: string) => void;
  onToggleAll: () => void;
  onDispose: (row: ExpiryRow, originRect: DOMRect | null) => void;
  onExtend: (row: ExpiryRow, originRect: DOMRect | null) => void;
  onView: (row: ExpiryRow, originRect: DOMRect | null) => void;
  /** CMIS-UI-03 §6 — false at 900–1199 to hide SKU column */
  showSku?: boolean;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = density === "compact" ? 44 : 56;
  // CMIS-UI-03 §6 — grid columns adapt when SKU hidden
  const gridCols = showSku
    ? "grid-cols-[32px_1.6fr_0.8fr_1fr_0.6fr_1fr_1fr_80px]"
    : "grid-cols-[32px_1.6fr_1fr_0.6fr_1fr_1fr_80px]";
  const allSelected =
    rows.length > 0 &&
    rows.every((r) => selectedBatchKeys.has(`${r.item.id}-${r.batch.batch}`));

  const virtualizer = useVirtualizer({
    count: rows.length,
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

  if (rows.length === 0) {
    const hasFilters = totalUnfiltered > 0;
    return (
      <Empty className="border border-dashed bg-muted/20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2 />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No items match filters" : "No items expiring soon"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try different filters or clear them to see all items."
              : "All clear! No items are expiring soon."}
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
      {/* Header — CMIS-UI-03 §2 table columns */}{" "}
      <div
        className={cn(
          "sticky top-0 z-[1] grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-2 py-1 font-medium text-caption",
          gridCols
        )}
        role="row"
      >
        {/* Bulk select checkbox */}
        <div className="flex items-center justify-center">
          <Checkbox
            aria-label="Select all"
            checked={allSelected}
            onCheckedChange={() => onToggleAll()}
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
        ).map((col, i) => (
          <button
            aria-sort={
              sortKey === col.key
                ? sortDir === "asc"
                  ? "ascending"
                  : "descending"
                : "none"
            }
            className="flex items-center gap-1 text-left hover:text-foreground"
            key={`${col.key}-${i}`}
            onClick={() => onSort(col.key)}
            type="button"
          >
            {col.label}
            {sortedIcon(col.key)}
          </button>
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
            const config = EXPIRY_STATUS_CONFIG[row.expiryStatus];
            const batchKey = `${row.item.id}-${row.batch.batch}`;
            const isSelected = selectedBatchKeys.has(batchKey);
            const isHighlighted = row.item.id === selectedId;

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
                <motion.div
                  animate={{
                    backgroundColor: isHighlighted
                      ? "oklch(0.945 0 0 / 0.5)"
                      : row.expiryStatus === "expired"
                        ? "oklch(0.58 0.22 27 / 0.05)"
                        : "transparent",
                  }}
                  className={cn(
                    "group grid h-full items-center gap-2 border-border/50 border-b px-2",
                    gridCols
                  )}
                  role="row"
                  transition={{ ...densitySpring, duration: 0.2 }}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center">
                    <Checkbox
                      aria-label={`Select ${row.item.name} batch ${row.batch.batch}`}
                      checked={isSelected}
                      onCheckedChange={() => onToggleBatch(batchKey)}
                    />
                  </div>

                  {/* Item name + SKU on narrow */}
                  <button
                    className="flex min-w-0 items-center gap-2 text-left"
                    onClick={(e) => {
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      onRowRect?.(rect);
                      onSelect(row.item.id, rect);
                    }}
                    type="button"
                  >
                    {/* 4px status bar — CMIS-UI-03 §2.1 — animated color on filter change */}
                    <motion.span
                      animate={{ backgroundColor: config.barColor }}
                      aria-hidden
                      className="h-8 w-1 shrink-0 rounded-full"
                      transition={{ duration: 0.3 }}
                    />
                    <span className="min-w-0 truncate font-medium text-sm">
                      {row.item.name}
                    </span>
                  </button>

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
                    <span className="block">
                      {expiryLabel(row.batch.expiry)}
                    </span>
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

                  {/* Actions — always visible */}
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      aria-label="Dispose"
                      className="press-feedback"
                      onClick={(e) => {
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        onDispose(row, rect);
                      }}
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
                        onClick={(e) => {
                          const rect = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          onExtend(row, rect);
                        }}
                        size="icon-xs"
                        variant="secondary"
                      >
                        <Clock className="size-3.5" />
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger className="press-feedback inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            const rect = (
                              e.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            onView(row, rect);
                          }}
                        >
                          View details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
