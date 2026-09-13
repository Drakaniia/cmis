import * as React from "react";
import { toast } from "sonner";

import { useDensity } from "@/hooks/use-density";
import { useExpiryFilters } from "../hooks/use-expiry-filters";
import { useMediaQuery900 } from "../hooks/use-media-query-1200";
import { buildMinimapBuckets, mockExpiryInventory } from "../mock-expiry";
import type { DisposeReason, ExpiryRow } from "../types";
import { DisposeConfirmModal } from "./dispose-confirm-modal";
import { ExpiryFiltersBar } from "./expiry-filters";
import { ExpiryList } from "./expiry-list";
import { ExtendExpiryModal } from "./extend-expiry-modal";

/**
 * CMIS-UI-03 — Expiry Alerts Page
 * Layout C (recommended): Table + timeline minimap.
 * Composes: filters bar → minimap → table → modals.
 * Responsive: ≥1200 full, 900–1199 SKU hidden, <900 horizontal scroll.
 */
export function ExpiryPage() {
  const { density } = useDensity();
  const isWideEnough = useMediaQuery900();
  const [items] = React.useState(mockExpiryInventory);
  const [activeMonth, setActiveMonth] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedBatchKeys, setSelectedBatchKeys] = React.useState<Set<string>>(
    new Set()
  );

  const handleClearMonth = React.useCallback(() => {
    setActiveMonth(null);
  }, []);

  const {
    activeChips,
    allRows,
    clearFilters: hookClearFilters,
    filtered,
    filters,
    removeChip,
    setDatePreset,
    setSearch,
    setSort,
    setStatus,
    urgentCount,
  } = useExpiryFilters(items, activeMonth, handleClearMonth);

  // Wrap clearFilters to also clear minimap month
  const clearFilters = React.useCallback(() => {
    hookClearFilters();
    setActiveMonth(null);
  }, [hookClearFilters]);

  // Modals
  const [disposeOpen, setDisposeOpen] = React.useState(false);
  const [disposeRow, setDisposeRow] = React.useState<ExpiryRow | null>(null);
  const [disposeOrigin, setDisposeOrigin] = React.useState<DOMRect | null>(
    null
  );

  const [extendOpen, setExtendOpen] = React.useState(false);
  const [extendRow, setExtendRow] = React.useState<ExpiryRow | null>(null);
  const [extendOrigin, setExtendOrigin] = React.useState<DOMRect | null>(null);

  const minimapBuckets = React.useMemo(
    () => buildMinimapBuckets(allRows),
    [allRows]
  );

  function handleSelect(id: string, _rect: DOMRect | null) {
    setSelectedId(id);
  }

  function handleToggleBatch(key: string) {
    setSelectedBatchKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleToggleAll() {
    if (selectedBatchKeys.size === filtered.length) {
      setSelectedBatchKeys(new Set());
    } else {
      setSelectedBatchKeys(
        new Set(filtered.map((r) => `${r.item.id}-${r.batch.batch}`))
      );
    }
  }

  function handleDispose(row: ExpiryRow, originRect: DOMRect | null) {
    setDisposeRow(row);
    setDisposeOrigin(originRect);
    setDisposeOpen(true);
  }

  function handleExtend(row: ExpiryRow, originRect: DOMRect | null) {
    setExtendRow(row);
    setExtendOrigin(originRect);
    setExtendOpen(true);
  }

  function handleView(row: ExpiryRow, _originRect: DOMRect | null) {
    // Navigate to inventory detail — for now, select the item
    setSelectedId(row.item.id);
    toast.info(`Viewing: ${row.item.name} — batch ${row.batch.batch}`);
  }

  function handleDisposeConfirm(payload: {
    itemId: string;
    batch: string;
    reason: DisposeReason;
    qty: number;
  }) {
    toast.success(`Disposed: ${payload.batch} ×${payload.qty}`);
    setSelectedBatchKeys((prev) => {
      const next = new Set(prev);
      next.delete(`${payload.itemId}-${payload.batch}`);
      return next;
    });
  }

  function handleExtendConfirm(payload: {
    itemId: string;
    batch: string;
    newExpiry: string;
    note: string;
  }) {
    toast.success(`Expiry extended: ${payload.batch} → ${payload.newExpiry}`);
  }

  const handleSelectBucket = React.useCallback(
    (monthKey: string | null) => {
      setActiveMonth(monthKey);
      // Reset date preset + status so the minimap month filter is primary
      if (monthKey) {
        setDatePreset("all");
        setStatus("all");
      }
    },
    [setDatePreset, setStatus]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filters — sticky translucent */}
      <ExpiryFiltersBar
        activeChips={activeChips}
        activeMonth={activeMonth}
        density={density}
        filters={filters}
        monthBuckets={minimapBuckets}
        onBulkDispose={() => {
          /* bulk dispose — for now just toast */
          toast.info(`Dispose ${selectedBatchKeys.size} selected items`);
        }}
        onClearFilters={clearFilters}
        onDatePresetChange={setDatePreset}
        onRemoveChip={removeChip}
        onSearchChange={setSearch}
        onSelectMonth={handleSelectBucket}
        onStatusChange={setStatus}
        selectedCount={selectedBatchKeys.size}
      />

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ExpiryList
          density={density}
          onClearFilters={clearFilters}
          onDispose={handleDispose}
          onExtend={handleExtend}
          onRowRect={undefined}
          onSelect={handleSelect}
          onSort={setSort}
          onToggleAll={handleToggleAll}
          onToggleBatch={handleToggleBatch}
          onView={handleView}
          rows={filtered}
          selectedBatchKeys={selectedBatchKeys}
          selectedId={selectedId}
          showSku={isWideEnough}
          sortDir={filters.sortDir}
          sortKey={filters.sortKey}
          totalUnfiltered={allRows.length}
        />
      </div>

      {/* Dispose confirm modal — CMIS-UI-03 §3 */}
      <DisposeConfirmModal
        onConfirm={handleDisposeConfirm}
        onOpenChange={setDisposeOpen}
        open={disposeOpen}
        originRect={disposeOrigin}
        row={disposeRow}
      />

      {/* Extend expiry modal — CMIS-UI-03 §3 */}
      <ExtendExpiryModal
        onConfirm={handleExtendConfirm}
        onOpenChange={setExtendOpen}
        open={extendOpen}
        originRect={extendOrigin}
        row={extendRow}
      />
    </div>
  );
}
