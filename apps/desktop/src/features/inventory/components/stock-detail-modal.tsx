import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";
import { classifyExpiry, daysUntilExpiry } from "../domain/expiry";
import type { ExpiryRow, InventoryBatch, InventoryItem } from "../types";
import { InventoryDetailContent } from "./inventory-detail";
import { ItemEditPanel } from "./item-edit-panel";
import { ItemHistoryPanel } from "./item-history-panel";
import { StockDetailBatchBand } from "./stock-detail-batch-band";

export type StockDetailView = "detail" | "edit" | "history";

const VIEW_TITLE: Record<StockDetailView, string> = {
  detail: "Item details",
  edit: "Edit item",
  history: "Dispensing history",
};

/**
 * A page-scoped action, only rendered when the page that opened the modal can
 * actually perform it. `tone` follows the §9 hierarchy: destructive work stays
 * quiet until hovered, contextual work sits between ghost and primary.
 */
interface ContextualAction {
  label: string;
  onSelect: () => void;
  tone: "ghost" | "secondary";
}

function ContextualBar({ actions }: { actions: ContextualAction[] }) {
  if (actions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((action) => (
        <Button
          className={cn(
            "press-feedback",
            action.tone === "ghost" &&
              "text-destructive hover:bg-destructive/10"
          )}
          key={action.label}
          onClick={action.onSelect}
          size="sm"
          variant={action.tone}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Stock detail modal (spec §7) — one detail surface for Expiry Alerts,
 * Low-Stock Alerts and Stock Management.
 *
 * The body is `InventoryDetailContent`, unchanged: same header, same batches
 * list, same action bar. The modal adds only what is page-scoped — the batch
 * band on Expiry Alerts and the contextual actions the page can honour.
 *
 * Apple Design §12 — a centered frosted panel with a dimming scrim, so the
 * alert table recedes while the detail is read. §7 — the panel materializes
 * from the centre on the same path it leaves by. §1/§4 — springs, so a click
 * that is immediately reversed never fights a fixed-duration transition.
 * §14 — reduced motion swaps the materialize for a plain cross-fade.
 */
export function StockDetailModal({
  open,
  onOpenChange,
  item,
  batch = null,
  originRect: _originRect,
  onDispose,
  onExtend,
  onReorder,
  onAdjustThreshold,
  onStockIn,
  onStockOut,
  onItemUpdated,
  /**
   * The whole inventory, for the Edit form's SKU-uniqueness check. Optional so
   * a caller that only wants the detail view need not read it; without it the
   * check degrades to the item being edited.
   */
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  /** Expiry Alerts passes the clicked row's batch; Low-Stock passes nothing. */
  batch?: InventoryBatch | null;
  originRect?: DOMRect | null;
  onDispose?: () => void;
  onExtend?: () => void;
  onReorder?: () => void;
  onAdjustThreshold?: () => void;
  onStockIn: () => void;
  onStockOut: () => void;
  /** Fired after a successful Edit save so the page can refresh. */
  onItemUpdated?: () => void;
  items?: InventoryItem[];
}) {
  const [view, setView] = useState<StockDetailView>("detail");
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  // Every open starts on the detail view, and closing clears it — otherwise
  // reopening a row lands the operator in a half-finished form.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reset is keyed on the identity of what is being shown, not on the state it sets
  useEffect(() => {
    setView("detail");
  }, [open, item?.id]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  /** Edit's Cancel/Save both land back on the detail view (§8.3). */
  const handleBackToDetail = useCallback(() => setView("detail"), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // §6.4 — focus moves into the panel on open so Escape and Tab start from
  // here, and hands itself back on close: a keyboard operator who opened this
  // from a row must land on that row again, not on `<body>`.
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement;
    returnFocusRef.current = previous instanceof HTMLElement ? previous : null;
    panelRef.current?.focus();
    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      // A row that has since been filtered out is detached — focusing it would
      // silently do nothing, so there is nothing to guard against beyond the
      // element still being in the document.
      if (target && document.contains(target)) {
        target.focus();
      }
    };
  }, [open]);

  // The band speaks ExpiryRow, but the modal's public prop is the batch the row
  // was built from. Rebuilding the row here keeps the guard in one place.
  const bandRow = useMemo<ExpiryRow | null>(() => {
    if (!(batch && item)) {
      return null;
    }
    const parsed = batch.expiry ? daysUntilExpiry(batch.expiry) : Number.NaN;
    return {
      batch,
      daysUntil: parsed,
      expiryStatus: Number.isNaN(parsed) ? "safe" : classifyExpiry(parsed),
      item,
    };
  }, [batch, item]);

  const actions = useMemo<ContextualAction[]>(() => {
    const list: ContextualAction[] = [];
    if (onDispose) {
      list.push({ label: "Dispose", onSelect: onDispose, tone: "ghost" });
    }
    if (onExtend) {
      list.push({ label: "Extend expiry", onSelect: onExtend, tone: "ghost" });
    }
    if (onReorder) {
      list.push({ label: "Reorder", onSelect: onReorder, tone: "secondary" });
    }
    if (onAdjustThreshold) {
      list.push({
        label: "Adjust threshold",
        onSelect: onAdjustThreshold,
        tone: "secondary",
      });
    }
    return list;
  }, [onAdjustThreshold, onDispose, onExtend, onReorder]);

  const label = item
    ? `${item.displayName}${batch ? ` — batch ${batch.batch}` : ""}`
    : "Item details";

  return (
    <AnimatePresence>
      {open && item ? (
        <>
          {/* §12 Scrim — dim to focus, click to dismiss */}
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-40 bg-black/32 backdrop-blur-[2px]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            onClick={handleClose}
          >
            <motion.div
              animate="animate"
              aria-label={label}
              aria-modal="true"
              className={cn(
                /* §12 Glass material — the same weight as the other modals */
                "flex max-h-[86vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl",
                "border border-border/40 bg-card/80 shadow-xl backdrop-blur-2xl"
              )}
              exit="exit"
              initial="initial"
              onClick={(event) => event.stopPropagation()}
              ref={panelRef}
              role="dialog"
              style={{
                transformOrigin: "center center",
                willChange: reduceMotion
                  ? undefined
                  : "transform, opacity, filter",
              }}
              tabIndex={-1}
              transition={reduceMotion ? { duration: 0 } : sheetSpring}
              variants={variants}
            >
              {/* §15 — tight tracking on the view title */}
              <div className="flex shrink-0 items-start justify-between gap-2 border-border/30 border-b px-4 py-3">
                <h2
                  className="font-semibold text-foreground text-sm"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {VIEW_TITLE[view]}
                </h2>
                <div className="flex items-center gap-1.5">
                  <ContextualBar actions={actions} />
                  <Button
                    aria-label="Close"
                    className="press-feedback shrink-0"
                    onClick={handleClose}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>

              {view === "detail" && bandRow ? (
                <StockDetailBatchBand row={bandRow} />
              ) : null}

              {/* The shared detail surface owns its own scrolling and its own
               * action bar, so it takes the remaining height rather than being
               * wrapped in a second scroll container. */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {view === "edit" && item ? (
                  <ItemEditPanel
                    item={item}
                    items={items ?? [item]}
                    onCancel={handleBackToDetail}
                    onSaved={() => {
                      onItemUpdated?.();
                      handleBackToDetail();
                    }}
                  />
                ) : view === "history" && item ? (
                  /* §11 — the real history, replacing the reused panel's empty
                   * "last 10" section while this view is open. */
                  <div className="h-full overflow-auto">
                    <ItemHistoryPanel item={item} />
                  </div>
                ) : (
                  <InventoryDetailContent
                    item={item}
                    onEdit={() => setView("edit")}
                    onHistory={() => setView("history")}
                    onStockIn={onStockIn}
                    onStockOut={onStockOut}
                  />
                )}
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
