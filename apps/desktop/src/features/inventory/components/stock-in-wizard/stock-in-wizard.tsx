import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  baseUnitFor,
  describeQuantity,
  hasPack,
  toBaseUnits,
} from "../../domain/pack-size";
import type { InventoryItem } from "../../types";
import { WizardShell } from "../wizard-shell";
import { EMPTY_DETAILS } from "./constants";
import { StepBatch } from "./steps/step-batch";
import { StepDetails } from "./steps/step-details";
import { StepIdentify } from "./steps/step-identify";
import { StepReview } from "./steps/step-review";
import type {
  InventoryCategory,
  QuantityUnit,
  QuantityUnitControl,
  StockInDraft,
  StockInWizardProps,
} from "./types";
import {
  allStepsValid,
  detailsFromItem,
  packErrors,
  validateStep,
} from "./validation";

/**
 * A lot code for a delivery nobody labelled. Module level because it is a pure
 * function of the clock and nothing in the component — a copy rebuilt on every
 * render cannot be a hook dependency.
 */
function autoBatchCode(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AUTO-${y}${m}${d}-${rnd}`;
}

export function StockInWizard({
  open,
  onOpenChange,
  items,
  initialItemId,
  originRect,
  onConfirm,
}: StockInWizardProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Step 1: identify
  const [identifier, setIdentifier] = useState("");
  const [foundItem, setFoundItem] = useState<InventoryItem | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Step 2: item details. The four strength fields are prefilled from an
  // existing item on lookup and never block Next (decision 7). The pack pair is
  // the structured multiple (F3/D4); `packSize` stays the rendered text.
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("");
  const [strengthValue, setStrengthValue] = useState("");
  const [strengthUnit, setStrengthUnit] = useState("");
  const [form, setForm] = useState("");
  const [packQty, setPackQty] = useState<number | "">("");
  const [packUnit, setPackUnit] = useState("");
  const [packSize, setPackSize] = useState("");

  // Step 3: batch. `qty` is **as typed**, in whichever unit is selected; the
  // draft converts it to base units before anything leaves this component (F4).
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [qtyUnit, setQtyUnit] = useState<QuantityUnit>("base");
  const [notes, setNotes] = useState("");

  const [attemptedNext, setAttemptedNext] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) {
      setStep(1);
      setDirection(1);
      setAttemptedNext(false);
      const found = initialItemId
        ? (items.find((i) => i.id === initialItemId) ?? null)
        : null;
      setFoundItem(found);
      setIsNew(false);
      setIdentifier(found ? found.sku : "");
      const details = found ? detailsFromItem(found) : EMPTY_DETAILS;
      setCategory(details.category);
      setForm(details.form);
      setName(details.name);
      setPackQty(details.packQty);
      setPackSize(details.packSize);
      setPackUnit(details.packUnit);
      setStrengthUnit(details.strengthUnit);
      setStrengthValue(details.strengthValue);
      setBatch("");
      setExpiry("");
      setQty("");
      setQtyUnit("base");
      setNotes("");
    }
  }, [open, initialItemId, items]);

  const packItem = useMemo(
    () => ({ form: form.trim(), packQty, packUnit: packUnit.trim() }),
    [form, packQty, packUnit]
  );
  const packAvailable = hasPack(packItem);
  const baseUnit = baseUnitFor(packItem);
  // The pack option only exists when the pair is usable, so a stale selection
  // (the operator went back and cleared the pack) silently falls back to base
  // units rather than converting against a multiple that is gone (F4).
  const selectedUnit: QuantityUnit = packAvailable ? qtyUnit : "base";
  const typedQty = qty === "" ? 0 : Number(qty);
  const unitToken = selectedUnit === "pack" ? packItem.packUnit : baseUnit;
  const baseQty = toBaseUnits(typedQty, unitToken, packItem) ?? 0;
  const conversionLabel =
    selectedUnit === "pack" && typedQty > 0 ? `${baseQty} ${baseUnit}` : null;

  const quantityUnit = useMemo<QuantityUnitControl>(
    () => ({
      baseUnit,
      conversionLabel,
      onSelect: setQtyUnit,
      packUnit: packItem.packUnit,
      packUnitAvailable: packAvailable,
      selected: selectedUnit,
    }),
    [baseUnit, conversionLabel, packAvailable, packItem.packUnit, selectedUnit]
  );

  const draft = useMemo<StockInDraft>(
    () => ({
      batch: batch.trim(),
      category,
      expiry,
      form: packItem.form,
      identifier,
      isNew,
      itemId: foundItem?.id ?? null,
      name: name.trim(),
      notes: notes.trim(),
      packQty,
      packSize: packSize.trim(),
      packUnit: packItem.packUnit,
      // Always base units: the batch, the item total and the audit entry all
      // read one number, in the unit the shelf counts in (D12, F4).
      qty: baseQty,
      strengthUnit,
      strengthValue: strengthValue.trim(),
      supplier: null,
    }),
    [
      baseQty,
      batch,
      category,
      expiry,
      foundItem,
      identifier,
      isNew,
      name,
      notes,
      packItem,
      packQty,
      packSize,
      strengthUnit,
      strengthValue,
    ]
  );

  const duplicateBatch = useMemo(() => {
    if (!(foundItem && batch)) {
      return false;
    }
    return foundItem.batches.some(
      (b) => b.batch.toLowerCase() === batch.trim().toLowerCase()
    );
  }, [foundItem, batch]);

  const goNext = useCallback(
    (force = false) => {
      // Step 3 is soft: batch/expiry/qty warnings never hard-block Next
      if (step === 3 && !force) {
        setAttemptedNext(false);
        setDirection(1);
        setStep((s) => s + 1);
        return;
      }
      const valid = validateStep(step, draft);
      if (!(valid || force)) {
        setAttemptedNext(true);
        return;
      }
      setAttemptedNext(false);
      if (step < 4) {
        setDirection(1);
        setStep((s) => s + 1);
        return;
      }
      // Final confirm — hard qty check, soft batch/expiry
      if (!Number.isFinite(draft.qty) || draft.qty < 1) {
        toast.error("Quantity must be 1 or more.");
        setAttemptedNext(true);
        return;
      }
      const finalDraft: StockInDraft = draft.batch.trim()
        ? draft
        : { ...draft, batch: autoBatchCode() };
      onConfirm(finalDraft);
      toast.success(
        `Logged: ${name || identifier} +${describeQuantity(finalDraft.qty, packItem)}`
      );
      onOpenChange(false);
    },
    [draft, identifier, name, onConfirm, onOpenChange, packItem, step]
  );

  const lookup = useCallback(() => {
    const q = identifier.trim().toLowerCase();
    if (!q) {
      return;
    }
    // The display label is matched as well as the bare name: `name` is now the
    // bare medication, so "Paracetamol 500 mg" — what the operator reads on the
    // shelf — would otherwise stop resolving.
    const found =
      items.find(
        (i) =>
          i.sku.toLowerCase() === q ||
          i.barcode?.toLowerCase() === q ||
          i.name.toLowerCase() === q ||
          i.displayName.toLowerCase() === q
      ) ?? null;
    setFoundItem(found);
    if (found) {
      setIsNew(false);
      const details = detailsFromItem(found);
      setCategory(details.category);
      setForm(details.form);
      setName(details.name);
      setPackQty(details.packQty);
      setPackSize(details.packSize);
      setPackUnit(details.packUnit);
      setStrengthUnit(details.strengthUnit);
      setStrengthValue(details.strengthValue);
      setQtyUnit("base");
      toast.success(`Found: ${found.displayName}`);
      // jump to step 3 per spec if scan hits existing → jump to Step 3
      goNext(true);
    } else {
      setIsNew(true);
      setCategory(EMPTY_DETAILS.category);
      setForm(EMPTY_DETAILS.form);
      setName(EMPTY_DETAILS.name);
      setPackQty(EMPTY_DETAILS.packQty);
      setPackSize(EMPTY_DETAILS.packSize);
      setPackUnit(EMPTY_DETAILS.packUnit);
      setStrengthUnit(EMPTY_DETAILS.strengthUnit);
      setStrengthValue(EMPTY_DETAILS.strengthValue);
      setQtyUnit("base");
      toast.message("Not found — Create new item?", {
        description: `No match for "${identifier}". Fill details to create.`,
      });
    }
  }, [goNext, identifier, items]);

  const goBack = useCallback(() => {
    if (step > 1) {
      setDirection(-1);
      setStep((s) => s - 1);
      setAttemptedNext(false);
    }
  }, [step]);

  const handleCreateNew = useCallback(() => {
    setDirection(1);
    setStep(2);
  }, []);

  const handleCancel = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handleNext = useCallback(() => goNext(), [goNext]);

  const dirty = Boolean(identifier || name || batch || qty || notes || packQty);
  // Step 3 soft: never hard-block Next; warnings only
  const stepValid = step === 3 ? true : validateStep(step, draft);

  return (
    <WizardShell
      backLabel="Back"
      canBack={step > 1}
      canNext={stepValid}
      direction={direction}
      dirty={dirty}
      nextLabel={step === 4 ? "Confirm Stock In" : "Next →"}
      onBack={goBack}
      onCancel={handleCancel}
      onNext={handleNext}
      onOpenChange={onOpenChange}
      open={open}
      originRect={originRect}
      step={step}
      title="Stock In"
      totalSteps={4}
    >
      {step === 1 ? (
        <StepIdentify
          code={identifier}
          foundName={foundItem?.name ?? null}
          isNewItem={isNew}
          onCodeChange={setIdentifier}
          onCreateNew={handleCreateNew}
          onLookup={lookup}
          reduceMotion={reduceMotion ?? false}
          showErrors={attemptedNext}
        />
      ) : null}

      {step === 2 ? (
        <StepDetails
          category={category}
          form={form}
          itemName={name}
          onCategoryChange={setCategory}
          onFormChange={setForm}
          onNameChange={setName}
          onPackQtyChange={setPackQty}
          onPackSizeChange={setPackSize}
          onPackUnitChange={setPackUnit}
          onStrengthUnitChange={setStrengthUnit}
          onStrengthValueChange={setStrengthValue}
          packErrors={packErrors({ form, packQty, packUnit })}
          packQty={packQty}
          packSize={packSize}
          packUnit={packUnit}
          preFilled={foundItem !== null}
          showErrors={attemptedNext}
          strengthUnit={strengthUnit}
          strengthValue={strengthValue}
        />
      ) : null}

      {step === 3 ? (
        <StepBatch
          batchNo={batch}
          duplicateBatch={duplicateBatch}
          expiry={expiry}
          notes={notes}
          onBatchChange={setBatch}
          onExpiryChange={setExpiry}
          onNotesChange={setNotes}
          onQtyChange={setQty}
          qty={qty}
          quantityUnit={quantityUnit}
          showErrors={attemptedNext}
        />
      ) : null}

      {step === 4 ? (
        <StepReview allValid={allStepsValid(draft)} draft={draft} />
      ) : null}
    </WizardShell>
  );
}
