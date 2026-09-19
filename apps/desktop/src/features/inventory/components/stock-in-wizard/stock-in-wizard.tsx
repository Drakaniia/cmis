import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { InventoryItem } from "../../types";
import { WizardShell } from "../wizard-shell";
import { EMPTY_DETAILS } from "./constants";
import { StepBatch } from "./steps/step-batch";
import { StepDetails } from "./steps/step-details";
import { StepIdentify } from "./steps/step-identify";
import { StepReview } from "./steps/step-review";
import type {
  InventoryCategory,
  StockInDraft,
  StockInWizardProps,
} from "./types";
import { allStepsValid, detailsFromItem, validateStep } from "./validation";

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
  // existing item on lookup and never block Next (decision 7).
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("");
  const [strengthValue, setStrengthValue] = useState("");
  const [strengthUnit, setStrengthUnit] = useState("");
  const [form, setForm] = useState("");
  const [packSize, setPackSize] = useState("");

  // Step 3: batch
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
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
      setPackSize(details.packSize);
      setStrengthUnit(details.strengthUnit);
      setStrengthValue(details.strengthValue);
      setBatch("");
      setExpiry("");
      setQty("");
      setNotes("");
    }
  }, [open, initialItemId, items]);

  const draft = useMemo<StockInDraft>(
    () => ({
      batch: batch.trim(),
      category,
      expiry,
      form: form.trim(),
      identifier,
      isNew,
      itemId: foundItem?.id ?? null,
      name: name.trim(),
      notes: notes.trim(),
      packSize: packSize.trim(),
      qty: Number(qty),
      strengthUnit,
      strengthValue: strengthValue.trim(),
      supplier: null,
    }),
    [
      batch,
      category,
      expiry,
      form,
      foundItem,
      identifier,
      isNew,
      name,
      notes,
      packSize,
      qty,
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
      onConfirm(draft);
      toast.success(`Logged: ${name || identifier} +${qty}`);
      onOpenChange(false);
    },
    [draft, identifier, name, onConfirm, onOpenChange, qty, step]
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
      setPackSize(details.packSize);
      setStrengthUnit(details.strengthUnit);
      setStrengthValue(details.strengthValue);
      toast.success(`Found: ${found.displayName}`);
      // jump to step 3 per spec if scan hits existing → jump to Step 3
      goNext(true);
    } else {
      setIsNew(true);
      setCategory(EMPTY_DETAILS.category);
      setForm(EMPTY_DETAILS.form);
      setName(EMPTY_DETAILS.name);
      setPackSize(EMPTY_DETAILS.packSize);
      setStrengthUnit(EMPTY_DETAILS.strengthUnit);
      setStrengthValue(EMPTY_DETAILS.strengthValue);
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

  const dirty = Boolean(identifier || name || batch || qty || notes);
  const stepValid = validateStep(step, draft);

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
          onPackSizeChange={setPackSize}
          onStrengthUnitChange={setStrengthUnit}
          onStrengthValueChange={setStrengthValue}
          packSize={packSize}
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
          showErrors={attemptedNext}
        />
      ) : null}

      {step === 4 ? (
        <StepReview allValid={allStepsValid(draft)} draft={draft} />
      ) : null}
    </WizardShell>
  );
}
