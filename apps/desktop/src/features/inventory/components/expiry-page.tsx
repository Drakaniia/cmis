import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useDensity } from "@/hooks/use-density";
import { insertNewItemWithBatch } from "../data/create-item-with-batch";
import { buildMinimapBuckets } from "../domain/expiry";
import { useExpiryFilters } from "../hooks/use-expiry-filters";
import { useExtendExpiryMutation } from "../hooks/use-extend-expiry";
import { useInventoryItems } from "../hooks/use-inventory-items";
import { useMediaQuery900 } from "../hooks/use-media-query-1200";
import {
  useStockInMutation,
  useStockOutMutation,
} from "../hooks/use-stock-mutations";
import { useDeleteBatch } from "../hooks/use-trash";
import {
  resolveStockDetailLink,
  type StockDetailSearch,
} from "../stock-detail-search";
import type { DisposeReason, ExpiryRow, StockOutPayload } from "../types";
import { DeleteConfirmModal } from "./delete-confirm-modal";
import { DisposeConfirmModal } from "./dispose-confirm-modal";
import { ExpiryFiltersBar } from "./expiry-filters";
import { ExpiryList } from "./expiry-list";
import { ExtendExpiryModal } from "./extend-expiry-modal";
import { StockDetailModal } from "./stock-detail-modal";
import { StockInWizard } from "./stock-in-wizard";
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
 * A disposal is a stock-out that was never dispensed, so it travels the same
 * path — the reason is the only part that differs, and mapping it here (rather
 * than at each call site) keeps "expired" from being logged as a dispense.
 */
const DISPOSE_STOCK_OUT_REASON: Record<
  DisposeReason,
  StockOutPayload["reason"]
> = {
  Damaged: "Damaged",
  Expired: "Disposed (expired)",
  Other: "Other",
};

function expiryDeleteTitle(rows: ExpiryRow[] | null): string {
  if (!rows || rows.length === 0) {
    return "Delete batch";
  }
  return rows.length === 1
    ? `Delete batch ${rows[0].batch.batch}?`
    : `Delete ${rows.length} batches?`;
}

/** Before → after numbers, so a wrong lot is corrected knowingly. */
function expiryDeleteConsequences(rows: ExpiryRow[] | null): string[] {
  if (!rows || rows.length === 0) {
    return [];
  }
  if (rows.length === 1) {
    const [row] = rows;
    return [
      `${row.batch.batch} — ${row.batch.qty} units (exp ${row.batch.expiry})`,
      `${row.item.displayName} qty ${row.item.qty} → ${Math.max(0, row.item.qty - row.batch.qty)}`,
      "Status is re-derived from the new qty, and the batch can be restored",
    ];
  }
  const units = rows.reduce((sum, row) => sum + row.batch.qty, 0);
  return [
    `${rows.length} batches`,
    `${units} units removed across ${new Set(rows.map((row) => row.item.id)).size} products`,
    "Each product's qty is corrected by subtraction, never rebuilt",
  ];
}

/**
 * CMIS-UI-03 — Expiry Alerts Page
 * Layout C (recommended): Table + timeline minimap.
 * Composes: filters bar → minimap → table → modals.
 * Responsive: ≥1200 full, 900–1199 SKU hidden, <900 horizontal scroll.
 *
 * Stock detail modal §6 — clicking a row opens the full detail modal. The
 * `?item=` / `?batch=` pair in the URL is what makes that modal shareable, and
 * it is cleared by every route out of the modal.
 */
export function ExpiryPage({
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
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
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

  const deleteBatch = useDeleteBatch();
  const [deleteRows, setDeleteRows] = useState<ExpiryRow[] | null>(null);

  const handleRequestDelete = useCallback((row: ExpiryRow) => {
    setDeleteRows([row]);
  }, []);

  const handleDeleteOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDeleteRows(null);
    }
  }, []);

  // Modals
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposeRow, setDisposeRow] = useState<ExpiryRow | null>(null);
  const [disposeOrigin, setDisposeOrigin] = useState<DOMRect | null>(null);

  const [extendOpen, setExtendOpen] = useState(false);
  const [extendRow, setExtendRow] = useState<ExpiryRow | null>(null);
  const [extendOrigin, setExtendOrigin] = useState<DOMRect | null>(null);

  // Detail modal — decision 23 dropped the old `selectedId` row tint entirely.
  const [detailRow, setDetailRow] = useState<ExpiryRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Wizards — decision 13: fully wired here, new-item creation included, so a
  // stock in from this page writes the same rows Stock Management writes.
  const queryClient = useQueryClient();
  const stockInMut = useStockInMutation();
  const stockOutMut = useStockOutMutation();
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
  const [wizardItemId, setWizardItemId] = useState<string | null>(null);
  const [wizardOrigin, setWizardOrigin] = useState<DOMRect | null>(null);

  const minimapBuckets = useMemo(() => buildMinimapBuckets(allRows), [allRows]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    onDeepLinkChange?.({});
  }, [onDeepLinkChange]);

  const handleView = useCallback(
    (row: ExpiryRow, _originRect: DOMRect | null) => {
      setDetailRow(row);
      setDetailOpen(true);
      onDeepLinkChange?.({ batch: row.batch.batch, item: row.item.id });
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

  // Decision 26 — the modal is the only URL state; a link that no longer
  // resolves is reported and dropped rather than opening a partial modal (27).
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

  // A back-button (or any other URL write) is a dismissal too.
  const urlDriven = Boolean(onDeepLinkChange);
  useEffect(() => {
    if (urlDriven && !deepLink?.item && detailOpen) {
      setDetailOpen(false);
    }
  }, [detailOpen, deepLink?.item, urlDriven]);

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

  // §9.1 — one modal at a time: the detail modal closes, then the target opens.
  const handleDetailDispose = useCallback(() => {
    if (detailRow) {
      handleDispose(detailRow, null);
    }
    closeDetail();
  }, [closeDetail, detailRow, handleDispose]);

  const handleDetailExtend = useCallback(() => {
    if (detailRow) {
      handleExtend(detailRow, null);
    }
    closeDetail();
  }, [closeDetail, detailRow, handleExtend]);

  const handleOpenInStockManagement = useCallback(
    (row: ExpiryRow) => {
      onOpenItemInStockManagement?.(row.item.id);
    },
    [onOpenItemInStockManagement]
  );

  // §9.1 — the detail modal steps aside, then the wizard arrives.
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

  const extendExpiryMut = useExtendExpiryMutation();

  // mutation invalidates the inventory queries, so the list reflects the
  // disposal without this page refetching by hand.
  const handleDisposeConfirm = useCallback(
    (payload: {
      itemId: string;
      batch: string;
      reason: DisposeReason;
      reasonOther: string;
      qty: number;
    }) => {
      stockOutMut.mutate(
        {
          batch: payload.batch,
          itemId: payload.itemId,
          qty: payload.qty,
          reason: DISPOSE_STOCK_OUT_REASON[payload.reason],
          reasonOther: payload.reasonOther,
        },
        {
          onError: (e) => toast.error(e.message),
          onSuccess: () => {
            toast.success(`Disposed: ${payload.batch} ×${payload.qty}`);
            setSelectedBatchKeys((prev) => {
              const next = new Set(prev);
              next.delete(`${payload.itemId}-${payload.batch}`);
              return next;
            });
          },
        }
      );
    },
    [stockOutMut]
  );

  const handleExtendConfirm = useCallback(
    (payload: {
      itemId: string;
      batch: string;
      newExpiry: string;
      note: string;
    }) => {
      extendExpiryMut.mutate(payload, {
        onError: (e) => toast.error(e.message),
        onSuccess: () =>
          toast.success(
            `Expiry extended: ${payload.batch} → ${payload.newExpiry}`
          ),
      });
    },
    [extendExpiryMut]
  );

  const handleDeleteConfirm = useCallback(
    async (reason: string) => {
      const rows = deleteRows ?? [];
      setDeleteRows(null);
      let units = 0;
      let removed = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: each batch is reported on individually
          const summary = await deleteBatch.mutateAsync({
            batchName: row.batch.batch,
            itemId: row.item.id,
            reason,
          });
          removed += 1;
          units += summary.totalQty;
        } catch {
          failed += 1;
        }
      }
      setSelectedBatchKeys(new Set());
      toast.success(
        `${removed} ${removed === 1 ? "batch" : "batches"} moved to Trash`,
        {
          description: `${units} units removed${failed > 0 ? ` · ${failed} failed` : ""}`,
        }
      );
    },
    [deleteBatch, deleteRows]
  );

  const handleBulkDispose = useCallback(() => {
    const rows = filtered.filter((row) =>
      selectedBatchKeys.has(`${row.item.id}-${row.batch.batch}`)
    );
    if (rows.length > 0) {
      setDeleteRows(rows);
    }
  }, [filtered, selectedBatchKeys]);

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
          onDelete={handleRequestDelete}
          onDispose={handleDispose}
          onExtend={handleExtend}
          onOpenInStockManagement={handleOpenInStockManagement}
          onSort={setSort}
          onToggleAll={handleToggleAll}
          onToggleBatch={handleToggleBatch}
          onView={handleView}
          rows={filtered}
          selectedBatchKeys={selectedBatchKeys}
          showSku={isWideEnough}
          sortDir={filters.sortDir}
          sortKey={filters.sortKey}
          totalUnfiltered={allRows.length}
        />
      </div>

      {/* Stock detail modal — §7, one detail surface for all three pages */}
      <StockDetailModal
        batch={detailRow?.batch ?? null}
        item={detailRow?.item ?? null}
        items={items}
        onDispose={handleDetailDispose}
        onExtend={handleDetailExtend}
        onItemUpdated={refreshInventory}
        onOpenChange={handleDetailOpenChange}
        onStockIn={handleDetailStockIn}
        onStockOut={handleDetailStockOut}
        open={detailOpen}
      />

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

      {/* Batch delete — spec §7.7, the same math stock-out uses, its own copy. */}
      <DeleteConfirmModal
        confirmLabel={
          (deleteRows?.length ?? 0) > 1 ? "Delete batches" : "Move to Trash"
        }
        consequences={expiryDeleteConsequences(deleteRows)}
        onConfirm={handleDeleteConfirm}
        onOpenChange={handleDeleteOpenChange}
        open={deleteRows !== null}
        title={expiryDeleteTitle(deleteRows)}
      />

      {/* §13.2 — same wizards, same mutations, same new-item path as Stock
       * Management, so creating a product here is not a second implementation. */}
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
