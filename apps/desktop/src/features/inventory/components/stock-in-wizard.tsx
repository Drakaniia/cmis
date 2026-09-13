import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { expiryLabel, mockSuppliers } from "../mock";
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

interface StockInWizardProps {
  initialItemId?: string | null;
  items: InventoryItem[];
  onConfirm: (payload: {
    itemId: string | null;
    isNew: boolean;
    name: string;
    category: string;
    unit: string;
    batch: string;
    expiry: string;
    qty: number;
    supplier: string;
    notes: string;
  }) => void;
  onOpenChange: (v: boolean) => void;
  open: boolean;
  originRect?: DOMRect | null;
}

export function StockInWizard({
  open,
  onOpenChange,
  items,
  initialItemId,
  originRect,
  onConfirm,
}: StockInWizardProps) {
  const [step, setStep] = React.useState(1);
  const [direction, setDirection] = React.useState<1 | -1>(1);

  // Step 1: identify
  const [identifier, setIdentifier] = React.useState("");
  const [foundItem, setFoundItem] = React.useState<InventoryItem | null>(null);
  const [isNew, setIsNew] = React.useState(false);

  // Step 2: item details
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<
    (typeof INVENTORY_CATEGORIES)[number]
  >(INVENTORY_CATEGORIES[0]);
  const [unit, setUnit] = React.useState("tablet");

  // Step 3: batch
  const [batch, setBatch] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [supplier, setSupplier] = React.useState<
    (typeof mockSuppliers)[number]
  >(mockSuppliers[0]);
  const [notes, setNotes] = React.useState("");

  const [attemptedNext, setAttemptedNext] = React.useState(false);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
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
          setCategory(found.category as typeof category);
          setSupplier(found.supplier as typeof supplier);
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

  function lookup() {
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
      setCategory(found.category as typeof category);
      setSupplier(found.supplier as typeof supplier);
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
  }

  const duplicateBatch = React.useMemo(() => {
    if (!(foundItem && batch)) {
      return false;
    }
    return foundItem.batches.some(
      (b) => b.batch.toLowerCase() === batch.trim().toLowerCase()
    );
  }, [foundItem, batch]);

  function validateStep(s: number): boolean {
    if (s === 1) {
      return identifier.trim().length > 0;
    }
    if (s === 2) {
      return name.trim().length > 0 && category.trim().length > 0;
    }
    if (s === 3) {
      const qtyNum = Number(qty);
      const expiryDate = expiry ? new Date(expiry) : null;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const future = expiryDate ? expiryDate > now : false;
      return (
        batch.trim().length > 0 &&
        future &&
        Number.isFinite(qtyNum) &&
        qtyNum >= 1 &&
        supplier.trim().length > 0
      );
    }
    return true;
  }

  function goNext(force = false) {
    const valid = validateStep(step);
    if (!(valid || force)) {
      setAttemptedNext(true);
      return;
    }
    setAttemptedNext(false);
    if (step < 4) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      // confirm
      onConfirm({
        batch: batch.trim(),
        category,
        expiry,
        isNew,
        itemId: foundItem?.id ?? null,
        name: name.trim(),
        notes: notes.trim(),
        qty: Number(qty),
        supplier,
        unit,
      });
      toast.success(`Logged: ${name || identifier} +${qty}`);
      onOpenChange(false);
    }
  }

  function goBack() {
    if (step > 1) {
      setDirection(-1);
      setStep((s) => s - 1);
      setAttemptedNext(false);
    }
  }

  const dirty = Boolean(identifier || name || batch || qty || notes);

  return (
    <WizardShell
      backLabel="Back"
      canBack={step > 1}
      canNext={validateStep(step)}
      direction={direction}
      dirty={dirty}
      nextLabel={step === 4 ? "Confirm Stock In" : "Next →"}
      onBack={goBack}
      onCancel={() => onOpenChange(false)}
      onNext={() => goNext()}
      onOpenChange={onOpenChange}
      open={open}
      originRect={originRect}
      step={step}
      title="Stock In"
      totalSteps={4}
    >
      {step === 1 ? (
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
              animate={
                attemptedNext && !identifier.trim() && !reduceMotion
                  ? "shake"
                  : "idle"
              }
              variants={shakeVariants}
            >
              <input
                autoFocus
                className={cn(
                  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                  attemptedNext && !identifier.trim() && "border-destructive"
                )}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    lookup();
                  }
                }}
                placeholder="Scan barcode or type SKU"
                value={identifier}
              />
            </motion.div>
            {attemptedNext && !identifier.trim() ? (
              <span className="mt-1 block text-caption text-destructive">
                Identifier is required.
              </span>
            ) : null}
          </label>
          <div className="flex gap-2">
            <Button className="press-feedback" onClick={lookup} size="sm">
              Lookup
            </Button>
            {foundItem ? (
              <span className="inline-flex items-center rounded-full bg-[var(--success)]/15 px-2.5 py-1 font-medium text-[var(--success)] text-xs">
                Found: {foundItem.name}
              </span>
            ) : isNew && identifier ? (
              <span className="inline-flex items-center rounded-full bg-[var(--warning)]/15 px-2.5 py-1 font-medium text-[var(--warning)] text-xs">
                New item — will create
              </span>
            ) : null}
          </div>
          {!foundItem && isNew && identifier ? (
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-caption">
              Item not found — Create new?
              <Button
                className="ml-2"
                onClick={() => {
                  setDirection(1);
                  setStep(2);
                }}
                size="sm"
                variant="outline"
              >
                Create new
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">
            Step 2 — Item Details {foundItem ? "(pre-filled)" : ""}
          </h3>
          <label className="block font-medium text-caption text-foreground">
            Item name
            <motion.div
              animate={
                attemptedNext && !name.trim() && !reduceMotion
                  ? "shake"
                  : "idle"
              }
              variants={shakeVariants}
            >
              <input
                className={cn(
                  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                  foundItem && "bg-muted",
                  attemptedNext && !name.trim() && "border-destructive"
                )}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Paracetamol 500mg"
                readOnly={!!foundItem}
                value={name}
              />
            </motion.div>
            {attemptedNext && !name.trim() ? (
              <span className="mt-1 block text-caption text-destructive">
                Name required.
              </span>
            ) : null}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block font-medium text-caption text-foreground">
              Category
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                onChange={(e) =>
                  setCategory(
                    e.target.value as (typeof INVENTORY_CATEGORIES)[number]
                  )
                }
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
                onChange={(e) => setUnit(e.target.value)}
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
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">
            Step 3 — Batch Info
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block font-medium text-caption text-foreground">
              Batch / Lot
              <input
                className={cn(
                  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                  attemptedNext && !batch.trim() && "border-destructive"
                )}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="B-2026-04"
                value={batch}
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
                  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                  attemptedNext && !expiry && "border-destructive"
                )}
                onChange={(e) => setExpiry(e.target.value)}
                type="date"
                value={expiry}
              />
              {attemptedNext &&
              expiry &&
              new Date(expiry) <= new Date(new Date().setHours(0, 0, 0, 0)) ? (
                <span className="mt-1 block text-caption text-destructive">
                  Expiry must be future.
                </span>
              ) : null}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block font-medium text-caption text-foreground">
              Quantity
              <input
                className={cn(
                  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                  attemptedNext &&
                    (!qty || Number(qty) < 1) &&
                    "border-destructive"
                )}
                min={1}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                type="number"
                value={qty}
              />
            </label>
            <label className="block font-medium text-caption text-foreground">
              Supplier
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                onChange={(e) =>
                  setSupplier(e.target.value as (typeof mockSuppliers)[number])
                }
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
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery notes…"
              value={notes}
            />
          </label>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">
            Step 4 — Review & Submit
          </h3>
          <div className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-caption text-muted-foreground">Item</p>
                <p className="font-medium">
                  {name || identifier || "—"} {isNew ? "(new)" : ""}
                </p>
                <p className="text-caption">
                  {category} · {unit}
                </p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Batch</p>
                <p className="font-medium">{batch || "—"}</p>
                <p className="text-caption">
                  Expiry: {expiry ? expiryLabel(expiry) : "—"} · Qty:{" "}
                  {qty || "—"}
                </p>
                <p className="text-caption">Supplier: {supplier}</p>
              </div>
            </div>
            {notes ? (
              <p className="mt-2 text-caption text-muted-foreground">
                Notes: {notes}
              </p>
            ) : null}
          </div>
          <p className="text-caption text-muted-foreground">
            Confirm enables only if all steps valid — currently{" "}
            {validateStep(1) && validateStep(2) && validateStep(3)
              ? "valid ✓"
              : "fix errors above"}
          </p>
        </div>
      ) : null}
    </WizardShell>
  );
}
