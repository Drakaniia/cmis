import { AppleDatePicker } from "@cmis/ui/components/apple-date-picker";
import { Button } from "@cmis/ui/components/button";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { todayIso } from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { expiryLabel } from "../domain/expiry";
import { composeDisplayName } from "../domain/strength";
import { MEDICINE_FORMS, STRENGTH_UNITS } from "../domain/vocabulary";
import type { InventoryItem } from "../types";
import { CategoryPicker } from "./category-picker";
import { WizardShell } from "./wizard-shell";

/** Apple Design §6: field shake — 4px spring, damping 0.6 / response 0.25s */
const shakeVariants = {
  idle: { x: 0 },
  shake: {
    transition: { damping: 0.6, duration: 0.25, type: "spring" as const },
    x: [0, -4, 4, -3, 3, -1, 1, 0],
  },
};

const FIELD_CLASS =
  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

/**
 * A category is a name, not a fixed union: the list is data now (migration
 * 0006), so the wizard can offer one the operator added a moment ago.
 */
type InventoryCategory = string;

/**
 * The wizard's own draft.
 *
 * `unit` is gone (decision 8): the old dropdown offered `tablet`/`capsule`/… and
 * went nowhere, because no column existed for it. The four strength fields
 * replace it, and Step 4's review shows their composed label so the operator can
 * see what will be stored.
 */
interface StockInDraft {
  batch: string;
  category: InventoryCategory;
  expiry: string;
  form: string;
  identifier: string;
  isNew: boolean;
  itemId: string | null;
  name: string;
  notes: string;
  packSize: string;
  qty: number;
  strengthUnit: string;
  strengthValue: string;
  supplier: string | null;
}

interface StockInWizardProps {
  initialItemId?: string | null;
  items: InventoryItem[];
  onConfirm: (payload: StockInDraft) => void;
  onOpenChange: (v: boolean) => void;
  open: boolean;
  originRect?: DOMRect | null;
}

function validateStep(s: number, draft: StockInDraft): boolean {
  if (s === 1) {
    return draft.identifier.trim().length > 0;
  }
  if (s === 2) {
    return draft.name.trim().length > 0 && draft.category.trim().length > 0;
  }
  if (s === 3) {
    const expiryDate = draft.expiry ? new Date(draft.expiry) : null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const future = expiryDate ? expiryDate > now : false;
    return (
      draft.batch.trim().length > 0 &&
      future &&
      Number.isFinite(draft.qty) &&
      draft.qty >= 1
    );
  }
  return true;
}

function allStepsValid(draft: StockInDraft): boolean {
  return (
    validateStep(1, draft) && validateStep(2, draft) && validateStep(3, draft)
  );
}

function ValidationMessage({ message }: { message: string }) {
  return (
    <span className="mt-1 block text-caption text-destructive">{message}</span>
  );
}

function StepIdentify({
  code,
  foundName,
  isNewItem,
  showErrors,
  reduceMotion,
  onCodeChange,
  onLookup,
  onCreateNew,
}: {
  code: string;
  foundName: string | null;
  isNewItem: boolean;
  showErrors: boolean;
  reduceMotion: boolean;
  onCodeChange: (value: string) => void;
  onLookup: () => void;
  onCreateNew: () => void;
}) {
  const missing = showErrors && code.trim().length === 0;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onCodeChange(event.target.value),
    [onCodeChange]
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onLookup();
      }
    },
    [onLookup]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 1 — Identify
      </h3>
      <p className="text-caption text-muted-foreground">
        Scan barcode or type SKU. Lookup will prefill next steps.
      </p>
      <label className="block font-medium text-caption text-foreground">
        Barcode / SKU
        <motion.div
          animate={missing && !reduceMotion ? "shake" : "idle"}
          variants={shakeVariants}
        >
          <input
            autoFocus
            className={cn(FIELD_CLASS, missing && "border-destructive")}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Scan barcode or type SKU"
            value={code}
          />
        </motion.div>
        {missing ? (
          <ValidationMessage message="Identifier is required." />
        ) : null}
      </label>
      <div className="flex gap-2">
        <Button className="press-feedback" onClick={onLookup} size="sm">
          Lookup
        </Button>
        {foundName ? (
          <span className="inline-flex items-center rounded-full bg-[var(--success)]/15 px-2.5 py-1 font-medium text-[var(--success)] text-xs">
            Found: {foundName}
          </span>
        ) : null}
        {!foundName && isNewItem && code ? (
          <span className="inline-flex items-center rounded-full bg-[var(--warning)]/15 px-2.5 py-1 font-medium text-[var(--warning)] text-xs">
            New item — will create
          </span>
        ) : null}
      </div>
      {foundName === null && isNewItem && code ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-caption">
          Item not found — Create new?
          <Button
            className="ml-2"
            onClick={onCreateNew}
            size="sm"
            variant="outline"
          >
            Create new
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const SELECT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

/** Step 2 fields as one value, so "prefill from an item" is stated once. */
function detailsFromItem(item: InventoryItem): StepDetailsState {
  return {
    category: item.category,
    form: item.form,
    name: item.name,
    packSize: item.packSize,
    strengthUnit: item.strengthUnit,
    strengthValue: item.strengthValue,
  };
}

interface StepDetailsState {
  category: InventoryCategory;
  form: string;
  name: string;
  packSize: string;
  strengthUnit: string;
  strengthValue: string;
}

const EMPTY_DETAILS: StepDetailsState = {
  category: "",
  form: "",
  name: "",
  packSize: "",
  strengthUnit: "",
  strengthValue: "",
};

/** §9 — `pack_size` is capped at 40 characters, mirroring the template rule. */
export const PACK_SIZE_MAX_LENGTH = 40;

/**
 * Step 2 — Item Details, replacing the dead Unit dropdown with the four fields
 * the template actually stores (decision 15).
 *
 * All four are optional and never block Next (decision 7): a delivery arrives
 * with a lot number and a count, and refusing to record it because nobody typed
 * a pack size would be worse than an incomplete row. Rows that stay incomplete
 * are flagged through `dosage_missing` instead.
 */
function StepDetails({
  itemName,
  preFilled,
  category,
  form,
  packSize,
  strengthUnit,
  strengthValue,
  showErrors,
  onNameChange,
  onCategoryChange,
  onFormChange,
  onPackSizeChange,
  onStrengthUnitChange,
  onStrengthValueChange,
}: {
  itemName: string;
  preFilled: boolean;
  category: InventoryCategory;
  form: string;
  packSize: string;
  strengthUnit: string;
  strengthValue: string;
  showErrors: boolean;
  onNameChange: (value: string) => void;
  onCategoryChange: (value: InventoryCategory) => void;
  onFormChange: (value: string) => void;
  onPackSizeChange: (value: string) => void;
  onStrengthUnitChange: (value: string) => void;
  onStrengthValueChange: (value: string) => void;
}) {
  const nameMissing = showErrors && itemName.trim().length === 0;
  const packTooLong = packSize.trim().length > PACK_SIZE_MAX_LENGTH;

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onNameChange(event.target.value),
    [onNameChange]
  );
  const handleStrengthValueChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onStrengthValueChange(event.target.value),
    [onStrengthValueChange]
  );
  const handleStrengthUnitChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      onStrengthUnitChange(event.target.value),
    [onStrengthUnitChange]
  );
  const handleFormChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => onFormChange(event.target.value),
    [onFormChange]
  );
  const handlePackSizeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onPackSizeChange(event.target.value),
    [onPackSizeChange]
  );
  const handleCategoryChange = useCallback(
    (value: string) => onCategoryChange(value),
    [onCategoryChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 2 — Item Details {preFilled ? "(pre-filled)" : ""}
      </h3>
      <label className="block font-medium text-caption text-foreground">
        Item name
        <input
          className={cn(FIELD_CLASS, nameMissing && "border-destructive")}
          onChange={handleNameChange}
          placeholder="e.g., Paracetamol"
          value={itemName}
        />
        {nameMissing ? <ValidationMessage message="Name required." /> : null}
      </label>
      {/* The list is editable from here, so a delivery that introduces a new
          grouping does not have to be recorded as the wrong one (§7.3). */}
      <CategoryPicker
        label="Category"
        name="stock-in-category"
        onChange={handleCategoryChange}
        placeholder="Select category"
        value={category}
      />
      <fieldset className="space-y-2 rounded-md border border-border/50 p-3">
        <legend className="px-1 text-caption text-muted-foreground">
          Strength &amp; form <span>(all optional)</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-medium text-caption text-foreground">
            Strength value
            <input
              className={FIELD_CLASS}
              onChange={handleStrengthValueChange}
              placeholder="500 or 200/200/5"
              value={strengthValue}
            />
          </label>
          <label className="block font-medium text-caption text-foreground">
            Strength unit
            <select
              className={SELECT_CLASS}
              onChange={handleStrengthUnitChange}
              value={strengthUnit}
            >
              <option value="">—</option>
              {STRENGTH_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-medium text-caption text-foreground">
            Form
            <select
              className={SELECT_CLASS}
              onChange={handleFormChange}
              value={form}
            >
              <option value="">—</option>
              {MEDICINE_FORMS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-medium text-caption text-foreground">
            Pack size
            <input
              className={cn(FIELD_CLASS, packTooLong && "border-destructive")}
              onChange={handlePackSizeChange}
              placeholder="(100/box)"
              value={packSize}
            />
            {packTooLong ? (
              <ValidationMessage
                message={`Pack size must be ${PACK_SIZE_MAX_LENGTH} characters or fewer.`}
              />
            ) : null}
          </label>
        </div>
      </fieldset>
    </div>
  );
}

function StepBatch({
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

function StepReview({
  draft,
  allValid,
}: {
  draft: StockInDraft;
  allValid: boolean;
}) {
  // The review shows the composed label rather than the raw parts, so the
  // operator sees the medication the way the lists and the dispense lookup will
  // read it back (decision 18).
  const label = composeDisplayName({
    form: draft.form,
    name: draft.name || draft.identifier,
    packSize: draft.packSize,
    strengthUnit: draft.strengthUnit,
    strengthValue: draft.strengthValue,
  });
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 4 — Review & Submit
      </h3>
      <div className="rounded-lg border border-border bg-card p-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-caption text-muted-foreground">Item</p>
            <p className="font-medium">
              {label || "—"} {draft.isNew ? "(new)" : ""}
            </p>
            <p className="text-caption">{draft.category}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Batch</p>
            <p className="font-medium">{draft.batch || "—"}</p>
            <p className="text-caption">
              Expiry: {draft.expiry ? expiryLabel(draft.expiry) : "—"} · Qty:{" "}
              {draft.qty || "—"}
            </p>
          </div>
        </div>
        {draft.notes ? (
          <p className="mt-2 text-caption text-muted-foreground">
            Notes: {draft.notes}
          </p>
        ) : null}
      </div>
      <p className="text-caption text-muted-foreground">
        Confirm enables only if all steps valid — currently{" "}
        {allValid ? "valid ✓" : "fix errors above"}
      </p>
    </div>
  );
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
