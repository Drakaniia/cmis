import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useDensity } from "@/hooks/use-density";
import { useLowStockFilters } from "../hooks/use-low-stock-filters";
import { useMediaQuery900 } from "../hooks/use-media-query-1200";
import { mockLowStockItems } from "../mock-low-stock";
import type { LowStockRow } from "../types";
import { AdjustThresholdPopover } from "./adjust-threshold-popover";
import { LowStockFiltersBar } from "./low-stock-filters";
import { LowStockList } from "./low-stock-list";
import { ReorderSheet } from "./reorder-sheet";

/**
 * CMIS-UI-04 — Low-Stock Alerts Page
 * Layout C (recommended): Table with inline gap visualization.
 * Composes: filters bar → table → reorder sheet + threshold popover.
 * Responsive: ≥1200 full table, 900–1199 supplier hidden, <900 card fallback.
 */
export function LowStockPage() {
  const { density } = useDensity();
  const isWideEnough = useMediaQuery900();
  const [items] = useState(mockLowStockItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    activeChips,
    allRows,
    clearFilters,
    distinctCategories,
    distinctSuppliers,
    filtered,
    filters,
    removeChip,
    setCategory,
    setSearch,
    setSort,
    setStatus,
    setSupplier,
  } = useLowStockFilters(items);

  // Reorder sheet state
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderRow, setReorderRow] = useState<LowStockRow | null>(null);
  const [reorderOrigin, setReorderOrigin] = useState<DOMRect | null>(null);

  // Threshold popover state
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [thresholdRow, setThresholdRow] = useState<LowStockRow | null>(null);
  const [thresholdOrigin, setThresholdOrigin] = useState<DOMRect | null>(null);

  const handleSelect = useCallback((id: string, _rect: DOMRect | null) => {
    setSelectedId(id);
  }, []);

  const handleToggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.item.id)));
    }
  }, [filtered, selectedIds.size]);

  const handleReorder = useCallback(
    (row: LowStockRow, originRect: DOMRect | null) => {
      setReorderRow(row);
      setReorderOrigin(originRect);
      setReorderOpen(true);
    },
    []
  );

  const handleAdjustThreshold = useCallback(
    (row: LowStockRow, originRect: DOMRect | null) => {
      setThresholdRow(row);
      setThresholdOrigin(originRect);
      setThresholdOpen(true);
    },
    []
  );

  const handleView = useCallback(
    (row: LowStockRow, _originRect: DOMRect | null) => {
      setSelectedId(row.item.id);
      toast.info(`Viewing: ${row.item.name}`);
    },
    []
  );

  const handleReorderConfirm = useCallback(
    (payload: {
      itemId: string;
      itemName: string;
      qty: number;
      supplier: string;
    }) => {
      toast.success(
        `Reorder created: ${payload.itemName} ×${payload.qty} via ${payload.supplier}`
      );
    },
    []
  );

  const handleThresholdConfirm = useCallback(
    (payload: {
      itemId: string;
      itemName: string;
      newThreshold: number;
      oldThreshold: number;
    }) => {
      toast.success(
        `Threshold for ${payload.itemName}: ${payload.oldThreshold} → ${payload.newThreshold}`
      );
    },
    []
  );

  const handleBulkReorder = useCallback(() => {
    toast.info(`Reorder ${selectedIds.size} selected items`);
  }, [selectedIds.size]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filters — sticky translucent */}
      <LowStockFiltersBar
        activeChips={activeChips}
        density={density}
        distinctCategories={distinctCategories}
        distinctSuppliers={distinctSuppliers}
        filters={filters}
        onBulkReorder={handleBulkReorder}
        onCategoryChange={setCategory}
        onClearFilters={clearFilters}
        onRemoveChip={removeChip}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        onSupplierChange={setSupplier}
        selectedCount={selectedIds.size}
      />

      {/* Table — CMIS-UI-04 §2: table with inline gap visualization */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <LowStockList
          density={density}
          onAdjustThreshold={handleAdjustThreshold}
          onClearFilters={clearFilters}
          onReorder={handleReorder}
          onSelect={handleSelect}
          onSort={setSort}
          onToggleAll={handleToggleAll}
          onToggleItem={handleToggleItem}
          onView={handleView}
          rows={filtered}
          selectedId={selectedId}
          selectedIds={selectedIds}
          showSku={isWideEnough}
          showSupplier={isWideEnough}
          sortDir={filters.sortDir}
          sortKey={filters.sortKey}
          totalUnfiltered={allRows.length}
        />
      </div>

      {/* Reorder sheet — CMIS-UI-04 §3.1 */}
      <ReorderSheet
        onConfirm={handleReorderConfirm}
        onOpenChange={setReorderOpen}
        open={reorderOpen}
        originRect={reorderOrigin}
        row={reorderRow}
      />

      {/* Threshold popover — CMIS-UI-04 §3.1 */}
      <AdjustThresholdPopover
        onConfirm={handleThresholdConfirm}
        onOpenChange={setThresholdOpen}
        open={thresholdOpen}
        originRect={thresholdOrigin}
        row={thresholdRow}
      />
    </div>
  );
}
