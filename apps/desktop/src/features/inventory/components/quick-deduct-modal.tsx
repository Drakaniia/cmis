import { Button } from "@cmis/ui/components/button";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { AlertTriangle, Info, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { expiryLabel } from "@/features/inventory/domain/expiry";
import type { InventoryItem } from "@/features/inventory/types";
import { parseQuantity } from "@/features/requests/hooks/use-create-requests";
import { defaultUnitForItem } from "@/features/requests/request-units";
import { materializeEnter, sheetSpring } from "@/lib/motion";
import { useQuickDeduct, useQuickDeductPlan } from "../hooks/use-quick-deduct";

/**
 * F1/F2/F6 — Quick Stock Deduct, the one-action counter hand-over.
 *
 * One item, one number, one confirm: no queue card to walk through four columns,
 * no five-step stock-out wizard. The reason is always "Dispensed", the batch is
 * chosen FEFO, the unit and category come from the item, and the requestor stays
 * blank — all of that is what makes it one action, and all of it is recorded.
 *
 * The plan line is read-only but not decorative: FEFO means staff no longer pick
 * a batch, so this is where they see which one leaves the shelf and what is left
 * afterwards (mirroring the queue's "confirmation showing the plan", companion
 * F8), including when a split takes from two batches.
 *
 * The surface is one state — no steps, no progress indicator (spec §8).
 */

const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const LABEL_CLASS = "block font-medium text-caption text-foreground";
const HINT_CLASS = "mt-1 block text-caption text-muted-foreground";

/** Stable module-level handler — no per-render closure. */
function preventDefault(event: ReactMouseEvent) {
  event.preventDefault();
}

/**
 * Filtering is name, display name and SKU, matching the wizard's step 1 idea for
 * items that can actually be taken (`items` is already in-stock only). It is
 * deliberately *not* a way to type a medicine: the deduction is keyed to the
 * item's id, so an unmatched string can never become a deduction (D6).
 */
function matchItems(
  items: readonly InventoryItem[],
  query: string
): InventoryItem[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return items.slice(0, 8);
  }
  const matches: InventoryItem[] = [];
  for (const item of items) {
    if (
      item.displayName.toLowerCase().includes(needle) ||
      item.name.toLowerCase().includes(needle) ||
      item.sku.toLowerCase().includes(needle)
    ) {
      matches.push(item);
      if (matches.length === 8) {
        break;
      }
    }
  }
  return matches;
}

function ItemOption({
  active,
  item,
  onPick,
}: {
  active: boolean;
  item: InventoryItem;
  onPick: (item: InventoryItem) => void;
}) {
  const handleClick = useCallback(() => onPick(item), [item, onPick]);

  return (
    <button
      aria-selected={active}
      className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
      onClick={handleClick}
      onMouseDown={preventDefault}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <span className="min-w-0 truncate">{item.displayName}</span>
      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
        {item.qty} on hand
      </span>
    </button>
  );
}

function ItemCombobox({
  dbReady,
  id,
  items,
  onClear,
  onPick,
  selected,
}: {
  dbReady: boolean | null;
  id: string;
  items: readonly InventoryItem[];
  onClear: () => void;
  onPick: (item: InventoryItem) => void;
  selected: InventoryItem | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `${id}-listbox`;

  const matches = useMemo(() => matchItems(items, query), [items, query]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      setActive(0);
      setOpen(true);
      // Typing means "I am looking for something else" — the previous selection
      // must not stay armed behind the text.
      onClear();
    },
    [onClear]
  );

  const handlePick = useCallback(
    (item: InventoryItem) => {
      onPick(item);
      setQuery("");
      setOpen(false);
    },
    [onPick]
  );

  const handleFocus = useCallback(() => setOpen(true), []);
  const handleBlur = useCallback(() => setOpen(false), []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && open) {
        // Close the list, not the dialog.
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        setActive((index) => Math.min(index + 1, matches.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter" && open) {
        const chosen = matches[active];
        if (chosen) {
          event.preventDefault();
          handlePick(chosen);
        }
      }
    },
    [active, handlePick, matches, open]
  );

  return (
    <div className="relative">
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        className={FIELD_CLASS}
        id={id}
        onBlur={handleBlur}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={
          dbReady === false
            ? "This build has no database"
            : "Search an item by name or SKU…"
        }
        role="combobox"
        type="text"
        value={selected ? selected.displayName : query}
      />
      {open && matches.length > 0 ? (
        <div
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg"
          id={listId}
          role="listbox"
        >
          {matches.map((item, index) => (
            <ItemOption
              active={index === active}
              item={item}
              key={item.id}
              onPick={handlePick}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** "3 tabs from batch B-4412 (exp 12 Jan 2027)" or the batch-less variant. */
function describeTake(
  item: InventoryItem,
  plan: {
    batches: { batch: string; expiry: string }[];
    missingBatch: boolean;
    take: number;
    unit: string;
  }
): string {
  const suffix = `${plan.take} ${plan.unit} of ${item.displayName}`;
  if (plan.missingBatch) {
    return `${suffix} off the item total — no batch is recorded`;
  }
  const from = plan.batches
    .map((take) => `batch ${take.batch} (exp ${expiryLabel(take.expiry)})`)
    .join(" and ");
  return `${suffix} from ${from}`;
}

function PlanLine({
  item,
  pending,
  plan,
}: {
  item: InventoryItem | null;
  pending: boolean;
  plan: ReturnType<typeof useQuickDeductPlan>["data"] | undefined;
}) {
  if (item === null) {
    return (
      <p className="mt-1 text-muted-foreground text-sm">
        Pick an item to see which batch leaves the shelf.
      </p>
    );
  }
  if (plan === undefined || plan === null) {
    return (
      <p className="mt-1 text-muted-foreground text-sm">
        {pending ? "Checking what is on the shelf…" : "—"}
      </p>
    );
  }
  if (!plan.ok) {
    return (
      <p className="mt-1 flex items-start gap-1.5 text-destructive text-sm">
        <AlertTriangle aria-hidden className="mt-0.5 size-3.5" />
        {plan.error.message}
      </p>
    );
  }
  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-sm">{describeTake(item, plan.plan)}</p>
      <p className="text-caption text-muted-foreground">
        {plan.plan.leftAfter} {plan.plan.unit} left in stock afterwards ·{" "}
        {item.category}
      </p>
    </div>
  );
}

/**
 * The one thing standing in the way, said inline rather than only on click
 * (spec §8): the reason the button is disabled is visible next to the fields.
 */
function blockedReasonFor(input: {
  dbReady: boolean | null;
  item: InventoryItem | null;
  pending: boolean;
  plan: ReturnType<typeof useQuickDeductPlan>["data"] | undefined;
  quantity: number | null;
}): string | null {
  if (input.dbReady === false) {
    return "This build has no database, so a deduction cannot be recorded here.";
  }
  if (!input.item) {
    return "Pick an item to deduct.";
  }
  if (input.quantity === null) {
    return "Quantity must be a whole number greater than zero.";
  }
  if (input.pending) {
    return "Checking what is on the shelf…";
  }
  if (input.plan && !input.plan.ok) {
    return input.plan.error.message;
  }
  return null;
}

/** The confirm button names the outcome (spec §8). */
function confirmLabelFor(
  item: InventoryItem | null,
  quantity: number | null,
  unit: string
): string {
  if (!item) {
    return "Deduct stock";
  }
  if (quantity === null) {
    return "Deduct";
  }
  return `Deduct ${quantity} ${unit}`;
}

export function QuickDeductModal({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { dbReady, deduct, isLoadingItems, items } = useQuickDeduct();
  const fieldId = useId();

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [qty, setQty] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const firstFieldRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Every open starts clean, and closing hands focus back where it came from.
  useEffect(() => {
    if (open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setItem(null);
      setQty("1");
      setSubmitting(false);
      setError(null);
      setAnnouncement("");
      // §1 Response: the item field is the only thing that ever needs typing,
      // so focus lands there on open.
      const focusTimer = window.setTimeout(() => {
        firstFieldRef.current?.querySelector("input")?.focus();
      }, 0);
      return () => window.clearTimeout(focusTimer);
    }
    returnFocusRef.current?.focus();
  }, [open]);

  const quantity = parseQuantity(qty);
  const planQuery = useQuickDeductPlan(item, quantity ?? 0);
  const plan = planQuery.data;

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, open]);

  const handlePick = useCallback((picked: InventoryItem) => {
    setItem(picked);
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setItem(null);
    setError(null);
  }, []);

  const handleQtyChange = useCallback((value: number | "") => {
    setQty(value === "" ? "" : String(value));
    setError(null);
  }, []);

  const blockedReason = blockedReasonFor({
    dbReady,
    item,
    pending: planQuery.isPending,
    plan,
    quantity,
  });

  const canConfirm =
    dbReady === true &&
    !submitting &&
    item !== null &&
    quantity !== null &&
    plan?.ok === true;

  const unit = item ? defaultUnitForItem(item) : "";

  const handleSubmit = useCallback(async () => {
    if (!(canConfirm && item && quantity !== null)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await deduct({ item, qty: quantity });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setAnnouncement(
        `Deducted ${quantity} ${outcome.plan.unit} of ${item.displayName}. ${outcome.plan.leftAfter} left.`
      );
      handleClose();
    } catch {
      // A missing database or an item deleted meanwhile surfaces here instead of
      // a success toast (E14/E15).
      setError("Could not record the deduction. Nothing was written.");
    } finally {
      setSubmitting(false);
    }
  }, [canConfirm, deduct, handleClose, item, quantity]);

  const handleSubmitClick = useCallback(() => {
    handleSubmit().catch(() => undefined);
  }, [handleSubmit]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSubmitClick();
      }
    },
    [handleSubmitClick]
  );

  const buttonLabel = submitting
    ? "Deducting…"
    : confirmLabelFor(item, quantity, unit);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <p aria-live="polite" className="sr-only" role="status">
            {announcement}
          </p>
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="fixed inset-0 z-[70] bg-black/32"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
            transition={{ duration: 0.18 }}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
            {/* §12 material → §4 materializeEnter, §7 anchored centre origin. */}
            <motion.div
              animate="animate"
              aria-labelledby="quick-deduct-heading"
              aria-modal="true"
              className="surface-frosted flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              onKeyDown={handleKeyDown}
              role="dialog"
              style={{
                transformOrigin: "center center",
                willChange: "transform, opacity, filter",
              }}
              transition={sheetSpring}
              variants={materializeEnter}
            >
              <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-4 py-3">
                <h2
                  className="font-semibold text-foreground text-sm"
                  id="quick-deduct-heading"
                >
                  Deduct stock
                </h2>
                <Button
                  aria-label="Close"
                  className="press-feedback"
                  onClick={handleClose}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
                <div ref={firstFieldRef}>
                  <label className={LABEL_CLASS} htmlFor={`${fieldId}-item`}>
                    Item
                  </label>
                  <ItemCombobox
                    dbReady={dbReady}
                    id={`${fieldId}-item`}
                    items={items}
                    onClear={handleClear}
                    onPick={handlePick}
                    selected={item}
                  />
                  {isLoadingItems ? (
                    <span className={HINT_CLASS}>Loading the item list…</span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className={LABEL_CLASS}>Quantity</span>
                    <div className="mt-1">
                      <QuantityStepper
                        aria-label="Quantity"
                        invalid={quantity === null}
                        min={1}
                        onChange={handleQtyChange}
                        value={qty}
                      />
                    </div>
                  </div>
                  <div>
                    <span className={LABEL_CLASS}>Unit</span>
                    <p className="mt-2 text-muted-foreground text-sm">
                      {item ? unit : "—"}
                      <span className="ml-1 text-caption">(from the item)</span>
                    </p>
                  </div>
                </div>

                {/* Read-only plan (F2): what will be taken, from where, and what
                    is left. Mirrors the queue's hand-over confirmation. */}
                <div className="rounded-md border border-border/60 bg-card p-3">
                  <p className="flex items-center gap-1.5 font-medium text-caption text-muted-foreground uppercase tracking-widest">
                    <Info aria-hidden className="size-3.5" />
                    This will deduct
                  </p>
                  <PlanLine
                    item={item}
                    pending={planQuery.isPending}
                    plan={plan}
                  />
                </div>

                {blockedReason ? (
                  <p
                    className="text-caption text-muted-foreground"
                    role="status"
                  >
                    {blockedReason}
                  </p>
                ) : null}
                {error ? (
                  <p className="text-caption text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 border-border/50 border-t px-4 py-3">
                <p className="text-caption text-muted-foreground">
                  Ctrl/⌘ + Enter to deduct
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    className="press-feedback"
                    onClick={handleClose}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="press-feedback"
                    disabled={!canConfirm}
                    onClick={handleSubmitClick}
                    size="sm"
                  >
                    {buttonLabel}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
