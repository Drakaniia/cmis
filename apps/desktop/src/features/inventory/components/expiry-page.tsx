import { useCallback, useMemo, useState } from "react";
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
  const [items] = useState(mockExpiryInventory);
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<Set<string>>(
    new Set()
  );

  const handleClearMonth = useCallback(() => {
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
  } = useExpiryFilters(items, activeMonth, handleClearMonth);

  // Wrap clearFilters to also clear minimap month
  const clearFilters = useCallback(() => {
    hookClearFilters();
    setActiveMonth(null);
  }, [hookClearFilters]);

  // Modals
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposeRow, setDisposeRow] = useState<ExpiryRow | null>(null);
  const [disposeOrigin, setDisposeOrigin] = useState<DOMRect | null>(null);

  const [extendOpen, setExtendOpen] = useState(false);
  const [extendRow, setExtendRow] = useState<ExpiryRow | null>(null);
  const [extendOrigin, setExtendOrigin] = useState<DOMRect | null>(null);

  const minimapBuckets = useMemo(() => buildMinimapBuckets(allRows), [allRows]);

  const handleSelect = useCallback((id: string, _rect: DOMRect | null) => {
    setSelectedId(id);
  }, []);

  const handleToggleBatch = useCallback((key: string) => {
    setSelectedBatchKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (selectedBatchKeys.size === filtered.length) {
      setSelectedBatchKeys(new Set());
    } else {
      setSelectedBatchKeys(
        new Set(filtered.map((r) => `${r.item.id}-${r.batch.batch}`))
      );
    }
  }, [filtered, selectedBatchKeys.size]);

  const handleDispose = useCallback(
    (row: ExpiryRow, originRect: DOMRect | null) => {
      setDisposeRow(row);
      setDisposeOrigin(originRect);
      setDisposeOpen(true);
    },
    []
  );

  const handleExtend = useCallback(
    (row: ExpiryRow, originRect: DOMRect | null) => {
      setExtendRow(row);
      setExtendOrigin(originRect);
      setExtendOpen(true);
    },
    []
  );

  const handleView = useCallback(
    (row: ExpiryRow, _originRect: DOMRect | null) => {
      // Navigate to inventory detail — for now, select the item
      setSelectedId(row.item.id);
      toast.info(`Viewing: ${row.item.name} — batch ${row.batch.batch}`);
    },
    []
  );

  const handleDisposeConfirm = useCallback(
    (payload: {
      itemId: string;
      batch: string;
      reason: DisposeReason;
      qty: number;
    }) => {
      toast.success(`Disposed: ${payload.batch} ×${payload.qty}`);
      setSelectedBatchKeys((prev) => {
        const next = new Set(prev);
        next.delete(`${payload.itemId}-${payload.batch}`);
        return next;
      });
    },
    []
  );

  const handleExtendConfirm = useCallback(
    (payload: {
      itemId: string;
      batch: string;
      newExpiry: string;
      note: string;
    }) => {
      toast.success(`Expiry extended: ${payload.batch} → ${payload.newExpiry}`);
    },
    []
  );

  const handleBulkDispose = useCallback(() => {
    // bulk dispose — for now just toast
    toast.info(`Dispose ${selectedBatchKeys.size} selected items`);
  }, [selectedBatchKeys.size]);

  const handleSelectBucket = useCallback(
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
        onBulkDispose={handleBulkDispose}
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
