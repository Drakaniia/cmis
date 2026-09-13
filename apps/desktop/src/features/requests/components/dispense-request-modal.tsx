import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { AlertTriangle, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { expiryLabel } from "@/features/inventory/mock";
import { materializeEnter, sheetSpring } from "@/lib/motion";
import type { DispensePayload } from "../hooks/use-request-board";
import type { BatchOption } from "../stock";
import { batchOptionsFor, hasInventoryItem, onHandFor } from "../stock";
import type { RequestItem } from "../types";

function StockWarnings({
  hasInventoryItem,
  medicine,
  outOfStock,
  qty,
  stock,
  unit,
}: {
  hasInventoryItem: boolean;
  medicine: string;
  outOfStock: boolean;
  qty: number;
  stock: number;
  unit: string;
}) {
  if (!hasInventoryItem) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="font-medium text-destructive text-sm">
          No matching inventory item
        </p>
        <p className="text-caption text-muted-foreground">
          Cannot verify stock for “{medicine}”.
        </p>
      </div>
    );
  }

  if (!outOfStock) {
    return null;
  }

  return (
    <div
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
      role="alert"
    >
      <AlertTriangle
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <div>
        <p className="font-medium text-destructive text-sm">
          Insufficient stock
        </p>
        <p className="text-caption text-muted-foreground">
          {medicine}: requested {qty} {unit}, available {stock}. Stock in or
          deny the request instead.
        </p>
      </div>
    </div>
  );
}

function BatchOptionRow({
  isSelected,
  onSelect,
  option,
  qty,
}: {
  isSelected: boolean;
  onSelect: (batch: string) => void;
  option: BatchOption;
  qty: number;
}) {
  const tooSmall = option.qty < qty;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 transition-colors",
        isSelected ? "border-ring bg-accent" : "border-border/60 hover:bg-muted"
      )}
    >
      <input
        checked={isSelected}
        name="fefo-batch"
        onChange={() => onSelect(option.batch)}
        type="radio"
        value={option.batch}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-xs">
          {option.batch}
        </span>
        <span className="block text-caption text-muted-foreground">
          exp {expiryLabel(option.expiry)} · {option.qty} available
          {tooSmall ? " · short for this request" : ""}
        </span>
      </span>
    </label>
  );
}

function BatchPicker({
  onSelect,
  options,
  qty,
  selectedBatch,
  selectedQty,
  tooSmall,
  unit,
}: {
  onSelect: (batch: string) => void;
  options: BatchOption[];
  qty: number;
  selectedBatch: string | null;
  selectedQty: number | null;
  tooSmall: boolean;
  unit: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="font-medium text-caption text-foreground">
        Batch — earliest expiry first (FEFO)
      </legend>
      {options.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-caption text-muted-foreground">
          No dispensable batch — none on hand, or all expired.
        </p>
      ) : (
        options.map((option) => (
          <BatchOptionRow
            isSelected={option.batch === selectedBatch}
            key={option.batch}
            onSelect={onSelect}
            option={option}
            qty={qty}
          />
        ))
      )}
      {tooSmall ? (
        <p className="text-caption text-destructive">
          Selected batch has {selectedQty} {unit} — choose a batch with at least{" "}
          {qty}.
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * CMIS-UI-05 §7 — Dispense: verify stock, pick a FEFO batch (earliest expiry
 * first), then commit. Expired batches are never selectable — dispensing
 * expired medicine is the harm this screen must not enable (Apple §16
 * Responsibility), so the guard is structural, not a warning.
 */
export function DispenseRequestModal({
  onConfirm,
  onOpenChange,
  open,
  originRect,
  request,
}: {
  onConfirm: (payload: DispensePayload) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originRect: DOMRect | null;
  request: RequestItem | null;
}) {
  const reduceMotion = useReducedMotion();

  const medicine = request?.medicine ?? "";
  const known = hasInventoryItem(medicine);
  /** FEFO order, expired batches excluded — shared with the batch toolbar. */
  const options: BatchOption[] = React.useMemo(
    () => batchOptionsFor(medicine),
    [medicine]
  );

  const [selectedBatch, setSelectedBatch] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!(open && request)) {
      return;
    }
    // Prefer the earliest-expiring batch that can cover the request outright.
    const covering = options.find((option) => option.qty >= request.qty);
    setSelectedBatch((covering ?? options[0])?.batch ?? null);
  }, [open, request, options]);

  React.useEffect(() => {
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

  if (!request) {
    return null;
  }

  const stock = onHandFor(medicine);
  const selected =
    options.find((option) => option.batch === selectedBatch) ?? null;
  const outOfStock = stock < request.qty;
  const batchTooSmall = !!selected && selected.qty < request.qty;
  const canConfirm = !(outOfStock || batchTooSmall || !selected);

  function handleConfirm() {
    if (!(canConfirm && selected)) {
      return;
    }
    onConfirm({
      batch: selected.batch,
      expiry: selected.expiry,
      qty: request?.qty ?? 0,
    });
    onOpenChange(false);
  }

  const transformOrigin = "center center";

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-[60] bg-black/32"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            transition={{ duration: 0.18 }}
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
            <motion.div
              animate="animate"
              aria-label={`Dispense ${request.medicine}`}
              aria-modal="true"
              className="surface-frosted flex max-h-[86vh] w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              role="dialog"
              style={{
                transformOrigin,
                willChange: "transform, opacity, filter",
              }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-4 py-3">
                <h2 className="font-semibold text-foreground text-sm">
                  Dispense to {request.requestor.name}
                </h2>
                <Button
                  aria-label="Close"
                  className="press-feedback"
                  onClick={() => onOpenChange(false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                <div className="rounded-md border border-border/60 bg-card p-3">
                  <p className="font-medium text-sm">{request.medicine}</p>
                  <p className="text-caption text-muted-foreground">
                    {stock} in stock, dispensing {request.qty} {request.unit}
                  </p>
                </div>

                <StockWarnings
                  hasInventoryItem={known}
                  medicine={request.medicine}
                  outOfStock={outOfStock}
                  qty={request.qty}
                  stock={stock}
                  unit={request.unit}
                />

                {known ? (
                  <BatchPicker
                    onSelect={setSelectedBatch}
                    options={options}
                    qty={request.qty}
                    selectedBatch={selectedBatch}
                    selectedQty={selected?.qty ?? null}
                    tooSmall={batchTooSmall}
                    unit={request.unit}
                  />
                ) : null}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-border/50 border-t px-4 py-3">
                <Button
                  className="press-feedback"
                  onClick={() => onOpenChange(false)}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  className="press-feedback"
                  disabled={!canConfirm}
                  onClick={handleConfirm}
                  size="sm"
                >
                  Confirm dispensing
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
