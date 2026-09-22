import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, X } from "lucide-react";
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
import { toast } from "sonner";

import { toBaseUnits } from "@/features/inventory/domain/pack-size";
import type { InventoryItem } from "@/features/inventory/types";
import { materializeEnter, sheetSpring } from "@/lib/motion";
import {
  matchInventoryItem,
  parseQuantity,
  type RequestDraftRow,
  rowProblem,
  suggestInventoryItems,
  useCreateRequests,
} from "../hooks/use-create-requests";
import {
  defaultUnitForItem,
  REQUEST_UNITS,
  requestUnitsFor,
} from "../request-units";

/**
 * F1–F5 — the New Request form, mounted at the app root so `Ctrl+N` / `⌘N` opens
 * it from any screen without navigating away from it.
 *
 * Several medicine rows in one submission produce several cards (D5), because a
 * request holds exactly one medicine today. Each row is validated against the
 * inventory list: an unknown medicine blocks (D11 — there would be nothing to
 * deduct at hand-over), while a quantity larger than the shelf only warns (D18 —
 * the hand-over can be partial).
 */

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const LABEL_CLASS = "block font-medium text-caption text-foreground";
const HINT_CLASS = "mt-1 block text-caption text-muted-foreground";
const ERROR_CLASS = "mt-1 block text-caption text-destructive";
const ROW_CLASS = "rounded-lg border border-border/60 bg-card/60 p-3";

let rowCounter = 0;

function newRow(): RequestDraftRow {
  rowCounter += 1;
  return { key: `row-${rowCounter}`, medicine: "", qty: "", unit: "unit" };
}

/** One autocomplete row. Its own component so the click handler stays stable. */
function SuggestionOption({
  active,
  item,
  onPick,
}: {
  active: boolean;
  item: InventoryItem;
  onPick: (item: InventoryItem) => void;
}) {
  const handleMouseDown = useCallback(
    (event: ReactMouseEvent) => event.preventDefault(),
    []
  );
  const handleClick = useCallback(() => onPick(item), [item, onPick]);

  return (
    <button
      aria-selected={active}
      className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
      onClick={handleClick}
      // Keeps focus on the input so the click lands before blur closes the list.
      onMouseDown={handleMouseDown}
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

function MedicineCombobox({
  id,
  items,
  onPick,
  onValueChange,
  value,
}: {
  id: string;
  items: readonly InventoryItem[];
  onPick: (item: InventoryItem) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `${id}-listbox`;
  const suggestions = useMemo(
    () => suggestInventoryItems(items, value),
    [items, value]
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onValueChange(event.target.value);
      setActive(0);
      setOpen(true);
    },
    [onValueChange]
  );

  const handlePick = useCallback(
    (item: InventoryItem) => {
      onPick(item);
      setOpen(false);
    },
    [onPick]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && open) {
        // Close the list, not the dialog — stop before the modal's Escape.
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (suggestions.length === 0) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        setActive((index) => Math.min(index + 1, suggestions.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter" && open) {
        const chosen = suggestions[active];
        if (chosen) {
          event.preventDefault();
          handlePick(chosen);
        }
      }
    },
    [active, handlePick, open, suggestions]
  );

  const handleBlur = useCallback(() => setOpen(false), []);
  const handleFocus = useCallback(() => setOpen(true), []);

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
        placeholder="Start typing a medicine…"
        role="combobox"
        type="text"
        value={value}
      />
      {open && suggestions.length > 0 ? (
        // The options are the listbox's own children, as the role requires.
        <div
          className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg"
          id={listId}
          role="listbox"
        >
          {suggestions.map((item, index) => (
            <SuggestionOption
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

function RequestRow({
  canRemove,
  items,
  onChange,
  onRemove,
  row,
}: {
  canRemove: boolean;
  items: readonly InventoryItem[];
  onChange: (key: string, patch: Partial<RequestDraftRow>) => void;
  onRemove: (key: string) => void;
  row: RequestDraftRow;
}) {
  // Hooks must run unconditionally, so generate the ids at the top of the row.
  const id = useId();
  const matched = matchInventoryItem(items, row.medicine);
  const problem = rowProblem(row, items);
  const qty = parseQuantity(row.qty);

  // The item's own units lead; the fixed list is only for a row with no item
  // picked yet (F5/D8). The current value is always kept selectable so editing
  // a legacy row does not silently change its unit.
  const units = useMemo(() => {
    const options = matched ? requestUnitsFor(matched) : [...REQUEST_UNITS];
    if (row.unit !== "" && !options.includes(row.unit)) {
      options.push(row.unit);
    }
    return options;
  }, [matched, row.unit]);

  // The quantity is converted before it is compared, so `2 box` on a 10/box item
  // warns against 100 sachets, not against 2 (G3/F5).
  const baseQty =
    matched && qty !== null
      ? toBaseUnits(qty, row.unit, {
          form: matched.form,
          packQty: matched.packQty ?? 0,
          packUnit: matched.packUnit ?? "",
        })
      : null;
  const shortfall =
    matched && qty !== null && baseQty !== null && baseQty > matched.qty
      ? `${matched.qty} on hand — the hand-over will be partial and the rest stays in Ready to Claim.`
      : null;
  const unconvertible =
    matched && qty !== null && baseQty === null
      ? `${qty} ${row.unit} cannot be converted — this item has no pack size recorded. Dispense in ${requestUnitsFor(matched)[0]} instead, or set the pack size in Inventory.`
      : null;

  const handleMedicineChange = useCallback(
    (medicine: string) => onChange(row.key, { medicine }),
    [onChange, row.key]
  );

  const handlePick = useCallback(
    (item: InventoryItem) => {
      // The stored label becomes the request's text — it is what every later
      // stock check matches against — and the unit starts from the item's form
      // (D24) while staying editable.
      onChange(row.key, {
        medicine: item.displayName,
        unit: defaultUnitForItem(item),
      });
    },
    [onChange, row.key]
  );

  const handleQtyChange = useCallback(
    (value: number | "") =>
      onChange(row.key, { qty: value === "" ? "" : String(value) }),
    [onChange, row.key]
  );

  const handleUnitChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      onChange(row.key, { unit: event.target.value }),
    [onChange, row.key]
  );

  const handleRemove = useCallback(
    () => onRemove(row.key),
    [onRemove, row.key]
  );

  return (
    <li className={ROW_CLASS}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label className={LABEL_CLASS} htmlFor={`${id}-medicine`}>
            Medicine
          </label>
          <MedicineCombobox
            id={`${id}-medicine`}
            items={items}
            onPick={handlePick}
            onValueChange={handleMedicineChange}
            value={row.medicine}
          />
        </div>
        {canRemove ? (
          <Button
            aria-label="Remove this item"
            className="press-feedback mt-6"
            onClick={handleRemove}
            size="icon-sm"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <span className={LABEL_CLASS}>Quantity</span>
          <div className="mt-1">
            <QuantityStepper
              aria-label="Quantity"
              invalid={problem !== null}
              min={1}
              onChange={handleQtyChange}
              value={row.qty}
            />
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor={`${id}-unit`}>
            Unit
          </label>
          <select
            className={FIELD_CLASS}
            id={`${id}-unit`}
            onChange={handleUnitChange}
            value={row.unit}
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={LABEL_CLASS}>Category</span>
          <p className="mt-1 truncate text-muted-foreground text-sm">
            {matched ? matched.category : "—"}
          </p>
        </div>
      </div>

      {problem ? <p className={ERROR_CLASS}>{problem}</p> : null}
      {problem === null && unconvertible ? (
        <p className={ERROR_CLASS} role="alert">
          {unconvertible}
        </p>
      ) : null}
      {problem === null && unconvertible === null && shortfall ? (
        <p className={HINT_CLASS}>{shortfall}</p>
      ) : null}
    </li>
  );
}

export function NewRequestModal({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { create, dbReady, isLoadingItems, items } = useCreateRequests();

  const [rows, setRows] = useState<RequestDraftRow[]>(() => [newRow()]);
  const [name, setName] = useState("");
  const [requestorId, setRequestorId] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [startReady, setStartReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const firstFieldRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Reset on open, and hand focus to the first field while remembering where it
  // came from so closing returns it (F1).
  useEffect(() => {
    if (!open) {
      return;
    }
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setRows([newRow()]);
    setName("");
    setRequestorId("");
    setEmail("");
    setReason("");
    setStartReady(false);
    setSubmitting(false);
    const focusTimer = window.setTimeout(() => {
      firstFieldRef.current?.querySelector("input")?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (open) {
      return;
    }
    returnFocusRef.current?.focus();
  }, [open]);

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

  const updateRow = useCallback(
    (key: string, patch: Partial<RequestDraftRow>) => {
      setRows((prev) =>
        prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const removeRow = useCallback((key: string) => {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((row) => row.key !== key)
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, newRow()]);
  }, []);

  const problems = rows.filter((row) => rowProblem(row, items) !== null);
  const blocked = problems.length > 0 || rows.length === 0;
  const cannotSave = dbReady === false;

  const handleSubmit = useCallback(async () => {
    // `dbReady` is null until the probe finishes — submitting then could write
    // nothing and still report success.
    if (blocked || submitting || dbReady !== true) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await create({
        reason: reason.trim(),
        requestor: { email, id: requestorId, name },
        rows,
        startReady,
      });
      if (result.created.length === 0) {
        toast.error("No requests were created", {
          description: "Check the items and quantities, then try again.",
        });
        return;
      }
      const count = result.created.length;
      toast.success(`${count} request${count === 1 ? "" : "s"} created`, {
        action: {
          label: "View on board",
          onClick: () => {
            navigate({ to: "/admin/requests" }).catch(() => undefined);
          },
        },
        description: result.created.map((item) => item.id).join(", "),
      });
      handleClose();
    } catch {
      // Without a database the write cannot land; say so rather than pretending
      // it did (E15).
      toast.error("Could not save the request", {
        description:
          "This build has no database — requests cannot be stored here.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    blocked,
    create,
    dbReady,
    email,
    handleClose,
    navigate,
    name,
    reason,
    requestorId,
    rows,
    startReady,
    submitting,
  ]);

  const handleSubmitKey = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleReadyChange = useCallback(
    (value: boolean | "indeterminate") => setStartReady(value === true),
    []
  );

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    []
  );
  const handleIdChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setRequestorId(event.target.value),
    []
  );
  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value),
    []
  );
  const handleReasonChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value),
    []
  );

  const count = rows.length;

  return (
    <AnimatePresence>
      {open ? (
        <>
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
            <motion.div
              animate="animate"
              aria-labelledby="new-request-heading"
              aria-modal="true"
              className="surface-frosted flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border/50 shadow-xl"
              exit="exit"
              initial={reduceMotion ? "animate" : "initial"}
              onKeyDown={handleSubmitKey}
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
                  id="new-request-heading"
                >
                  New request
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
                {cannotSave ? (
                  <p
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-caption text-destructive"
                    role="alert"
                  >
                    This build has no database, so requests cannot be saved
                    here.
                  </p>
                ) : null}

                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
                      Items
                    </h3>
                    <Button
                      className="press-feedback"
                      onClick={addRow}
                      size="xs"
                      variant="ghost"
                    >
                      <Plus className="size-3.5" />
                      Add another item
                    </Button>
                  </div>

                  <div ref={firstFieldRef}>
                    <ul className="space-y-2">
                      {rows.map((row) => (
                        <RequestRow
                          canRemove={count > 1}
                          items={items}
                          key={row.key}
                          onChange={updateRow}
                          onRemove={removeRow}
                          row={row}
                        />
                      ))}
                    </ul>
                  </div>

                  {isLoadingItems ? (
                    <p className={HINT_CLASS}>Loading the inventory list…</p>
                  ) : null}
                  {count > 1 ? (
                    <p className={HINT_CLASS}>
                      Each item becomes its own request card.
                    </p>
                  ) : null}
                </section>

                <section className="space-y-2">
                  <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
                    Requestor — optional
                  </h3>
                  <p className="text-caption text-muted-foreground">
                    Leave blank for a walk-in; the card will read “Walk-in”.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className={LABEL_CLASS}>
                      Name
                      <input
                        className={FIELD_CLASS}
                        onChange={handleNameChange}
                        type="text"
                        value={name}
                      />
                    </label>
                    <label className={LABEL_CLASS}>
                      ID
                      <input
                        className={FIELD_CLASS}
                        onChange={handleIdChange}
                        type="text"
                        value={requestorId}
                      />
                    </label>
                    <label className={LABEL_CLASS}>
                      Email
                      <input
                        className={FIELD_CLASS}
                        onChange={handleEmailChange}
                        type="email"
                        value={email}
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="font-semibold text-caption text-muted-foreground uppercase tracking-widest">
                    Reason — optional
                  </h3>
                  <textarea
                    className={`${FIELD_CLASS} min-h-[64px]`}
                    onChange={handleReasonChange}
                    placeholder="Context for the approver…"
                    value={reason}
                  />
                </section>

                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={startReady}
                    onCheckedChange={handleReadyChange}
                  />
                  <span>
                    Start in Ready to Claim
                    <span className={HINT_CLASS}>
                      Skips Pending and Approved for a counter hand-over. Stock
                      still moves only when it is dispensed.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 border-border/50 border-t px-4 py-3">
                <p className="text-caption text-muted-foreground">
                  {blocked
                    ? `${problems.length} item${problems.length === 1 ? "" : "s"} need attention`
                    : "Ctrl/⌘ + Enter to submit"}
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
                    disabled={blocked || submitting || dbReady !== true}
                    onClick={handleSubmit}
                    size="sm"
                  >
                    {count === 1
                      ? "Create request"
                      : `Create ${count} requests`}
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
