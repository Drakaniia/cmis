import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useDensity } from "@/hooks/use-density";
import { insertNewItemWithBatch } from "../data/create-item-with-batch";
import { useInventoryItems } from "../hooks/use-inventory-items";
import { useLowStockFilters } from "../hooks/use-low-stock-filters";
import { useMediaQuery900 } from "../hooks/use-media-query-1200";
import {
  useStockInMutation,
  useStockOutMutation,
} from "../hooks/use-stock-mutations";
import { useUpdateThresholdMutation } from "../hooks/use-update-threshold";
import {
  resolveStockDetailLink,
  type StockDetailSearch,
} from "../stock-detail-search";
import type { LowStockRow, StockOutPayload } from "../types";
import { AdjustThresholdPopover } from "./adjust-threshold-popover";
import { LowStockFiltersBar } from "./low-stock-filters";
import { LowStockList } from "./low-stock-list";
import { ReorderSheet } from "./reorder-sheet";
import { StockDetailModal } from "./stock-detail-modal";
import { StockInWizard } from "./stock-in-wizard/stock-in-wizard";
import { StockOutWizard } from "./stock-out-wizard";

interface WizardStockInDraft {
  batch: string;
  category: string;
  expiry: string;
  form: string;
  isNew: boolean;
  itemId: string | null;
  name: string;
  notes: string;
  packSize: string;
  qty: number;
  strengthUnit: string;
  strengthValue: string;
  supplier: string | null;
}

interface WizardStockOutDraft {
  batch: string;
  itemId: string;
  notes: string;
  qty: number;
  reason: string;
}

/**
 * CMIS-UI-04 — Low-Stock Alerts Page
 * Layout C (recommended): Table with inline gap visualization.
 * Composes: filters bar → table → reorder sheet + threshold popover.
 * Responsive: ≥1200 full table, 900–1199 supplier hidden, <900 card fallback.
 *
 * Stock detail modal §6 — the whole row opens the full detail modal. Low-Stock
 * has no clicked batch, so the modal renders without the batch band (decision 11).
 */
export function LowStockPage({
  deepLink,
  onDeepLinkChange,
  onOpenItemInStockManagement,
}: {
  deepLink?: StockDetailSearch;
  onDeepLinkChange?: (next: StockDetailSearch) => void;
  onOpenItemInStockManagement?: (itemId: string) => void;
} = {}) {
  const { density } = useDensity();
  const isWideEnough = useMediaQuery900();
  const { data: itemsData, isSuccess } = useInventoryItems();
  const items = itemsData ?? [];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    activeChips,
    allRows,
    clearFilters,
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

  // Detail modal
  const [detailRow, setDetailRow] = useState<LowStockRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Wizards — decision 13
  const queryClient = useQueryClient();
  const stockInMut = useStockInMutation();
  const stockOutMut = useStockOutMutation();
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
  const [wizardItemId, setWizardItemId] = useState<string | null>(null);
  const [wizardOrigin, setWizardOrigin] = useState<DOMRect | null>(null);

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

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    onDeepLinkChange?.({});
  }, [onDeepLinkChange]);

  const handleView = useCallback(
    (row: LowStockRow, _originRect: DOMRect | null) => {
      setDetailRow(row);
      setDetailOpen(true);
      onDeepLinkChange?.({ item: row.item.id });
    },
    [onDeepLinkChange]
  );

  const handleDetailOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setDetailOpen(true);
        return;
      }
      closeDetail();
    },
    [closeDetail]
  );

  // Decision 26 — modal-only URL state; decision 27 — a dead link is reported
  // and cleared rather than opening a partial modal.
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    if (!(isSuccess && deepLink?.item)) {
      return;
    }
    const key = `${deepLink.item}|${deepLink.batch ?? ""}`;
    if (handledLink.current === key) {
      return;
    }
    handledLink.current = key;
    const resolution = resolveStockDetailLink(
      deepLink,
      allRows,
      items.map((entry) => entry.id)
    );
    if (resolution.status === "open") {
      setDetailRow(allRows[resolution.index] ?? null);
      setDetailOpen(true);
      return;
    }
    if (resolution.status === "stale") {
      toast.error(resolution.message);
      onDeepLinkChange?.({});
    }
  }, [allRows, deepLink, isSuccess, items, onDeepLinkChange]);

  const urlDriven = Boolean(onDeepLinkChange);
  useEffect(() => {
    if (urlDriven && !deepLink?.item && detailOpen) {
      setDetailOpen(false);
    }
  }, [detailOpen, deepLink?.item, urlDriven]);

  const handleOpenInStockManagement = useCallback(
    (row: LowStockRow) => {
      onOpenItemInStockManagement?.(row.item.id);
    },
    [onOpenItemInStockManagement]
  );

  // §9.1 — one modal at a time: close the detail, then open the target.
  const handleDetailReorder = useCallback(() => {
    if (detailRow) {
      handleReorder(detailRow, null);
    }
    closeDetail();
  }, [closeDetail, detailRow, handleReorder]);

  const handleDetailAdjustThreshold = useCallback(() => {
    if (detailRow) {
      handleAdjustThreshold(detailRow, null);
    }
    closeDetail();
  }, [closeDetail, detailRow, handleAdjustThreshold]);

  const openStockIn = useCallback(
    (itemId: string | null, originRect: DOMRect | null) => {
      setWizardItemId(itemId);
      setWizardOrigin(originRect);
      setStockInOpen(true);
    },
    []
  );

  const openStockOut = useCallback(
    (itemId: string | null, originRect: DOMRect | null) => {
      setWizardItemId(itemId);
      setWizardOrigin(originRect);
      setStockOutOpen(true);
    },
    []
  );

  const handleDetailStockIn = useCallback(() => {
    const itemId = detailRow?.item.id ?? null;
    closeDetail();
    openStockIn(itemId, null);
  }, [closeDetail, detailRow, openStockIn]);

  const handleDetailStockOut = useCallback(() => {
    const itemId = detailRow?.item.id ?? null;
    closeDetail();
    openStockOut(itemId, null);
  }, [closeDetail, detailRow, openStockOut]);

  const refreshInventory = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
    await queryClient.invalidateQueries({
      queryKey: ["inventory_items_count"],
    });
  }, [queryClient]);

  const handleStockInConfirm = useCallback(
    (payload: WizardStockInDraft) => {
      if (payload.isNew || !payload.itemId) {
        (async () => {
          try {
            await insertNewItemWithBatch(payload);
            await refreshInventory();
            toast.success("Stock in — saved");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
        })();
        return;
      }
      stockInMut.mutate(
        {
          batch: payload.batch,
          category: payload.category,
          expiry: payload.expiry,
          form: payload.form,
          identifier: payload.itemId ?? payload.name,
          name: payload.name,
          packSize: payload.packSize,
          qty: payload.qty,
          strengthUnit: payload.strengthUnit,
          strengthValue: payload.strengthValue,
          supplier: payload.supplier,
        },
        {
          onError: (e) => toast.error(e.message),
          onSuccess: () => toast.success("Stock in — saved"),
        }
      );
    },
    [refreshInventory, stockInMut]
  );

  const handleStockOutConfirm = useCallback(
    (payload: WizardStockOutDraft) => {
      stockOutMut.mutate(
        {
          batch: payload.batch,
          itemId: payload.itemId,
          qty: payload.qty,
          reason: payload.reason as StockOutPayload["reason"],
        },
        {
          onError: (e) => toast.error(e.message),
          onSuccess: () => toast.success("Stock out — saved"),
        }
      );
    },
    [stockOutMut]
  );

  /**
   * Reorder has nothing to write. The help docs are explicit — "Nothing is sent
   * to a supplier from CMIS… the sheet is a shopping list" — and no table holds
   * an order, so the sheet's job ends at handing the list over. The toast says
   * that rather than claiming a record that does not exist.
   */
  const handleReorderConfirm = useCallback(
    (payload: {
      itemId: string;
      itemName: string;
      qty: number;
      supplier: string;
    }) => {
      toast.success(
        `Reorder list: ${payload.itemName} ×${payload.qty} via ${payload.supplier}`,
        {
          description:
            "Nothing is sent to a supplier — hand this list to whoever places orders.",
        }
      );
    },
    []
  );

  const thresholdMut = useUpdateThresholdMutation();

  // re-derives it: a row that no longer falls below its threshold has to leave
  // this list now, not at the next import.
  const handleThresholdConfirm = useCallback(
    (payload: {
      itemId: string;
      itemName: string;
      newThreshold: number;
      oldThreshold: number;
    }) => {
      thresholdMut.mutate(
        { itemId: payload.itemId, threshold: payload.newThreshold },
        {
          onError: (e) => toast.error(e.message),
          onSuccess: () =>
            toast.success(
              `Threshold for ${payload.itemName}: ${payload.oldThreshold} → ${payload.newThreshold}`
            ),
        }
      );
    },
    [thresholdMut]
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
          onOpenInStockManagement={handleOpenInStockManagement}
          onReorder={handleReorder}
          onSort={setSort}
          onToggleAll={handleToggleAll}
          onToggleItem={handleToggleItem}
          onView={handleView}
          rows={filtered}
          selectedIds={selectedIds}
          showSku={isWideEnough}
          showSupplier={isWideEnough}
          sortDir={filters.sortDir}
          sortKey={filters.sortKey}
          totalUnfiltered={allRows.length}
        />
      </div>

      {/* Stock detail modal — decision 11: no batch, so no batch band. */}
      <StockDetailModal
        item={detailRow?.item ?? null}
        items={items}
        onAdjustThreshold={handleDetailAdjustThreshold}
        onItemUpdated={refreshInventory}
        onOpenChange={handleDetailOpenChange}
        onReorder={handleDetailReorder}
        onStockIn={handleDetailStockIn}
        onStockOut={handleDetailStockOut}
        open={detailOpen}
      />

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

      {/* §13.2 — same wizards, same mutations, same new-item path */}
      <StockInWizard
        initialItemId={wizardItemId}
        items={items}
        onConfirm={handleStockInConfirm}
        onOpenChange={setStockInOpen}
        open={stockInOpen}
        originRect={wizardOrigin}
      />
      <StockOutWizard
        initialItemId={wizardItemId}
        items={items}
        onConfirm={handleStockOutConfirm}
        onOpenChange={setStockOutOpen}
        open={stockOutOpen}
        originRect={wizardOrigin}
      />
    </div>
  );
}
