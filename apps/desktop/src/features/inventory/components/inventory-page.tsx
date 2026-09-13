import { Button } from "@cmis/ui/components/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  type PointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useDensity } from "@/hooks/use-density";
import { useBarcodeWedge } from "../hooks/use-barcode-wedge";
import { useInventoryFilters } from "../hooks/use-inventory-filters";
import { useMediaQuery1200 } from "../hooks/use-media-query-1200";
import { usePanelRatio } from "../hooks/use-panel-ratio";
import { mockInventory } from "../mock";
import type { InventoryItem } from "../types";
import { InventoryDetailContent } from "./inventory-detail";
import { InventoryDetailSheet } from "./inventory-detail-sheet";
import { InventoryFiltersBar } from "./inventory-filters";
import { InventoryList } from "./inventory-list";
import { StockInWizard } from "./stock-in-wizard";
import { StockOutWizard } from "./stock-out-wizard";

function derivedStatus(
  total: number,
  threshold: number,
  current: InventoryItem["status"]
): InventoryItem["status"] {
  if (total === 0) {
    return "out";
  }
  if (total <= threshold) {
    return "low";
  }
  return current;
}

export function InventoryPage() {
  const { density } = useDensity();
  const isWide = useMediaQuery1200();
  const { displayRatio, setRatio, toggleCollapse, collapsed } = usePanelRatio();

  // Inventory state (mock mutable)
  const [items, setItems] = useState<InventoryItem[]>(mockInventory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");

  // Wizards
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
  const [wizardOrigin, setWizardOrigin] = useState<DOMRect | null>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
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
        toast.success(`Scanned: ${found.name}`);
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

  // Stock In confirm — mutate items
  const handleStockInConfirm = useCallback(
    (payload: {
      itemId: string | null;
      isNew: boolean;
      name: string;
      category: string;
      unit: string;
      batch: string;
      expiry: string;
      qty: number;
      supplier: string;
      notes: string;
    }) => {
      if (payload.isNew || !payload.itemId) {
        const newItem: InventoryItem = {
          batches: [
            {
              batch: payload.batch,
              expiry: payload.expiry,
              qty: payload.qty,
              supplier: payload.supplier,
            },
          ],
          category: payload.category,
          dispensingHistory: [],
          expiry: payload.expiry,
          id: `inv-${Date.now()}`,
          name: payload.name,
          qty: payload.qty,
          sku: `SKU-${String(items.length + 1).padStart(3, "0")}`,
          status: payload.qty > 0 ? "in" : "out",
          supplier: payload.supplier,
          threshold: 15,
        };
        setItems((prev) => [newItem, ...prev]);
        setSelectedId(newItem.id);
      } else {
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== payload.itemId) {
              return it;
            }
            const newBatches = [
              ...it.batches,
              {
                batch: payload.batch,
                expiry: payload.expiry,
                qty: payload.qty,
                supplier: payload.supplier,
              },
            ];
            const total = newBatches.reduce((s, b) => s + b.qty, 0);
            const nearest = [...newBatches].sort(
              (a, b) =>
                new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
            )[0].expiry;
            return {
              ...it,
              batches: newBatches,
              expiry: nearest,
              qty: total,
              status: derivedStatus(total, it.threshold, it.status),
            };
          })
        );
      }
    },
    [items.length]
  );

  const handleStockOutConfirm = useCallback(
    (payload: {
      itemId: string;
      qty: number;
      batch: string;
      reason: string;
      notes: string;
    }) => {
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== payload.itemId) {
            return it;
          }
          const newBatches = it.batches.map((b) =>
            b.batch === payload.batch
              ? { ...b, qty: Math.max(0, b.qty - payload.qty) }
              : b
          );
          const total = newBatches.reduce((s, b) => s + b.qty, 0);
          const historyEntry = {
            batch: payload.batch,
            date: new Date().toLocaleDateString("en-US", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
            qty: payload.qty,
            requestor: payload.reason,
            staff: "Staff",
          };
          return {
            ...it,
            batches: newBatches,
            dispensingHistory: [historyEntry, ...it.dispensingHistory],
            qty: total,
            status: derivedStatus(total, it.threshold, it.status),
          };
        })
      );
    },
    []
  );

  // Error retry — focus moves to banner per spec §5
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    // Simulate retry: reload mock data after delay
    setTimeout(() => {
      setItems(mockInventory);
      setLoading(false);
      toast.success("Inventory refreshed");
    }, 600);
  }, []);

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
  const showErrorBanner = !loading && error !== null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Error banner — spec §5: inline banner + retry, focus moves to banner */}
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
          <span className="flex-1 text-destructive">{error}</span>
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
        {isWide ? (
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
                  onRowRect={setOriginRect}
                  onSelect={handleSelect}
                  onSort={setSort}
                  selectedId={selectedId}
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
                    onStockIn={handleStockInFromDetail}
                    onStockOut={handleStockOutFromDetail}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
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
                onRowRect={setOriginRect}
                onSelect={handleSelect}
                onSort={setSort}
                selectedId={selectedId}
                sortDir={filters.sortDir}
                sortKey={filters.sortKey}
                totalUnfiltered={items.length}
              />
            </div>
          </div>
        )}
      </div>

      {/* Detail sheet for narrow */}
      <InventoryDetailSheet
        item={selectedItem}
        onOpenChange={setSheetOpen}
        onStockIn={handleStockInFromSheet}
        onStockOut={handleStockOutFromSheet}
        open={sheetOpen && !isWide}
        originRect={originRect}
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
