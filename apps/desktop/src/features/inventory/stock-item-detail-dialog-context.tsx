import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { StockDetailModal } from "./components/stock-detail-modal";
import { useInventoryItems } from "./hooks/use-inventory-items";
import { ITEM_GONE } from "./stock-detail-search";

/**
 * F5 — the palette opens the *real* stock detail in place, over whatever screen
 * the operator is on, so the host is mounted once at the app root beside the
 * other app-wide dialogs (D22) rather than owned by a route or nested inside the
 * palette.
 *
 * It mirrors `QuickDeductDialogProvider`: one modal, one context entry point, the
 * same no-op fallback outside the provider.
 *
 * The surface is read-only plus Edit (D9): Detail, History and the Edit panel,
 * no Stock in / Stock out, no contextual actions — so nothing here passes a
 * stock-movement handler and the modal renders no movement button.
 */
interface StockItemDetailDialogValue {
  openStockItem: (itemId: string) => void;
}

const NOOP: StockItemDetailDialogValue = { openStockItem: () => undefined };

const StockItemDetailDialogContext =
  createContext<StockItemDetailDialogValue | null>(null);

interface DialogState {
  itemId: string | null;
  open: boolean;
}

export function StockItemDetailDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<DialogState>({
    itemId: null,
    open: false,
  });
  const queryClient = useQueryClient();
  // The palette opened this from the shared cache, so the query is enabled here
  // only while the dialog is live (F4/D13) — no fetch of its own.
  const { data: items } = useInventoryItems({ enabled: state.open });

  const openStockItem = useCallback(
    (itemId: string) => setState({ itemId, open: true }),
    []
  );

  const handleOpenChange = useCallback(
    (open: boolean) => setState((prev) => ({ ...prev, open })),
    []
  );

  // Resolved at render from the live rows, so a rename between choosing the row
  // and the modal appearing shows the fresh record, not a snapshot.
  const item = useMemo(() => {
    if (!state.itemId) {
      return null;
    }
    return items?.find((entry) => entry.id === state.itemId) ?? null;
  }, [items, state.itemId]);

  // D20 — an item deleted between the palette loading and the row being chosen
  // must not open a partial modal. Wait for the rows to load first, or every
  // open would look stale for a frame.
  useEffect(() => {
    if (!(state.open && state.itemId) || items === undefined) {
      return;
    }
    if (!items.some((entry) => entry.id === state.itemId)) {
      toast.error(ITEM_GONE);
      setState((prev) => ({ ...prev, open: false }));
    }
  }, [items, state.itemId, state.open]);

  const handleItemUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
    queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] });
  }, [queryClient]);

  const value = useMemo<StockItemDetailDialogValue>(
    () => ({ openStockItem }),
    [openStockItem]
  );

  return (
    <StockItemDetailDialogContext.Provider value={value}>
      {children}
      <StockDetailModal
        item={item}
        items={items ?? []}
        onItemUpdated={handleItemUpdated}
        onOpenChange={handleOpenChange}
        open={state.open && item !== null}
      />
    </StockItemDetailDialogContext.Provider>
  );
}

/** Falls back to a no-op outside the provider, so isolated renders still work. */
export function useStockItemDetailDialog(): StockItemDetailDialogValue {
  return useContext(StockItemDetailDialogContext) ?? NOOP;
}
