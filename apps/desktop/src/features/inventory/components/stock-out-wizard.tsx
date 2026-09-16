import { Button } from "@cmis/ui/components/button";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { cn } from "@cmis/ui/lib/utils";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { expiryLabel } from "../domain/expiry";
import type { InventoryItem } from "../types";
import { WizardShell } from "./wizard-shell";

type Reason =
  | "Dispensed"
  | "Disposed (expired)"
  | "Damaged"
  | "Transferred"
  | "Other";

type Batch = InventoryItem["batches"][number];

interface StockOutDraft {
  batch: string;
  notes: string;
  qty: number;
  reason: Reason;
  reasonOther: string;
  selectedId: string | null;
}

interface StockOutWizardProps {
  initialItemId?: string | null;
  items: InventoryItem[];
  onConfirm: (payload: {
    itemId: string;
    reason: Reason;
    reasonOther?: string;
    qty: number;
    batch: string;
    notes: string;
  }) => void;
  onOpenChange: (v: boolean) => void;
  open: boolean;
  originRect?: DOMRect | null;
}

const REASONS: Reason[] = [
  "Dispensed",
  "Disposed (expired)",
  "Damaged",
  "Transferred",
  "Other",
];

function validateStep(
  s: number,
  draft: StockOutDraft,
  available: number | null
): boolean {
  if (s === 1) {
    return draft.selectedId !== null;
  }
  if (s === 2) {
    return draft.reason !== "Other" || draft.reasonOther.trim().length > 0;
  }
  if (s === 3) {
    if (available === null) {
      return false;
    }
    const n = draft.qty;
    return (
      Number.isFinite(n) && n >= 1 && n <= available && draft.batch.length > 0
    );
  }
  return true;
}

/** Step 2 waits for an explicit disposal confirmation before advancing. */
function canAdvance(
  step: number,
  draft: StockOutDraft,
  available: number | null,
  expiryConfirmPending: boolean
): boolean {
  if (
    step === 2 &&
    draft.reason === "Disposed (expired)" &&
    !expiryConfirmPending
  ) {
    return true;
  }
  return validateStep(step, draft, available);
}

function ValidationMessage({ message }: { message: string }) {
  return <span className="text-caption text-destructive">{message}</span>;
}

function ExpiryConfirmPanel({
  onConfirmContinue,
  onGoBack,
}: {
  onConfirmContinue: () => void;
  onGoBack: () => void;
}) {
  return (
    <div className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-3 text-sm">
      <p className="font-medium">Expired stock — confirm disposal?</p>
      <p className="text-caption text-muted-foreground">
        You selected Disposed (expired). Confirm to continue.
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={onConfirmContinue} size="sm">
          Confirm, continue
        </Button>
        <Button onClick={onGoBack} size="sm" variant="outline">
          Go back
        </Button>
      </div>
    </div>
  );
}

function PickRow({
  item,
  selected,
  onSelect,
}: {
  item: InventoryItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(item.id), [item.id, onSelect]);

  return (
    <button
      className={cn(
        "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted",
        selected && "bg-accent text-accent-foreground"
      )}
      onClick={handleClick}
      type="button"
    >
      <span className="font-medium">{item.displayName}</span>
      <span className="text-caption text-muted-foreground">
        Qty: {item.qty} · {item.sku}
      </span>
    </button>
  );
}

function StepPick({
  search,
  results,
  selectedId,
  selectedName,
  selectedQty,
  showErrors,
  onSearchChange,
  onSelect,
}: {
  search: string;
  results: InventoryItem[];
  selectedId: string | null;
  selectedName: string | null;
  selectedQty: number | null;
  showErrors: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSearchChange(event.target.value),
    [onSearchChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 1 — Identify
      </h3>
      <p className="text-caption text-muted-foreground">
        Must select existing in-stock item.
      </p>
      <input
        aria-label="Search item"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        onChange={handleSearchChange}
        placeholder="Search name or SKU…"
        value={search}
      />
      <div className="max-h-[220px] overflow-auto rounded-md border border-border">
        {results.length === 0 ? (
          <p className="p-4 text-center text-caption text-muted-foreground">
            No in-stock items match.
          </p>
        ) : (
          results
            .slice(0, 20)
            .map((it) => (
              <PickRow
                item={it}
                key={it.id}
                onSelect={onSelect}
                selected={selectedId === it.id}
              />
            ))
        )}
      </div>
      {showErrors && selectedId === null ? (
        <ValidationMessage message="Select an item." />
      ) : null}
      {selectedName ? (
        <p className="rounded-md bg-muted px-3 py-2 text-caption">
          Selected: <strong>{selectedName}</strong> — Available: {selectedQty}
        </p>
      ) : null}
    </div>
  );
}

function StepReason({
  reason,
  reasonOther,
  showErrors,
  onReasonChange,
  onOtherChange,
}: {
  reason: Reason;
  reasonOther: string;
  showErrors: boolean;
  onReasonChange: (value: Reason) => void;
  onOtherChange: (value: string) => void;
}) {
  const handleReasonChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      onReasonChange(event.target.value as Reason),
    [onReasonChange]
  );
  const handleOtherChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onOtherChange(event.target.value),
    [onOtherChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">Step 2 — Reason</h3>
      <label className="block font-medium text-caption text-foreground">
        Reason
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          onChange={handleReasonChange}
          value={reason}
        >
          {REASONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {reason === "Other" ? (
        <label className="block font-medium text-caption text-foreground">
          Specify reason
          <textarea
            className={cn(
              "mt-1 min-h-[64px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
              showErrors && !reasonOther.trim() && "border-destructive"
            )}
            onChange={handleOtherChange}
            placeholder="Describe reason…"
            value={reasonOther}
          />
        </label>
      ) : null}
    </div>
  );
}

function StepQty({
  qty,
  available,
  batch,
  batches,
  showErrors,
  onQtyChange,
  onBatchChange,
}: {
  qty: string;
  available: number | null;
  batch: string;
  batches: Batch[];
  showErrors: boolean;
  onQtyChange: (value: string) => void;
  onBatchChange: (value: string) => void;
}) {
  const qtyInvalid =
    showErrors &&
    (qty.length === 0 ||
      Number(qty) < 1 ||
      (available !== null && Number(qty) > available));
  const exceedsStock =
    available !== null && qty.length > 0 && Number(qty) > available;

  const handleQtyStep = useCallback(
    (next: number | "") => onQtyChange(next === "" ? "" : String(next)),
    [onQtyChange]
  );
  const handleBatchChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      onBatchChange(event.target.value),
    [onBatchChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 3 — Quantity
      </h3>
      {available === null ? null : (
        <p className="text-caption text-muted-foreground">
          Available: {available}
        </p>
      )}
      <label className="block font-medium text-caption text-foreground">
        Quantity
        <QuantityStepper
          aria-label="Quantity"
          className="mt-1 h-9"
          invalid={qtyInvalid}
          max={available ?? undefined}
          min={1}
          onChange={handleQtyStep}
          placeholder="0"
          value={qty}
        />
        {exceedsStock ? (
          <ValidationMessage
            message={`Cannot exceed available (${available}).`}
          />
        ) : null}
      </label>
      {batches.length > 1 ? (
        <label className="block font-medium text-caption text-foreground">
          Batch (FEFO — earliest expiry first)
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleBatchChange}
            value={batch}
          >
            {batches.map((b) => (
              <option key={b.batch} value={b.batch}>
                {b.batch} — exp {expiryLabel(b.expiry)} · Qty {b.qty}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-caption text-muted-foreground">
            Default is earliest-expiring batch with stock.
          </span>
        </label>
      ) : null}
      {batches.length === 1 ? (
        <p className="rounded-md bg-muted px-3 py-2 text-caption">
          Batch: {batches[0].batch} — exp {expiryLabel(batches[0].expiry)}
        </p>
      ) : null}
    </div>
  );
}

function StepNotes({
  notes,
  onNotesChange,
}: {
  notes: string;
  onNotesChange: (value: string) => void;
}) {
  const handleNotesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onNotesChange(event.target.value),
    [onNotesChange]
  );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">Step 4 — Notes</h3>
      <label className="block font-medium text-caption text-foreground">
        Notes (optional)
        <textarea
          className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          onChange={handleNotesChange}
          placeholder="Optional context…"
          value={notes}
        />
      </label>
    </div>
  );
}

function StepReview({
  itemName,
  reason,
  reasonOther,
  qty,
  batch,
  notes,
  insufficient,
}: {
  itemName: string | null;
  reason: Reason;
  reasonOther: string;
  qty: string;
  batch: string;
  notes: string;
  insufficient: boolean;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">
        Step 5 — Review & Confirm
      </h3>
      <div className="rounded-lg border border-border bg-card p-3 text-sm">
        <p className="font-medium">{itemName ?? "—"}</p>
        <p className="text-caption text-muted-foreground">
          Reason: {reason} {reasonOther ? `— ${reasonOther}` : ""}
        </p>
        <p className="text-caption">
          Qty: {qty} · Batch: {batch || "—"}
        </p>
        {notes ? (
          <p className="mt-1 text-caption text-muted-foreground">
            Notes: {notes}
          </p>
        ) : null}
        {insufficient ? (
          <p className="mt-2 font-medium text-destructive">
            Blocked: insufficient stock.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function StockOutWizard({
  open,
  onOpenChange,
  items,
  initialItemId,
  originRect,
  onConfirm,
}: StockOutWizardProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState<Reason>("Dispensed");
  const [reasonOther, setReasonOther] = useState("");
  const [qty, setQty] = useState("");
  const [batch, setBatch] = useState("");
  const [notes, setNotes] = useState("");
  const [showExpiryConfirm, setShowExpiryConfirm] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  const sortedBatches = useMemo(() => {
    if (!selectedItem) {
      return [];
    }
    return [...selectedItem.batches].sort(
      (a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
    );
  }, [selectedItem]);

  useEffect(() => {
    if (open) {
      setStep(1);
      setDirection(1);
      setAttempted(false);
      setShowExpiryConfirm(false);
      if (initialItemId) {
        setSelectedId(initialItemId);
        const it = items.find((i) => i.id === initialItemId);
        if (it && it.batches.length > 0) {
          const fefo = [...it.batches].sort(
            (a, b) =>
              new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
          );
          const withQty = fefo.find((b) => b.qty > 0);
          setBatch(withQty ? withQty.batch : fefo[0].batch);
        } else {
          setBatch("");
        }
      } else {
        setSelectedId(null);
        setBatch("");
      }
      setReason("Dispensed");
      setReasonOther("");
      setQty("");
      setNotes("");
      setSearch("");
    }
  }, [open, initialItemId, items]);

  useEffect(() => {
    if (selectedItem && sortedBatches.length > 0 && !batch) {
      const withQty = sortedBatches.find((b) => b.qty > 0);
      setBatch(withQty ? withQty.batch : sortedBatches[0].batch);
    }
  }, [selectedItem, sortedBatches, batch]);

  const draft = useMemo<StockOutDraft>(
    () => ({
      batch,
      notes: notes.trim(),
      qty: Number(qty),
      reason,
      reasonOther: reasonOther.trim(),
      selectedId,
    }),
    [batch, notes, qty, reason, reasonOther, selectedId]
  );

  const available = selectedItem?.qty ?? null;

  const submit = useCallback(() => {
    if (!selectedItem) {
      return;
    }
    if (draft.qty > selectedItem.qty) {
      toast.error(`Insufficient stock. Only ${selectedItem.qty} available.`);
      return;
    }
    onConfirm({
      batch: draft.batch,
      itemId: selectedItem.id,
      notes: draft.notes,
      qty: draft.qty,
      reason: draft.reason,
      reasonOther: draft.reasonOther || undefined,
    });
    toast.success(`Dispensed: ${selectedItem.name} –${qty}`);
    onOpenChange(false);
  }, [draft, onConfirm, onOpenChange, qty, selectedItem]);

  const goNext = useCallback(() => {
    if (step === 2 && reason === "Disposed (expired)" && !showExpiryConfirm) {
      setShowExpiryConfirm(true);
      return;
    }
    if (!validateStep(step, draft, available)) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    setShowExpiryConfirm(false);
    if (step < 5) {
      setDirection(1);
      setStep((s) => s + 1);
      return;
    }
    submit();
  }, [available, draft, reason, showExpiryConfirm, step, submit]);

  const goBack = useCallback(() => {
    if (showExpiryConfirm) {
      setShowExpiryConfirm(false);
      return;
    }
    if (step > 1) {
      setDirection(-1);
      setStep((s) => s - 1);
      setAttempted(false);
    }
  }, [showExpiryConfirm, step]);

  const handleConfirmExpiry = useCallback(() => {
    setShowExpiryConfirm(false);
    setDirection(1);
    setStep(3);
  }, []);

  const handleDismissExpiry = useCallback(() => {
    setShowExpiryConfirm(false);
  }, []);

  const handleCancel = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handleNext = useCallback(() => goNext(), [goNext]);

  const filteredForPick = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return items.filter((i) => i.qty > 0);
    }
    return items.filter(
      (i) =>
        `${i.name} ${i.displayName} ${i.sku}`.toLowerCase().includes(q) &&
        i.qty > 0
    );
  }, [items, search]);

  const dirty = Boolean(selectedId || reasonOther || qty || notes);

  return (
    <WizardShell
      backLabel={showExpiryConfirm ? "Cancel" : "Back"}
      canBack={step > 1 || showExpiryConfirm}
      canNext={canAdvance(step, draft, available, showExpiryConfirm)}
      direction={direction}
      dirty={dirty}
      nextLabel={step === 5 ? "Confirm Stock Out" : "Next →"}
      onBack={goBack}
      onCancel={handleCancel}
      onNext={handleNext}
      onOpenChange={onOpenChange}
      open={open}
      originRect={originRect}
      step={step}
      title="Stock Out"
      totalSteps={5}
    >
      {showExpiryConfirm ? (
        <ExpiryConfirmPanel
          onConfirmContinue={handleConfirmExpiry}
          onGoBack={handleDismissExpiry}
        />
      ) : null}

      {step === 1 ? (
        <StepPick
          onSearchChange={setSearch}
          onSelect={setSelectedId}
          results={filteredForPick}
          search={search}
          selectedId={selectedId}
          selectedName={selectedItem?.name ?? null}
          selectedQty={available}
          showErrors={attempted}
        />
      ) : null}

      {step === 2 ? (
        <StepReason
          onOtherChange={setReasonOther}
          onReasonChange={setReason}
          reason={reason}
          reasonOther={reasonOther}
          showErrors={attempted}
        />
      ) : null}

      {step === 3 ? (
        <StepQty
          available={available}
          batch={batch}
          batches={sortedBatches}
          onBatchChange={setBatch}
          onQtyChange={setQty}
          qty={qty}
          showErrors={attempted}
        />
      ) : null}

      {step === 4 ? <StepNotes notes={notes} onNotesChange={setNotes} /> : null}

      {step === 5 ? (
        <StepReview
          batch={batch}
          insufficient={available !== null && Number(qty) > available}
          itemName={selectedItem?.name ?? null}
          notes={notes}
          qty={qty}
          reason={reason}
          reasonOther={reasonOther}
        />
      ) : null}
    </WizardShell>
  );
}
