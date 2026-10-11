import { Button } from "@cmis/ui/components/button";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  baseUnitFor,
  describeQuantity,
  hasPack,
  normalizeUnit,
  toBaseUnits,
} from "../../domain/pack-size";
import type { InventoryItem } from "../../types";
import { WizardShell } from "../wizard-shell";
import { EMPTY_DETAILS } from "./constants";
import { StepBatch } from "./steps/step-batch";
import { StepDetails } from "./steps/step-details";
import { StepIdentify } from "./steps/step-identify";
import { StepReview } from "./steps/step-review";
import { StepSuccess } from "./steps/step-success";
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
  packWarnings,
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
  // The terminal screen after a submitted delivery: what was just logged, from
  // which the operator can start the next item without leaving the wizard.
  const [confirmed, setConfirmed] = useState<{
    itemLabel: string;
    qtyLabel: string;
  } | null>(null);
  // Set the moment a delivery is submitted and cleared when the dialog closes.
  // While it is set the open-effect must not re-run: the parent refetches and
  // reselects the just-saved item, and re-prefilling here would clobber both the
  // success screen and the blank Step 1 of a "Stock In Another Item" run.
  const [submitted, setSubmitted] = useState(false);
  // The item the wizard was opened on. "Stock In Another Item" trusts a later
  // `initialItemId` only when it has changed from this, so a newly created
  // item is carried forward while the previously selected item — which a new
  // delivery never touched — is not mistaken for it.
  const openedItemIdRef = useRef<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) {
      // Clear the terminal state too, so reopening shows a fresh Step 1 rather
      // than the last run's success screen for a frame.
      setSubmitted(false);
      setConfirmed(null);
      setStep(1);
      return;
    }
    if (submitted) {
      return;
    }
    setConfirmed(null);
    setStep(1);
    setDirection(1);
    setAttemptedNext(false);
    const found = initialItemId
      ? (items.find((i) => i.id === initialItemId) ?? null)
      : null;
    openedItemIdRef.current = found?.id ?? null;
    setFoundItem(found);
    setIsNew(false);
    // Identity text is never prefilled: the SKU/barcode shows as a greyed
    // placeholder (F1) so the field reads empty but Next can fall back to it.
    setIdentifier("");
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
  }, [open, initialItemId, items, submitted]);

  /**
   * V4 — an item whose form is "box" is its own base unit: a pack on top would
   * double-count (D15). The pack fields are disabled in that case, so any pair
   * a prefilled item arrived with has to be cleared as well — otherwise the
   * disabled inputs would hold a value the operator cannot see, fix or submit.
   * The same clear runs from `handleFormChange` the moment "box" is picked.
   */
  useEffect(() => {
    if (
      normalizeUnit(form) === "box" &&
      (packQty !== "" || packUnit !== "" || packSize !== "")
    ) {
      setPackQty("");
      setPackUnit("");
      setPackSize("");
    }
  }, [form, packQty, packUnit, packSize]);

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

  // Step 1 fallback identity (F4): typed text wins, otherwise the opened
  // item's SKU/barcode is what Next/draft/payload use. Placeholder-only, never
  // submitted as a value.
  const effectiveIdentifier = useMemo(
    () =>
      identifier.trim() ||
      foundItem?.sku?.trim() ||
      foundItem?.barcode?.trim() ||
      "",
    [identifier, foundItem]
  );
  const identifyPlaceholder = foundItem
    ? foundItem.sku?.trim() ||
      foundItem.barcode?.trim() ||
      "Scan barcode or type SKU"
    : "Scan barcode or type SKU";

  const draft = useMemo<StockInDraft>(
    () => ({
      batch: batch.trim(),
      category,
      expiry,
      form: packItem.form,
      identifier: effectiveIdentifier,
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
      effectiveIdentifier,
      expiry,
      foundItem,
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
      // Every step blocks on its required fields; step 3's batch/expiry stay
      // soft, with only the quantity hard-required. A failed check raises the
      // per-field indicators rather than leaving a disabled Next with no
      // explanation, so the operator can see what is still empty.
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
      const itemLabel = name || effectiveIdentifier;
      const qtyLabel = describeQuantity(finalDraft.qty, packItem);
      onConfirm(finalDraft);
      // Stay open on a success screen rather than closing: a delivery usually
      // holds several items, so the operator is offered the next one instead of
      // having to reopen the wizard and restart from Step 1.
      setSubmitted(true);
      setConfirmed({ itemLabel, qtyLabel });
      setDirection(1);
      setStep(5);
      toast.success(`Logged: ${itemLabel} +${qtyLabel}`);
    },
    [draft, effectiveIdentifier, name, onConfirm, packItem, step]
  );

  /**
   * "Stock In Another Item" — repeat the delivery for the item just saved.
   *
   * A delivery run is almost always the same product in different lots, so the
   * item stays selected: the operator lands on Step 3 with the identity and
   * details already filled and only has to type the new batch and quantity —
   * no second scan, no reopening the wizard. Back still walks to Step 1 for a
   * genuinely different item.
   *
   * The item comes from `foundItem` for an existing row. A brand-new item has
   * no `foundItem`, but the parent hands its id back through `initialItemId`
   * (and refetches `items`) after the insert. That id is trusted only when it
   * differs from the one the wizard opened on, so a previously selected item is
   * never carried as if the new delivery had touched it. When nothing resolves
   * — the parent has not handed the row back yet — the wizard falls back to a
   * blank Step 1 rather than guessing.
   *
   * The `submitted` flag stays set so a background refetch cannot re-prefill
   * the fresh batch this run deliberately cleared.
   */
  const startAnother = useCallback(() => {
    const createdId =
      initialItemId && initialItemId !== openedItemIdRef.current
        ? initialItemId
        : null;
    const carried =
      foundItem ??
      (createdId
        ? (items.find((item) => item.id === createdId) ?? null)
        : null);
    setConfirmed(null);
    setDirection(1);
    setAttemptedNext(false);
    // Step 3 is re-entered fresh: the identity and details carry over, but the
    // lot being recorded now is a different one.
    setBatch("");
    setExpiry("");
    setQty("");
    setQtyUnit("base");
    setNotes("");
    if (carried) {
      setFoundItem(carried);
      setIsNew(false);
      setIdentifier("");
      const details = detailsFromItem(carried);
      setCategory(details.category);
      setForm(details.form);
      setName(details.name);
      setPackQty(details.packQty);
      setPackSize(details.packSize);
      setPackUnit(details.packUnit);
      setStrengthUnit(details.strengthUnit);
      setStrengthValue(details.strengthValue);
      setStep(3);
      return;
    }
    setFoundItem(null);
    setIsNew(false);
    setIdentifier("");
    setCategory(EMPTY_DETAILS.category);
    setForm(EMPTY_DETAILS.form);
    setName(EMPTY_DETAILS.name);
    setPackQty(EMPTY_DETAILS.packQty);
    setPackSize(EMPTY_DETAILS.packSize);
    setPackUnit(EMPTY_DETAILS.packUnit);
    setStrengthUnit(EMPTY_DETAILS.strengthUnit);
    setStrengthValue(EMPTY_DETAILS.strengthValue);
    setStep(1);
  }, [foundItem, initialItemId, items]);

  const lookup = useCallback(() => {
    const typed = identifier.trim();
    // Empty + resolved item means "use the fallback" — advance to Step 2
    // without a redundant Found toast (F6/F7). Typed text always looks up.
    if (!typed) {
      if (foundItem) {
        goNext();
      }
      return;
    }
    const q = typed.toLowerCase();
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
  }, [foundItem, goNext, identifier, items]);

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

  /**
   * Choosing the dose form is the moment V4 becomes knowable, so a switch to
   * "box" clears the pack pair at once rather than leaving two disabled fields
   * holding numbers the operator can no longer edit.
   */
  const handleFormChange = useCallback((value: string) => {
    setForm(value);
    if (normalizeUnit(value) === "box") {
      setPackQty("");
      setPackUnit("");
      setPackSize("");
    }
  }, []);

  const handleCancel = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handleNext = useCallback(() => goNext(), [goNext]);

  const dirty = Boolean(identifier || name || batch || qty || notes || packQty);

  // The success screen's terminal actions, replacing Cancel/Back/Next (§8: the
  // primary CTA stays in the footer). "Done" closes, "Stock In Another Item"
  // resets in place.
  const successFooter = confirmed ? (
    <>
      <Button
        className="press-feedback"
        onClick={handleCancel}
        size="sm"
        variant="outline"
      >
        Done
      </Button>
      <Button
        className="press-feedback"
        onClick={startAnother}
        size="sm"
        variant="confirm"
      >
        Stock In Another Item
      </Button>
    </>
  ) : undefined;

  return (
    <WizardShell
      backLabel="Back"
      canBack={step > 1}
      direction={direction}
      dirty={confirmed ? false : dirty}
      footer={successFooter}
      nextLabel={step === 4 ? "Confirm Stock In" : "Next →"}
      onBack={goBack}
      onCancel={handleCancel}
      onNext={handleNext}
      onOpenChange={onOpenChange}
      open={open}
      originRect={originRect}
      step={step}
      title="Stock In"
      totalSteps={confirmed ? 5 : 4}
    >
      {confirmed ? (
        <StepSuccess
          itemLabel={confirmed.itemLabel}
          qtyLabel={confirmed.qtyLabel}
        />
      ) : null}

      {step === 1 ? (
        <StepIdentify
          code={identifier}
          foundName={foundItem?.name ?? null}
          hasResolvedItem={foundItem !== null}
          isNewItem={isNew}
          onCodeChange={setIdentifier}
          onCreateNew={handleCreateNew}
          onLookup={lookup}
          placeholder={identifyPlaceholder}
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
          onFormChange={handleFormChange}
          onNameChange={setName}
          onPackQtyChange={setPackQty}
          onPackSizeChange={setPackSize}
          onPackUnitChange={setPackUnit}
          onStrengthUnitChange={setStrengthUnit}
          onStrengthValueChange={setStrengthValue}
          packDisabled={normalizeUnit(form) === "box"}
          packErrors={packErrors({ form, packQty, packUnit })}
          packQty={packQty}
          packSize={packSize}
          packUnit={packUnit}
          packWarnings={packWarnings({ form, packQty, packUnit })}
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
