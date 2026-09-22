import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { cn } from "@cmis/ui/lib/utils";
import { type ChangeEvent, useCallback } from "react";

import { FIELD_CLASS } from "../constants";
import type { QuantityUnitControl } from "../types";

/**
 * One option of the quantity cell's unit toggle (F4/D12), styled like the other
 * segmented pills in the app. Its own component so the option's handler is
 * stable and the step below stays a layout, not a handler list.
 */
function UnitOption({
  active,
  disabled,
  label,
  onSelect,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
  title?: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "rounded-full px-2.5 py-1 font-medium text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
      )}
      disabled={disabled}
      onClick={onSelect}
      title={title}
      type="button"
    >
      {label}
    </button>
  );
}

export function StepBatch({
  batchNo,
  expiry,
  qty,
  notes,
  showErrors,
  duplicateBatch,
  quantityUnit,
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
  quantityUnit: QuantityUnitControl;
  onBatchChange: (value: string) => void;
  onExpiryChange: (value: string) => void;
  onQtyChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  // Soft warnings: batch/qty only after attempted Next (don't show on pristine empty),
  // expiry warns immediately when a past date is picked (not when empty pristine)
  const batchMissing = showErrors && batchNo.trim().length === 0;
  const qtyInvalid = showErrors && (!qty || Number(qty) < 1);
  const expiryInPast =
    Boolean(expiry) &&
    new Date(expiry) <= new Date(new Date().setHours(0, 0, 0, 0));

  const {
    baseUnit,
    conversionLabel,
    packUnit,
    packUnitAvailable,
    selected,
    onSelect,
  } = quantityUnit;

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
  const selectBase = useCallback(() => onSelect("base"), [onSelect]);
  const selectPack = useCallback(() => onSelect("pack"), [onSelect]);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 3 — Batch Info
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="block font-medium text-caption text-foreground">
          Batch / Lot
          <input
            className={cn(
              FIELD_CLASS,
              batchMissing && "border-[var(--warning)]/50"
            )}
            onChange={handleBatchChange}
            placeholder="B-2026-04"
            value={batchNo}
          />
          {batchMissing ? (
            <span className="mt-1 block text-[var(--warning)] text-caption">
              Warning: empty batch will be auto-generated (not blocked).
            </span>
          ) : null}
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
            onChange={onExpiryChange}
            placeholder="Select expiry date"
            value={expiry}
          />
          {expiryInPast ? (
            <span className="mt-1 block text-[var(--warning)] text-caption">
              Warning: expiry is in the past (not blocked).
            </span>
          ) : null}
        </label>
      </div>
      <div className="space-y-2">
        <label className="block font-medium text-caption text-foreground">
          Quantity
          <QuantityStepper
            aria-label="Quantity"
            className={cn(
              "mt-1 h-9",
              qtyInvalid && "border-[var(--warning)]/50"
            )}
            invalid={false}
            min={1}
            onChange={handleQtyStep}
            placeholder="0"
            value={qty}
          />
          {qtyInvalid ? (
            <span className="mt-1 block text-[var(--warning)] text-caption">
              Warning: quantity must be 1 or more — please correct before
              confirming.
            </span>
          ) : null}
        </label>
        {/* F4/D12 — a delivery may be written in packs, so the unit is chosen
            here and the conversion is shown before anything is stored. What the
            draft carries is always the base-unit number. */}
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-card p-0.5">
            <legend className="sr-only">Quantity unit</legend>
            <UnitOption
              active={selected === "base"}
              label={baseUnit}
              onSelect={selectBase}
            />
            <UnitOption
              active={selected === "pack"}
              disabled={!packUnitAvailable}
              label={packUnit || "pack"}
              onSelect={selectPack}
              title={
                packUnitAvailable
                  ? undefined
                  : "No pack size recorded on this item."
              }
            />
          </fieldset>
          {conversionLabel ? (
            <p className="font-medium text-caption text-foreground">
              = {conversionLabel}
            </p>
          ) : null}
        </div>
        {packUnitAvailable ? null : (
          <p className="text-caption text-muted-foreground">
            No pack size recorded — this delivery is counted in {baseUnit}.
          </p>
        )}
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
