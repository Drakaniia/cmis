import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import * as React from "react";
import { toast } from "sonner";
import { expiryLabel } from "../mock";
import type { InventoryItem } from "../types";
import { WizardShell } from "./wizard-shell";

type Reason =
  | "Dispensed"
  | "Disposed (expired)"
  | "Damaged"
  | "Transferred"
  | "Other";

export function StockOutWizard({
  open,
  onOpenChange,
  items,
  initialItemId,
  originRect,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: InventoryItem[];
  initialItemId?: string | null;
  originRect?: DOMRect | null;
  onConfirm: (payload: {
    itemId: string;
    reason: Reason;
    reasonOther?: string;
    qty: number;
    batch: string;
    notes: string;
  }) => void;
}) {
  const [step, setStep] = React.useState(1);
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [reason, setReason] = React.useState<Reason>("Dispensed");
  const [reasonOther, setReasonOther] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [batch, setBatch] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [showExpiryConfirm, setShowExpiryConfirm] = React.useState(false);
  const [attempted, setAttempted] = React.useState(false);

  const selectedItem = React.useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  const sortedBatches = React.useMemo(() => {
    if (!selectedItem) {
      return [];
    }
    return [...selectedItem.batches].sort(
      (a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
    );
  }, [selectedItem]);

  React.useEffect(() => {
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

  React.useEffect(() => {
    if (selectedItem && sortedBatches.length > 0 && !batch) {
      const withQty = sortedBatches.find((b) => b.qty > 0);
      setBatch(withQty ? withQty.batch : sortedBatches[0].batch);
    }
  }, [selectedItem, sortedBatches, batch]);

  function validate(s: number): boolean {
    if (s === 1) {
      return !!selectedId;
    }
    if (s === 2) {
      if (!reason) {
        return false;
      }
      if (reason === "Other" && !reasonOther.trim()) {
        return false;
      }
      return true;
    }
    if (s === 3) {
      if (!selectedItem) {
        return false;
      }
      const n = Number(qty);
      return Number.isFinite(n) && n >= 1 && n <= selectedItem.qty && !!batch;
    }
    return true;
  }

  function goNext() {
    if (step === 2 && reason === "Disposed (expired)" && !showExpiryConfirm) {
      setShowExpiryConfirm(true);
      return;
    }
    if (!validate(step)) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    setShowExpiryConfirm(false);
    if (step < 5) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      if (!selectedItem) {
        return;
      }
      if (Number(qty) > selectedItem.qty) {
        toast.error(`Insufficient stock. Only ${selectedItem.qty} available.`);
        return;
      }
      onConfirm({
        batch,
        itemId: selectedItem.id,
        notes: notes.trim(),
        qty: Number(qty),
        reason,
        reasonOther: reasonOther.trim() || undefined,
      });
      toast.success(`Dispensed: ${selectedItem.name} –${qty}`);
      onOpenChange(false);
    }
  }

  function goBack() {
    if (showExpiryConfirm) {
      setShowExpiryConfirm(false);
      return;
    }
    if (step > 1) {
      setDirection(-1);
      setStep((s) => s - 1);
      setAttempted(false);
    }
  }

  const filteredForPick = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return items.filter((i) => i.qty > 0);
    }
    return items.filter(
      (i) => `${i.name} ${i.sku}`.toLowerCase().includes(q) && i.qty > 0
    );
  }, [items, search]);

  const dirty = Boolean(selectedId || reasonOther || qty || notes);

  return (
    <WizardShell
      backLabel={showExpiryConfirm ? "Cancel" : "Back"}
      canBack={step > 1 || showExpiryConfirm}
      canNext={
        validate(step) ||
        (step === 2 && reason === "Disposed (expired)" && !showExpiryConfirm)
      }
      direction={direction}
      dirty={dirty}
      nextLabel={step === 5 ? "Confirm Stock Out" : "Next →"}
      onBack={goBack}
      onCancel={() => onOpenChange(false)}
      onNext={goNext}
      onOpenChange={onOpenChange}
      open={open}
      originRect={originRect}
      step={step}
      title="Stock Out"
      totalSteps={5}
    >
      {showExpiryConfirm ? (
        <div className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-3 text-sm">
          <p className="font-medium">Expired stock — confirm disposal?</p>
          <p className="text-caption text-muted-foreground">
            You selected Disposed (expired). Confirm to continue.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                setShowExpiryConfirm(false);
                setDirection(1);
                setStep(3);
              }}
              size="sm"
            >
              Confirm, continue
            </Button>
            <Button
              onClick={() => setShowExpiryConfirm(false)}
              size="sm"
              variant="outline"
            >
              Go back
            </Button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or SKU…"
            value={search}
          />
          <div className="max-h-[220px] overflow-auto rounded-md border border-border">
            {filteredForPick.length === 0 ? (
              <p className="p-4 text-center text-caption text-muted-foreground">
                No in-stock items match.
              </p>
            ) : (
              filteredForPick.slice(0, 20).map((it) => (
                <button
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted",
                    selectedId === it.id && "bg-accent text-accent-foreground"
                  )}
                  key={it.id}
                  onClick={() => setSelectedId(it.id)}
                  type="button"
                >
                  <span className="font-medium">{it.name}</span>
                  <span className="text-caption text-muted-foreground">
                    Qty: {it.qty} · {it.sku}
                  </span>
                </button>
              ))
            )}
          </div>
          {attempted && !selectedId ? (
            <span className="text-caption text-destructive">
              Select an item.
            </span>
          ) : null}
          {selectedItem ? (
            <p className="rounded-md bg-muted px-3 py-2 text-caption">
              Selected: <strong>{selectedItem.name}</strong> — Available:{" "}
              {selectedItem.qty}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">
            Step 2 — Reason
          </h3>
          <label className="block font-medium text-caption text-foreground">
            Reason
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              onChange={(e) => setReason(e.target.value as Reason)}
              value={reason}
            >
              <option value="Dispensed">Dispensed</option>
              <option value="Disposed (expired)">Disposed (expired)</option>
              <option value="Damaged">Damaged</option>
              <option value="Transferred">Transferred</option>
              <option value="Other">Other</option>
            </select>
          </label>
          {reason === "Other" ? (
            <label className="block font-medium text-caption text-foreground">
              Specify reason
              <textarea
                className={cn(
                  "mt-1 min-h-[64px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                  attempted && !reasonOther.trim() && "border-destructive"
                )}
                onChange={(e) => setReasonOther(e.target.value)}
                placeholder="Describe reason…"
                value={reasonOther}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">
            Step 3 — Quantity
          </h3>
          {selectedItem ? (
            <p className="text-caption text-muted-foreground">
              Available: {selectedItem.qty}
            </p>
          ) : null}
          <label className="block font-medium text-caption text-foreground">
            Quantity
            <input
              className={cn(
                "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring",
                attempted &&
                  (!qty ||
                    Number(qty) < 1 ||
                    (selectedItem && Number(qty) > selectedItem.qty)) &&
                  "border-destructive"
              )}
              max={selectedItem?.qty ?? undefined}
              min={1}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              type="number"
              value={qty}
            />
            {selectedItem && qty && Number(qty) > selectedItem.qty ? (
              <span className="mt-1 block text-caption text-destructive">
                Cannot exceed available ({selectedItem.qty}).
              </span>
            ) : null}
          </label>
          {sortedBatches.length > 1 ? (
            <label className="block font-medium text-caption text-foreground">
              Batch (FEFO — earliest expiry first)
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                onChange={(e) => setBatch(e.target.value)}
                value={batch}
              >
                {sortedBatches.map((b) => (
                  <option key={b.batch} value={b.batch}>
                    {b.batch} — exp {expiryLabel(b.expiry)} · Qty {b.qty}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-caption text-muted-foreground">
                Default is earliest-expiring batch with stock.
              </span>
            </label>
          ) : sortedBatches.length === 1 ? (
            <p className="rounded-md bg-muted px-3 py-2 text-caption">
              Batch: {sortedBatches[0].batch} — exp{" "}
              {expiryLabel(sortedBatches[0].expiry)}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">
            Step 4 — Notes
          </h3>
          <label className="block font-medium text-caption text-foreground">
            Notes (optional)
            <textarea
              className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context…"
              value={notes}
            />
          </label>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">
            Step 5 — Review & Confirm
          </h3>
          <div className="rounded-lg border border-border bg-card p-3 text-sm">
            <p className="font-medium">{selectedItem?.name ?? "—"}</p>
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
            {selectedItem && Number(qty) > selectedItem.qty ? (
              <p className="mt-2 font-medium text-destructive">
                Blocked: insufficient stock.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </WizardShell>
  );
}
