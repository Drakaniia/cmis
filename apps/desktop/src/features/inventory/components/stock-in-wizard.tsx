import { Button } from "@cmis/ui/components/button";
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
import { SUPPLIER_LEAD_TIMES } from "../domain/low-stock";

const mockSuppliers = SUPPLIER_LEAD_TIMES.map(
  (s) => s.name
) as unknown as readonly string[];

import type { InventoryItem } from "../types";
import { INVENTORY_CATEGORIES } from "../types";
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

type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
type Supplier = (typeof mockSuppliers)[number];

interface StockInDraft {
  batch: string;
  category: InventoryCategory;
  expiry: string;
  identifier: string;
  isNew: boolean;
  itemId: string | null;
  name: string;
  notes: string;
  qty: number;
  supplier: Supplier;
  unit: string;
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
      draft.qty >= 1 &&
      draft.supplier.trim().length > 0
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

function StepDetails({
  itemName,
  preFilled,
  category,
  unit,
  showErrors,
  onNameChange,
  onCategoryChange,
  onUnitChange,
}: {
  itemName: string;
  preFilled: boolean;
  category: InventoryCategory;
  unit: string;
  showErrors: boolean;
  onNameChange: (value: string) => void;
  onCategoryChange: (value: InventoryCategory) => void;
  onUnitChange: (value: string) => void;
}) {
  const nameMissing = showErrors && itemName.trim().length === 0;

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onNameChange(event.target.value),
    [onNameChange]
  );
  const handleUnitChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => onUnitChange(event.target.value),
    [onUnitChange]
  );
  const handleCategoryChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      onCategoryChange(event.target.value as InventoryCategory),
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
          className={cn(
            FIELD_CLASS,
            preFilled && "bg-muted",
            nameMissing && "border-destructive"
          )}
          onChange={handleNameChange}
          placeholder="e.g., Paracetamol 500mg"
          readOnly={preFilled}
          value={itemName}
        />
        {nameMissing ? <ValidationMessage message="Name required." /> : null}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block font-medium text-caption text-foreground">
          Category
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleCategoryChange}
            value={category}
          >
            {INVENTORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-medium text-caption text-foreground">
          Unit
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleUnitChange}
            value={unit}
          >
            <option value="tablet">tablet</option>
            <option value="capsule">capsule</option>
            <option value="bottle">bottle</option>
            <option value="sachet">sachet</option>
            <option value="strip">strip</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function StepBatch({
  batchNo,
  expiry,
  qty,
  supplier,
  notes,
  showErrors,
  duplicateBatch,
  onBatchChange,
  onExpiryChange,
  onQtyChange,
  onSupplierChange,
  onNotesChange,
}: {
  batchNo: string;
  expiry: string;
  qty: string;
  supplier: Supplier;
  notes: string;
  showErrors: boolean;
  duplicateBatch: boolean;
  onBatchChange: (value: string) => void;
  onExpiryChange: (value: string) => void;
  onQtyChange: (value: string) => void;
  onSupplierChange: (value: Supplier) => void;
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
  const handleExpiryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onExpiryChange(event.target.value),
    [onExpiryChange]
  );
  const handleQtyChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onQtyChange(event.target.value),
    [onQtyChange]
  );
  const handleSupplierChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      onSupplierChange(event.target.value as Supplier),
    [onSupplierChange]
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
          <input
            className={cn(
              FIELD_CLASS,
              showErrors && !expiry && "border-destructive"
            )}
            onChange={handleExpiryChange}
            type="date"
            value={expiry}
          />
          {expiryInPast ? (
            <ValidationMessage message="Expiry must be future." />
          ) : null}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block font-medium text-caption text-foreground">
          Quantity
          <input
            className={cn(FIELD_CLASS, qtyInvalid && "border-destructive")}
            min={1}
            onChange={handleQtyChange}
            placeholder="0"
            type="number"
            value={qty}
          />
        </label>
        <label className="block font-medium text-caption text-foreground">
          Supplier
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleSupplierChange}
            value={supplier}
          >
            {mockSuppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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
              {draft.name || draft.identifier || "—"}{" "}
              {draft.isNew ? "(new)" : ""}
            </p>
            <p className="text-caption">
              {draft.category} · {draft.unit}
            </p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Batch</p>
            <p className="font-medium">{draft.batch || "—"}</p>
            <p className="text-caption">
              Expiry: {draft.expiry ? expiryLabel(draft.expiry) : "—"} · Qty:{" "}
              {draft.qty || "—"}
            </p>
            <p className="text-caption">Supplier: {draft.supplier}</p>
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

  // Step 2: item details
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>(
    INVENTORY_CATEGORIES[0]
  );
  const [unit, setUnit] = useState("tablet");

  // Step 3: batch
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [supplier, setSupplier] = useState<Supplier>(mockSuppliers[0]);
  const [notes, setNotes] = useState("");

  const [attemptedNext, setAttemptedNext] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) {
      setStep(1);
      setDirection(1);
      setAttemptedNext(false);
      if (initialItemId) {
        const found = items.find((i) => i.id === initialItemId) ?? null;
        setFoundItem(found);
        if (found) {
          setIdentifier(found.sku);
          setName(found.name);
          setCategory(found.category as InventoryCategory);
          setSupplier(found.supplier as Supplier);
          setIsNew(false);
        }
      } else {
        setIdentifier("");
        setFoundItem(null);
        setIsNew(false);
        setName("");
      }
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
      identifier,
      isNew,
      itemId: foundItem?.id ?? null,
      name: name.trim(),
      notes: notes.trim(),
      qty: Number(qty),
      supplier,
      unit,
    }),
    [
      batch,
      category,
      expiry,
      foundItem,
      identifier,
      isNew,
      name,
      notes,
      qty,
      supplier,
      unit,
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
    const found =
      items.find(
        (i) =>
          i.sku.toLowerCase() === q ||
          i.barcode?.toLowerCase() === q ||
          i.name.toLowerCase() === q
      ) ?? null;
    setFoundItem(found);
    if (found) {
      setIsNew(false);
      setName(found.name);
      setCategory(found.category as InventoryCategory);
      setSupplier(found.supplier as Supplier);
      toast.success(`Found: ${found.name}`);
      // jump to step 3 per spec if scan hits existing → jump to Step 3
      goNext(true);
    } else {
      setIsNew(true);
      setName("");
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
          itemName={name}
          onCategoryChange={setCategory}
          onNameChange={setName}
          onUnitChange={setUnit}
          preFilled={foundItem !== null}
          showErrors={attemptedNext}
          unit={unit}
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
          onSupplierChange={setSupplier}
          qty={qty}
          showErrors={attemptedNext}
          supplier={supplier}
        />
      ) : null}

      {step === 4 ? (
        <StepReview allValid={allStepsValid(draft)} draft={draft} />
      ) : null}
    </WizardShell>
  );
}
