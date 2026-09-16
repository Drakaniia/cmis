import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, PackagePlus, RefreshCw } from "lucide-react";
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/features/admin/components/confirm-modal";
import { useDensity } from "@/hooks/use-density";
import { insertNewItemWithBatch } from "../data/create-item-with-batch";
import { useBarcodeWedge } from "../hooks/use-barcode-wedge";
import { useInventoryDeletion } from "../hooks/use-inventory-deletion";
import { useInventoryFilters } from "../hooks/use-inventory-filters";
import { useInventoryItems } from "../hooks/use-inventory-items";
import { useMediaQuery1200 } from "../hooks/use-media-query-1200";
import { usePanelRatio } from "../hooks/use-panel-ratio";
import {
  useStockInMutation,
  useStockOutMutation,
} from "../hooks/use-stock-mutations";
import type { InventoryTab } from "../inventory-search";
import type { StockOutPayload } from "../types";
import { DeleteConfirmModal } from "./delete-confirm-modal";
import { InventoryDetailContent } from "./inventory-detail";
import { InventoryDetailSheet } from "./inventory-detail-sheet";
import { InventoryFiltersBar } from "./inventory-filters";
import { InventoryList } from "./inventory-list";
import { InventorySelectionToolbar } from "./inventory-selection-toolbar";
import { NoInventoryEmptyState } from "./no-inventory-empty-state";
import { StockInWizard } from "./stock-in-wizard";
import { StockOutWizard } from "./stock-out-wizard";
import { TrashList } from "./trash-list";

function InventoryTabButton({
  id,
  label,
  selected,
  onSelect,
}: {
  id: InventoryTab;
  label: string;
  onSelect: (tab: InventoryTab) => void;
  selected: boolean;
}) {
  const handleClick = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <button
      aria-selected={selected}
      className={cn(
        "press-feedback rounded-md px-2.5 py-1 text-[12px] transition-colors",
        selected
          ? "bg-muted font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:text-foreground"
      )}
      onClick={handleClick}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

function InventoryTabStrip({
  activeTab,
  onTabChange,
  trashCount,
}: {
  activeTab: InventoryTab;
  onTabChange?: (tab: InventoryTab) => void;
  trashCount: number;
}) {
  const handleSelect = useCallback(
    (tab: InventoryTab) => onTabChange?.(tab),
    [onTabChange]
  );
  return (
    <div
      aria-label="Inventory sections"
      className="flex shrink-0 items-center gap-1 border-border/50 border-b bg-card px-2 py-1.5"
      role="tablist"
    >
      <InventoryTabButton
        id="stock"
        label="Stock"
        onSelect={handleSelect}
        selected={activeTab === "stock"}
      />
      <InventoryTabButton
        id="trash"
        label={trashCount > 0 ? `Trash (${trashCount})` : "Trash"}
        onSelect={handleSelect}
        selected={activeTab === "trash"}
      />
      <Link
        className="press-feedback ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-medium text-[12px] text-primary-foreground hover:bg-primary/90"
        to="/admin/inventory/add"
      >
        <PackagePlus aria-hidden className="size-3.5" />
        Add Inventory
      </Link>
    </div>
  );
}

export function InventoryPage({
  activeTab = "stock",
  onTabChange,
  preselectItemId = null,
}: {
  activeTab?: InventoryTab;
  onTabChange?: (tab: InventoryTab) => void;
  /** Decision 14 — `?item=` from an alert page's "Open in Stock Management". */
  preselectItemId?: string | null;
} = {}) {
  const { density } = useDensity();
  const isWide = useMediaQuery1200();
  const { displayRatio, setRatio, toggleCollapse, collapsed } = usePanelRatio();

  // Live inventory from SQLite
  const {
    data: itemsData,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useInventoryItems();
  const items = itemsData ?? [];
  const stockInMut = useStockInMutation();
  const stockOutMut = useStockOutMutation();
  const [error, setError] = useState<string | null>(null);
  const effectiveError = (queryError as Error | null)?.message ?? error;
  const {
    filtered,
    filters,
    setSearch,
    setCategory,
    setStatus,
    setSort,
    clearFilters,
    activeChips,
    removeChip,
  } = useInventoryFilters(items);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  // The alert pages hand the operator here with the product already chosen.
  useEffect(() => {
    if (preselectItemId) {
      setSelectedId(preselectItemId);
    }
  }, [preselectItemId]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");

  // Deletion + Trash (spec §7.6, §7.7) — kept in one hook so this page stays a
  // composition root rather than a home for delete rules.
  const {
    clearSelection,
    closeDeleteTarget,
    closePurge,
    closeSkuConflict,
    confirmDelete,
    confirmPurge,
    deleteConsequences,
    deleteLabel,
    deleteOpen,
    deleteTitle,
    purgeConsequences,
    purgeOpen,
    purgeTitle,
    requestDeleteBatch,
    requestDeleteBulk,
    requestDeleteItem,
    requestPurge,
    requestPurgeSelected,
    restore,
    restoreWithSku,
    selectedIds,
    selectedTrashIds,
    skuConflict,
    toggleAll,
    toggleAllTrash,
    toggleSelect,
    toggleTrash,
    trash,
  } = useInventoryDeletion({ filtered, filters, items });

  // Wizards
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
  const [wizardOrigin, setWizardOrigin] = useState<DOMRect | null>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  // Detail-view actions act on whatever row is selected, so they adapt the
  // hook's item-first signatures rather than re-resolving it at each call site.
  const handleDeleteProductFromDetail = useCallback(() => {
    if (selectedItem) {
      requestDeleteItem(selectedItem);
    }
  }, [requestDeleteItem, selectedItem]);

  const handleDeleteBatchFromDetail = useCallback(
    (batchName: string) => {
      if (selectedItem) {
        requestDeleteBatch(selectedItem, batchName);
      }
    },
    [requestDeleteBatch, selectedItem]
  );

  const handleSelect = useCallback(
    (id: string, rect: DOMRect | null) => {
      setSelectedId(id);
      if (rect) {
        setOriginRect(rect);
      }
      if (isWide) {
        // focus moves to detail first button via autoFocus in panel mode
      } else {
        setSheetOpen(true);
      }
    },
    [isWide]
  );

  const handleScan = useCallback(
    (code: string) => {
      const q = code.trim().toLowerCase();
      const found = items.find(
        (i) =>
          i.sku.toLowerCase() === q ||
          i.barcode?.toLowerCase() === q ||
          i.batches.some((b) => b.batch.toLowerCase() === q)
      );
      if (found) {
        setSelectedId(found.id);
        // try to find row rect? use null for now
        if (!isWide) {
          setSheetOpen(true);
        }
        toast.success(`Scanned: ${found.displayName}`);
        setBarcodeValue("");
      } else {
        toast.message("Not found — Create new item?", {
          action: {
            label: "Stock In",
            onClick: () => {
              setWizardOrigin(null);
              setStockInOpen(true);
            },
          },
          description: `No match for "${code}"`,
        });
      }
    },
    [isWide, items]
  );

  useBarcodeWedge(handleScan, { enabled: true });

  const handleBarcodeScanInline = useCallback(
    (code: string) => {
      if (!code.trim()) {
        return;
      }
      handleScan(code);
      setBarcodeValue(code);
    },
    [handleScan]
  );

  // Detail actions → wizards
  const openStockIn = useCallback(
    (rectSource?: DOMRect | null) => {
      // capture trigger rect for materialize origin
      const r = rectSource ?? originRect;
      setWizardOrigin(r);
      setStockInOpen(true);
      if (!isWide) {
        setSheetOpen(false);
      }
    },
    [isWide, originRect]
  );

  const openStockOut = useCallback(
    (rectSource?: DOMRect | null) => {
      const r = rectSource ?? originRect;
      setWizardOrigin(r);
      setStockOutOpen(true);
      if (!isWide) {
        setSheetOpen(false);
      }
    },
    [isWide, originRect]
  );

  const handleStockInFromDetail = useCallback(() => {
    openStockIn(null);
  }, [openStockIn]);

  const handleStockOutFromDetail = useCallback(() => {
    openStockOut(null);
  }, [openStockOut]);

  const handleStockInFromSheet = useCallback(() => {
    openStockIn(originRect);
  }, [openStockIn, originRect]);

  const handleStockOutFromSheet = useCallback(() => {
    openStockOut(originRect);
  }, [openStockOut, originRect]);

  // Stock In confirm — persistent via SQLite
  const handleStockInConfirm = useCallback(
    (payload: {
      itemId: string | null;
      isNew: boolean;
      name: string;
      category: string;
      form: string;
      packSize: string;
      strengthUnit: string;
      strengthValue: string;
      batch: string;
      expiry: string;
      qty: number;
      supplier: string | null;
      notes: string;
    }) => {
      // Use mutation; payload.isNew creates new item via direct DB insert fallback
      if (payload.isNew || !payload.itemId) {
        // For new items, insert directly via Database (no prior item)
        (async () => {
          try {
            const id = await insertNewItemWithBatch(payload);
            await refetch();
            setSelectedId(id);
            toast.success("Stock in — saved to SQLite");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
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
          onError: (e) => setError(e.message),
          onSuccess: () => toast.success("Stock in — saved"),
        }
      );
    },
    [refetch, stockInMut]
  );

  const handleStockOutConfirm = useCallback(
    (payload: {
      itemId: string;
      qty: number;
      batch: string;
      reason: string;
      notes: string;
    }) => {
      stockOutMut.mutate(
        {
          batch: payload.batch,
          itemId: payload.itemId,
          qty: payload.qty,
          reason: payload.reason as StockOutPayload["reason"],
        },
        {
          onError: (e) => setError(e.message),
          onSuccess: () => toast.success("Stock out — saved"),
        }
      );
    },
    [stockOutMut]
  );

  const handleRetry = useCallback(() => {
    setError(null);
    refetch()
      .then(() => toast.success("Inventory refreshed"))
      .catch(() => toast.error("Retry failed"));
  }, [refetch]);

  // Divider drag
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<boolean>(false as boolean);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!(draggingRef.current && containerRef.current && isWide)) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setRatio(ratio);
    },
    [isWide, setRatio]
  );

  const handlePointerUp = useCallback((e: PointerEvent) => {
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  // TODO: trigger error state from real data fetching
  // For now, expose via a small dev trigger
  const showErrorBanner = !loading && effectiveError !== null;
  const isEmptyDb = !loading && items.length === 0 && !effectiveError;

  if (isEmptyDb && activeTab === "stock") {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <InventoryTabStrip
          activeTab={activeTab}
          onTabChange={onTabChange}
          trashCount={trash.length}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <NoInventoryEmptyState description="Import your inventory CSV to get started. No data is bundled — pick the file via Admin." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <InventoryTabStrip
        activeTab={activeTab}
        onTabChange={onTabChange}
        trashCount={trash.length}
      />

      {activeTab === "stock" ? (
        <InventorySelectionToolbar
          count={selectedIds.size}
          onClear={clearSelection}
          onDelete={requestDeleteBulk}
        />
      ) : null}

      {showErrorBanner ? (
        <div
          className="flex shrink-0 items-center gap-2 border-destructive/20 border-b bg-destructive/5 px-3 py-2 text-sm"
          ref={errorBannerRef}
          role="alert"
          tabIndex={-1}
        >
          <AlertTriangle
            aria-hidden
            className="size-4 shrink-0 text-destructive"
          />
          <span className="flex-1 text-destructive">{effectiveError}</span>
          <Button
            className="press-feedback shrink-0"
            onClick={handleRetry}
            size="sm"
            variant="outline"
          >
            <RefreshCw aria-hidden className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      {/* Content area */}
      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        ref={containerRef}
        style={{ position: "relative" }}
      >
        {activeTab === "trash" ? (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
            <TrashList
              entries={trash}
              onPurge={requestPurge}
              onPurgeSelected={requestPurgeSelected}
              onRestore={restore}
              onToggle={toggleTrash}
              onToggleAll={toggleAllTrash}
              selectedIds={selectedTrashIds}
            />
          </div>
        ) : null}

        {activeTab === "stock" && isWide ? (
          <>
            {/* List panel */}
            <div
              className="flex min-w-0 flex-col overflow-hidden border-border/50 border-r bg-card"
              style={{
                flexBasis: `${displayRatio * 100}%`,
                flexGrow: 0,
                flexShrink: 0,
                minWidth: 320,
              }}
            >
              <InventoryFiltersBar
                activeChips={activeChips}
                barcodeValue={barcodeValue}
                density={density}
                filters={filters}
                onBarcodeChange={setBarcodeValue}
                onBarcodeScan={handleBarcodeScanInline}
                onCategoryChange={setCategory}
                onClearFilters={clearFilters}
                onRemoveChip={removeChip}
                onSearchChange={setSearch}
                onStatusChange={setStatus}
              />
              <div className="min-h-0 flex-1 overflow-hidden">
                <InventoryList
                  density={density}
                  items={filtered}
                  loading={loading}
                  onClearFilters={clearFilters}
                  onDeleteItem={requestDeleteItem}
                  onRowRect={setOriginRect}
                  onSelect={handleSelect}
                  onSort={setSort}
                  onToggleAll={toggleAll}
                  onToggleSelect={toggleSelect}
                  selectable
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  sortDir={filters.sortDir}
                  sortKey={filters.sortKey}
                  totalUnfiltered={items.length}
                />
              </div>
            </div>

            {/* Divider */}
            {collapsed ? (
              <button
                aria-label="Restore detail panel"
                className="flex w-6 shrink-0 items-center justify-center border-border/50 border-l bg-muted text-caption hover:bg-accent"
                onClick={toggleCollapse}
                type="button"
              >
                ›
              </button>
            ) : (
              <div
                aria-label="Resize panels — drag to adjust, double-click to collapse"
                aria-orientation="vertical"
                aria-valuenow={Math.round(displayRatio * 100)}
                className="group relative flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-transparent"
                onDoubleClick={toggleCollapse}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                role="separator"
                style={{ touchAction: "none" }}
                tabIndex={0}
              >
                <div className="h-full w-px bg-border group-hover:w-1 group-hover:bg-primary/30" />
                <div className="absolute inset-y-0 left-1/2 w-[12px] -translate-x-1/2" />
              </div>
            )}

            {/* Detail panel */}
            <div
              className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card"
              style={{ minWidth: 360 }}
            >
              {collapsed ? (
                <div className="flex flex-1 items-center justify-center p-6">
                  <button
                    className="rounded-md border border-dashed px-4 py-3 text-caption text-muted-foreground hover:bg-muted"
                    onClick={toggleCollapse}
                    type="button"
                  >
                    Detail collapsed — double-click divider or click to restore
                  </button>
                </div>
              ) : (
                <div className="flex h-full flex-col overflow-hidden">
                  <InventoryDetailContent
                    autoFocus={!!selectedId}
                    item={selectedItem}
                    items={items}
                    onDeleteBatch={handleDeleteBatchFromDetail}
                    onDeleteProduct={handleDeleteProductFromDetail}
                    onItemUpdated={refetch}
                    onStockIn={handleStockInFromDetail}
                    onStockOut={handleStockOutFromDetail}
                  />
                </div>
              )}
            </div>
          </>
        ) : null}

        {activeTab === "stock" && !isWide ? (
          // Narrow: full-width list, detail as sheet
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
            <InventoryFiltersBar
              activeChips={activeChips}
              barcodeValue={barcodeValue}
              density={density}
              filters={filters}
              onBarcodeChange={setBarcodeValue}
              onBarcodeScan={handleBarcodeScanInline}
              onCategoryChange={setCategory}
              onClearFilters={clearFilters}
              onRemoveChip={removeChip}
              onSearchChange={setSearch}
              onStatusChange={setStatus}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              <InventoryList
                density={density}
                items={filtered}
                loading={loading}
                onClearFilters={clearFilters}
                onDeleteItem={requestDeleteItem}
                onRowRect={setOriginRect}
                onSelect={handleSelect}
                onSort={setSort}
                onToggleAll={toggleAll}
                onToggleSelect={toggleSelect}
                selectable
                selectedId={selectedId}
                selectedIds={selectedIds}
                sortDir={filters.sortDir}
                sortKey={filters.sortKey}
                totalUnfiltered={items.length}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Detail sheet for narrow */}
      <InventoryDetailSheet
        item={selectedItem}
        items={items}
        onDeleteBatch={handleDeleteBatchFromDetail}
        onDeleteProduct={handleDeleteProductFromDetail}
        onItemUpdated={refetch}
        onOpenChange={setSheetOpen}
        onStockIn={handleStockInFromSheet}
        onStockOut={handleStockOutFromSheet}
        open={sheetOpen && !isWide}
        originRect={originRect}
      />

      {/* Deletion — one modal for product, batch and bulk (§7.7). */}
      <DeleteConfirmModal
        confirmLabel={deleteLabel}
        consequences={deleteConsequences}
        onConfirm={confirmDelete}
        onOpenChange={closeDeleteTarget}
        open={deleteOpen}
        title={deleteTitle}
      />

      {/* Permanent removal (§7.6) — the only irreversible action, so it asks for
       * a different word than the recoverable ones. */}
      <DeleteConfirmModal
        confirmLabel="Delete permanently"
        confirmWord="PURGE"
        consequences={purgeConsequences}
        onConfirm={confirmPurge}
        onOpenChange={closePurge}
        open={purgeOpen}
        reversible={false}
        title={purgeTitle}
      />

      {/* Restore blocked on a taken SKU — offers the suffixed one (§7.6). */}
      <ConfirmModal
        confirmLabel={
          skuConflict ? `Restore as ${skuConflict.suggestedSku}` : "Restore"
        }
        description={
          skuConflict ? (
            <span>
              {skuConflict.message} Restoring it under a new SKU keeps both
              products, and the original stays in Trash.
            </span>
          ) : null
        }
        onConfirm={restoreWithSku}
        onOpenChange={closeSkuConflict}
        open={skuConflict !== null}
        title="SKU already in use"
      />

      {/* Wizards — always centered modal 560px, not bottom sheet */}
      <StockInWizard
        initialItemId={selectedId}
        items={items}
        onConfirm={handleStockInConfirm}
        onOpenChange={setStockInOpen}
        open={stockInOpen}
        originRect={wizardOrigin}
      />
      <StockOutWizard
        initialItemId={selectedId}
        items={items}
        onConfirm={handleStockOutConfirm}
        onOpenChange={setStockOutOpen}
        open={stockOutOpen}
        originRect={wizardOrigin}
      />
    </div>
  );
}
