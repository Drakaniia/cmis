import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { Button } from "@cmis/ui/components/button";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { cn } from "@cmis/ui/lib/utils";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  materializeEnter,
  materializeEnterReduced,
  sheetSpring,
} from "@/lib/motion";
import { expiryLabel } from "../domain/expiry";
import { useUpdateBatchMutation } from "../hooks/use-update-batch";
import type { InventoryBatch, InventoryItem } from "../types";

/**
 * Edit batch — corrects the details of a lot that has already been stocked in.
 *
 * A delivery is often entered before the paperwork is read, so the lot number,
 * expiry, count or supplier can be wrong. Deleting and re-adding the batch
 * would lose its place in history and in Trash, so this edits the row in place
 * (`useUpdateBatchMutation`) and lets the product's qty follow the delta.
 *
 * The four fields are the batch's whole identity. `Batch / Lot` and `Qty` are
 * required — an unnamed lot or a negative count cannot be stored — while the
 * expiry may be left blank (a lot nobody dated) and the supplier is optional.
 *
 * Apple Design §12 — the same frosted, centered panel as the other modals;
 * §7/§1/§4 — the materialize spring, cancelled by reduced motion (§14).
 */

/** An empty or unparseable date is carried as `""`, never as a bad ISO string. */
function isUsableExpiry(iso: string): boolean {
  if (iso.trim() === "") {
    return true;
  }
  return !Number.isNaN(new Date(iso).getTime());
}

interface FieldProps {
  attempted: boolean;
  expiry: string;
  expiryInvalid: boolean;
  name: string;
  nameMissing: boolean;
  onExpiryChange: (iso: string) => void;
  onNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onQtyChange: (next: number | "") => void;
  onSupplierChange: (event: ChangeEvent<HTMLInputElement>) => void;
  qty: number | "";
  qtyInvalid: boolean;
  supplier: string;
}

/**
 * The four editable fields, split out of the modal so the modal's own control
 * flow stays a shell (open, close, save) rather than a wall of conditions.
 */
function BatchEditFields({
  attempted,
  expiry,
  expiryInvalid,
  name,
  nameMissing,
  onExpiryChange,
  onNameChange,
  onQtyChange,
  onSupplierChange,
  qty,
  qtyInvalid,
  supplier,
}: FieldProps) {
  return (
    <div className="space-y-3 p-4">
      <label className="block font-medium text-caption text-foreground">
        Batch / Lot
        <input
          className={cn(
            "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
            attempted && nameMissing && "border-destructive"
          )}
          onChange={onNameChange}
          placeholder="B-2026-04"
          value={name}
        />
        {attempted && nameMissing ? (
          <span className="mt-1 block text-destructive">
            Batch name is required.
          </span>
        ) : null}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block font-medium text-caption text-foreground">
          Expiry date
          <AppleDatePicker
            className="mt-1 h-9"
            onChange={onExpiryChange}
            placeholder="No date"
            value={expiry}
          />
          {attempted && expiryInvalid ? (
            <span className="mt-1 block text-destructive">
              Expiry date is not valid.
            </span>
          ) : null}
        </label>

        <label className="block font-medium text-caption text-foreground">
          Quantity
          <QuantityStepper
            aria-label="Batch quantity"
            className={cn("mt-1 h-9", qtyInvalid && "border-destructive")}
            invalid={qtyInvalid}
            min={0}
            onChange={onQtyChange}
            placeholder="0"
            value={qty}
          />
          {attempted && qtyInvalid ? (
            <span className="mt-1 block text-destructive">
              Quantity must be 0 or more.
            </span>
          ) : null}
        </label>
      </div>

      <label className="block font-medium text-caption text-foreground">
        Supplier (optional)
        <input
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          onChange={onSupplierChange}
          placeholder="Supplier"
          value={supplier}
        />
      </label>
    </div>
  );
}

export function BatchEditModal({
  open,
  onOpenChange,
  item,
  batch,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InventoryItem;
  batch: InventoryBatch | null;
  onSaved?: () => void;
}) {
  const updateBatch = useUpdateBatchMutation();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState<number | "">("");
  const [supplier, setSupplier] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reduceMotion = useReducedMotion();
  const variants = reduceMotion ? materializeEnterReduced : materializeEnter;

  // Every open starts from the stored row, so a cancelled edit never leaks into
  // the next one.
  useEffect(() => {
    if (open && batch) {
      setName(batch.batch);
      setExpiry(batch.expiry);
      setQty(batch.qty);
      setSupplier(batch.supplier);
      setAttempted(false);
    }
  }, [open, batch]);

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

  const nameMissing = name.trim() === "";
  const qtyInvalid = qty === "" || !Number.isInteger(qty) || qty < 0;
  const expiryInvalid = !isUsableExpiry(expiry);
  const valid = !(nameMissing || qtyInvalid || expiryInvalid);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handleQtyChange = useCallback((next: number | "") => setQty(next), []);
  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    []
  );
  const handleSupplierChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setSupplier(event.target.value),
    []
  );

  const handleSave = useCallback(() => {
    setAttempted(true);
    if (!(valid && batch)) {
      return;
    }
    const safeQty = typeof qty === "number" ? qty : 0;
    updateBatch.mutate(
      {
        batch: batch.batch,
        expiry: expiry.trim(),
        itemId: item.id,
        nextBatch: name.trim(),
        qty: safeQty,
        supplier: supplier.trim(),
      },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
          toast.success(`Batch ${name.trim()} updated`);
          onOpenChange(false);
          onSaved?.();
        },
      }
    );
  }, [
    batch,
    expiry,
    item.id,
    name,
    onOpenChange,
    onSaved,
    qty,
    supplier,
    updateBatch,
    valid,
  ]);

  if (!(open && batch)) {
    return null;
  }

  return (
    <>
      <motion.div
        animate={{ opacity: 1 }}
        aria-hidden
        className="fixed inset-0 z-50 bg-black/32 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        onClick={handleClose}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <motion.div
          animate="animate"
          aria-label={`Edit batch ${batch.batch}`}
          aria-modal="true"
          className={cn(
            "pointer-events-auto flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl",
            /* §12 Glass material */
            "border border-border/40 bg-card/80 shadow-xl backdrop-blur-2xl"
          )}
          initial="initial"
          role="dialog"
          style={{
            transformOrigin: "center center",
            willChange: reduceMotion ? undefined : "transform, opacity, filter",
          }}
          transition={reduceMotion ? { duration: 0 } : sheetSpring}
          variants={variants}
        >
          {/* §12 Header — frosted bar */}
          <div className="flex items-center justify-between border-border/30 border-b px-4 py-3">
            <h2
              className="font-semibold text-foreground text-sm"
              style={{ letterSpacing: "-0.01em" }}
            >
              Edit batch
            </h2>
            <Button
              aria-label="Close"
              className="press-feedback"
              onClick={handleClose}
              size="icon-sm"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="rounded-b-none border-border/60 border-b bg-muted/30 px-4 py-2.5 text-sm">
            <p className="font-medium">{item.displayName}</p>
            <p className="text-caption text-muted-foreground">
              Editing batch {batch.batch}
              {batch.expiry ? ` · ${expiryLabel(batch.expiry)}` : ""}
            </p>
          </div>

          <BatchEditFields
            attempted={attempted}
            expiry={expiry}
            expiryInvalid={expiryInvalid}
            name={name}
            nameMissing={nameMissing}
            onExpiryChange={setExpiry}
            onNameChange={handleNameChange}
            onQtyChange={handleQtyChange}
            onSupplierChange={handleSupplierChange}
            qty={qty}
            qtyInvalid={qtyInvalid}
            supplier={supplier}
          />

          {/* §8 Footer — Cancel (ghost, tertiary), Save (confirm, primary) */}
          <div className="flex items-center justify-end gap-2 border-border/30 border-t px-4 py-3">
            <Button
              className="press-feedback"
              onClick={handleClose}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              className="press-feedback"
              disabled={updateBatch.isPending}
              onClick={handleSave}
              size="sm"
              variant="confirm"
            >
              {updateBatch.isPending ? "Saving…" : "Save batch"}
            </Button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
