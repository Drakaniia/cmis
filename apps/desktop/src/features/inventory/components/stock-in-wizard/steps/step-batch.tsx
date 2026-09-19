import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { todayIso } from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { type ChangeEvent, useCallback } from "react";

import { FIELD_CLASS } from "../constants";
import { ValidationMessage } from "./validation-message";

export function StepBatch({
  batchNo,
  expiry,
  qty,
  notes,
  showErrors,
  duplicateBatch,
  onBatchChange,
  onExpiryChange,
  onQtyChange,
  onNotesChange,
}: {
  batchNo: string;
  expiry: string;
  qty: string;
  notes: string;
  showErrors: boolean;
  duplicateBatch: boolean;
  onBatchChange: (value: string) => void;
  onExpiryChange: (value: string) => void;
  onQtyChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  const batchMissing = showErrors && batchNo.trim().length === 0;
  const qtyInvalid = showErrors && (!qty || Number(qty) < 1);
  const expiryInPast =
    showErrors &&
    Boolean(expiry) &&
    new Date(expiry) <= new Date(new Date().setHours(0, 0, 0, 0));

  const handleBatchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onBatchChange(event.target.value),
    [onBatchChange]
  );
  const handleQtyStep = useCallback(
    (next: number | "") => onQtyChange(next === "" ? "" : String(next)),
    [onQtyChange]
  );
  const handleNotesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onNotesChange(event.target.value),
    [onNotesChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 3 — Batch Info
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="block font-medium text-caption text-foreground">
          Batch / Lot
          <input
            className={cn(FIELD_CLASS, batchMissing && "border-destructive")}
            onChange={handleBatchChange}
            placeholder="B-2026-04"
            value={batchNo}
          />
          {duplicateBatch ? (
            <span className="mt-1 block text-[var(--warning)] text-caption">
              Warning: duplicate batch # (not blocked).
            </span>
          ) : null}
        </label>
        <label className="block font-medium text-caption text-foreground">
          Expiry date
          <AppleDatePicker
            className="mt-1 h-9"
            min={todayIso()}
            onChange={onExpiryChange}
            placeholder="Select expiry date"
            value={expiry}
          />
          {expiryInPast ? (
            <ValidationMessage message="Expiry must be future." />
          ) : null}
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <label className="block font-medium text-caption text-foreground">
          Quantity
          <QuantityStepper
            aria-label="Quantity"
            className="mt-1 h-9"
            invalid={qtyInvalid}
            min={1}
            onChange={handleQtyStep}
            placeholder="0"
            value={qty}
          />
        </label>
      </div>
      <label className="block font-medium text-caption text-foreground">
        Notes (optional)
        <textarea
          className="mt-1 min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          onChange={handleNotesChange}
          placeholder="Delivery notes…"
          value={notes}
        />
      </label>
    </div>
  );
}
