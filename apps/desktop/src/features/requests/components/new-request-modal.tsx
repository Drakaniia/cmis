import { Button } from "@cmis/ui/components/button";
import { Checkbox } from "@cmis/ui/components/checkbox";
import { QuantityStepper } from "@cmis/ui/components/quantity-stepper";
import { useNavigate } from "@tanstack/react-router";
import { PackageMinus, Plus, Trash2, X } from "lucide-react";
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

import { describeQuantity } from "@/features/inventory/domain/pack-size";
import { useQuickDeduct } from "@/features/inventory/hooks/use-quick-deduct";
import {
  EXPIRY_THRESHOLDS,
  type InventoryItem,
} from "@/features/inventory/types";
import { materializeEnter, sheetSpring } from "@/lib/motion";
import {
  checkRows,
  type ItemAvailability,
  itemAvailability,
  type RowStockCheck,
  stockMessageFor,
  UNAVAILABLE_SHORT,
} from "../domain/request-availability";
import {
  matchInventoryItem,
  parseQuantity,
  type RequestDraftRow,
  rowProblem,
  type StockDrift,
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

/** §5.2 — the live breakdown under a row's quantity grid. Zero segments omitted. */
function breakdownLine(check: RowStockCheck): string {
  const fmt = (value: number) => describeQuantity(value, check.pack);
  const segments = [`${fmt(check.onHand)} on hand`];
  if (check.dispensable !== check.onHand) {
    segments.push(`${fmt(check.dispensable)} dispensable`);
  }
  if (check.soonExpiring > 0) {
    segments.push(
      `${fmt(check.soonExpiring)} expiring soon (≤${EXPIRY_THRESHOLDS.soon}d)`
    );
  }
  if (check.reserved > 0) {
    segments.push(`${fmt(check.reserved)} reserved`);
  }
  return `${segments.join(" · ")}  →  ${fmt(check.available)} available`;
}

/** §4.3 blocking stock states (the structural `rowProblem` is separate). */
function isBlocked(check: RowStockCheck | null | undefined): boolean {
  return check?.state === "pack-unknown" || check?.state === "unavailable";
}

/** §4.3 warn states — what the acknowledgment gate counts. */
function isWarn(check: RowStockCheck | null | undefined): boolean {
  return check?.state === "shortfall" || check?.state === "reserve-dip";
}

/** §5.4 per-row summary: "Paracetamol — 20 short". */
function warnSummary(label: string, check: RowStockCheck): string {
  if (check.state === "shortfall") {
    return `${label} — ${check.shortBy} short`;
  }
  return `${label} — ${check.requestedBaseQty - check.available} into reserved`;
}

function footerCaption(attention: number, driftCount: number): string {
  if (attention > 0) {
    return `${attention} item${attention === 1 ? "" : "s"} need attention`;
  }
  if (driftCount > 0) {
    return "Stock changed — review the rows above";
  }
  return "Ctrl/⌘ + Enter to submit";
}

/** Every displayed number as one string — the key drift is pinned to (§5.6). */
function checksSignatureOf(checks: Map<string, RowStockCheck>): string {
  return [...checks.entries()]
    .map(
      ([key, check]) =>
        `${key}:${check.state}:${check.available}:${check.shortBy}:${check.reason ?? ""}`
    )
    .join("|");
}

interface WarnEntry {
  check: RowStockCheck;
  row: RequestDraftRow;
}

interface StockGate {
  /** True while the current warn signature has been acknowledged. */
  acked: boolean;
  /** Structural problems + blocking stock rows. */
  attention: number;
  blocked: boolean;
  cannotSubmit: boolean;
  warnEntries: WarnEntry[];
  /** §5.4 — ordered `key:state:shortBy`; any change re-opens the gate. */
  warnSignature: string;
  warnSummaries: string[];
}

/**
 * The form's whole §4–§5 gate as one pure function: what blocks, what warns,
 * whether Submit may run, and the signature the acknowledgment keys off.
 */
function deriveStockGate(input: {
  ackedSignature: string | null;
  checks: Map<string, RowStockCheck>;
  dbReady: boolean | null;
  driftCount: number;
  items: readonly InventoryItem[];
  rows: readonly RequestDraftRow[];
  submitting: boolean;
}): StockGate {
  const {
    ackedSignature,
    checks,
    dbReady,
    driftCount,
    items,
    rows,
    submitting,
  } = input;
  const problems = rows.filter((row) => rowProblem(row, items) !== null);
  const blockedRows = rows.filter((row) => isBlocked(checks.get(row.key)));
  const warnEntries: WarnEntry[] = [];
  for (const row of rows) {
    const check = checks.get(row.key);
    if (check && isWarn(check)) {
      warnEntries.push({ check, row });
    }
  }
  const warnSignature = warnEntries
    .map(({ check, row }) => `${row.key}:${check.state}:${check.shortBy}`)
    .join("|");
  const attention = problems.length + blockedRows.length;
  const blocked =
    problems.length > 0 || blockedRows.length > 0 || rows.length === 0;
  const acked = ackedSignature === warnSignature;
  return {
    acked,
    attention,
    blocked,
    cannotSubmit:
      blocked ||
      (warnEntries.length > 0 && !acked) ||
      driftCount > 0 ||
      submitting ||
      dbReady !== true,
    warnEntries,
    warnSignature,
    warnSummaries: warnEntries.map(({ check, row }) =>
      warnSummary(
        matchInventoryItem(items, row.medicine)?.displayName ?? row.medicine,
        check
      )
    ),
  };
}

/** One autocomplete row. Its own component so the click handler stays stable. */
function SuggestionOption({
  active,
  availability,
  item,
  onPick,
}: {
  active: boolean;
  availability: ItemAvailability;
  item: InventoryItem;
  onPick: (item: InventoryItem) => void;
}) {
  const handleMouseDown = useCallback(
    (event: ReactMouseEvent) => event.preventDefault(),
    []
  );
  const handleClick = useCallback(() => {
    if (!availability.disabled) {
      onPick(item);
    }
  }, [availability.disabled, item, onPick]);

  return (
    <button
      aria-disabled={availability.disabled}
      aria-selected={active}
      className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs ${
        availability.disabled
          ? "pointer-events-none opacity-60"
          : "hover:bg-accent"
      }`}
      onClick={handleClick}
      // Keeps focus on the input so the click lands before blur closes the list.
      onMouseDown={handleMouseDown}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <span className="min-w-0 truncate">{item.displayName}</span>
      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
        {availability.disabled
          ? UNAVAILABLE_SHORT[availability.reason ?? "out-of-stock"]
          : `${availability.available} available${
              availability.available === item.qty
                ? ""
                : ` · ${item.qty} on hand`
            }`}
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
  // §5.1: requestable first, disabled after — each group alphabetical — with
  // the item's availability attached for the right-hand figure.
  const options = useMemo(() => {
    const withAvailability = suggestInventoryItems(items, value).map(
      (item) => ({ availability: itemAvailability(item), item })
    );
    return [
      ...withAvailability.filter((option) => !option.availability.disabled),
      ...withAvailability.filter((option) => option.availability.disabled),
    ];
  }, [items, value]);
  // The active index only ever walks the enabled group (§5.1); a stale index
  // onto a disabled option falls back to the first enabled one.
  const activeIndex = useMemo(() => {
    const firstEnabled = options.findIndex(
      (option) => !option.availability.disabled
    );
    const current = options[active];
    if (current && !current.availability.disabled) {
      return active;
    }
    return firstEnabled >= 0 ? firstEnabled : 0;
  }, [active, options]);

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

  // One step from `activeIndex` onto the next/previous enabled option.
  const moveActive = useCallback(
    (step: 1 | -1) => {
      setActive((current) => {
        const enabled = options
          .map((option, index) => (option.availability.disabled ? -1 : index))
          .filter((index) => index >= 0);
        if (enabled.length === 0) {
          return 0;
        }
        const position = enabled.indexOf(current);
        if (position === -1) {
          return step === 1 ? 0 : enabled.length - 1;
        }
        return enabled[
          Math.min(Math.max(position + step, 0), enabled.length - 1)
        ];
      });
    },
    [options]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && open) {
        // Close the list, not the dialog — stop before the modal's Escape.
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (options.length === 0) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
        return;
      }
      if (event.key === "Enter" && open) {
        const chosen = options[activeIndex];
        if (chosen && !chosen.availability.disabled) {
          event.preventDefault();
          handlePick(chosen.item);
        }
      }
    },
    [activeIndex, handlePick, moveActive, open, options]
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
      {open && options.length > 0 ? (
        // The options are the listbox's own children, as the role requires.
        <div
          className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg"
          id={listId}
          role="listbox"
        >
          {options.map((option, index) => (
            <SuggestionOption
              active={index === activeIndex}
              availability={option.availability}
              item={option.item}
              key={option.item.id}
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
  check,
  dispensing,
  drift,
  items,
  onChange,
  onDispense,
  onRemove,
  row,
  startReady,
}: {
  canRemove: boolean;
  /** The §4.3 stock check for this row — null while `rowProblem` owns it. */
  check: RowStockCheck | null;
  /** True while this row's direct hand-over is in flight. */
  dispensing: boolean;
  /** Fresh submit-time numbers that no longer match the display (§5.6). */
  drift: StockDrift | null;
  items: readonly InventoryItem[];
  onChange: (key: string, patch: Partial<RequestDraftRow>) => void;
  /** Hands this row's item over at the counter instead of queueing it. */
  onDispense: (row: RequestDraftRow) => void;
  onRemove: (key: string) => void;
  row: RequestDraftRow;
  startReady: boolean;
}) {
  // Hooks must run unconditionally, so generate the ids at the top of the row.
  const id = useId();
  const matched = matchInventoryItem(items, row.medicine);
  const problem = rowProblem(row, items);

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

  // Stock math lives in one place — `checkRows` (§4.3) — so this row renders
  // exactly what the gate and the submit re-check compare against.
  const blocked =
    check?.state === "pack-unknown" || check?.state === "unavailable";
  const warned = check?.state === "shortfall" || check?.state === "reserve-dip";

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

  const handleDispense = useCallback(() => onDispense(row), [onDispense, row]);

  // The streamlined path only appears when the queue's own validations say the
  // row is requestable *and* the full quantity fits `available` (§4.3 `ok`) —
  // a shortfall, a threshold dip, a pack block or an unavailable item keeps the
  // row on the ordinary queue flow.
  const canDispense = problem === null && check?.state === "ok";

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
              invalid={problem !== null || blocked}
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

      {check ? <p className={HINT_CLASS}>{breakdownLine(check)}</p> : null}
      {problem ? <p className={ERROR_CLASS}>{problem}</p> : null}
      {problem === null && drift ? (
        <p className={ERROR_CLASS} role="alert">
          Stock changed while this form was open —{" "}
          {stockMessageFor(drift.check)}
        </p>
      ) : null}
      {problem === null && drift === null && blocked && check ? (
        <p className={ERROR_CLASS} role="alert">
          {stockMessageFor(check)}
        </p>
      ) : null}
      {problem === null && drift === null && warned && check ? (
        <p className={HINT_CLASS}>
          {stockMessageFor(check)}
          {startReady
            ? ` This card starts in Ready to Claim — only ${describeQuantity(check.available, check.pack)} of ${describeQuantity(check.requestedBaseQty, check.pack)} can be handed over immediately.`
            : ""}
        </p>
      ) : null}
      {canDispense ? (
        // §Streamline — the item is on the shelf and the whole quantity fits, so
        // it can be handed over now instead of queued. The quick-deduct write
        // path behind it keeps the counter semantics (short refused, no batch
        // tolerated, an undo window), and a successful hand-over drops the row.
        <div className="mt-2 flex justify-end">
          <Button
            className="press-feedback"
            disabled={dispensing}
            onClick={handleDispense}
            size="xs"
            variant="outline"
          >
            <PackageMinus className="size-3" />
            {dispensing ? "Dispensing…" : "Dispense now"}
          </Button>
        </div>
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
  const { create, dbReady, isLoadingItems, items, refetch } =
    useCreateRequests();
  // The one-action counter hand-over (`Ctrl+D`'s write path) reused per row.
  const { deduct } = useQuickDeduct();

  const [rows, setRows] = useState<RequestDraftRow[]>(() => [newRow()]);
  const [name, setName] = useState("");
  const [requestorId, setRequestorId] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [startReady, setStartReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** The row whose direct hand-over is in flight, if any. */
  const [dispensingKey, setDispensingKey] = useState<string | null>(null);
  /** §5.4 — acknowledgment, stored as the warn signature it was given so it
   *  clears itself the moment the signature changes (no reset effect). */
  const [ackedSignature, setAckedSignature] = useState<string | null>(null);
  /** §5.6 — fresh numbers that diverged at submit time, pinned to the check
   *  signature they contradicted; stale the moment the display changes. */
  const [driftState, setDriftState] = useState<{
    at: string;
    entries: StockDrift[];
  } | null>(null);

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
    setDispensingKey(null);
    setAckedSignature(null);
    setDriftState(null);
    const focusTimer = window.setTimeout(() => {
      firstFieldRef.current?.querySelector("input")?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  // §6.4 — refresh the 30 s inventory cache before the first breakdown paint.
  useEffect(() => {
    if (open) {
      refetch().catch(() => undefined);
    }
  }, [open, refetch]);

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

  /**
   * §Streamline — hands one row over at the counter through the shared
   * quick-deduct path, then drops the row so the form only holds what is still
   * to be queued (and a dispensed row can never be submitted as a second card).
   * The deduction's own toast carries the undo affordance.
   */
  const handleDispenseRow = useCallback(
    async (row: RequestDraftRow) => {
      const item = matchInventoryItem(items, row.medicine);
      const qty = parseQuantity(row.qty);
      if (!(item && qty !== null)) {
        return;
      }
      setDispensingKey(row.key);
      try {
        const outcome = await deduct({ item, qty, unit: row.unit });
        if (!outcome.ok) {
          toast.error("Could not dispense", { description: outcome.message });
          return;
        }
        setRows((prev) => {
          const next = prev.filter((entry) => entry.key !== row.key);
          return next.length > 0 ? next : [newRow()];
        });
      } catch {
        toast.error("Could not dispense", {
          description: "Nothing was deducted — try again.",
        });
      } finally {
        setDispensingKey(null);
      }
    },
    [deduct, items]
  );

  const resolvedRows = useMemo(
    () =>
      rows.map((row) => ({
        item: matchInventoryItem(items, row.medicine),
        key: row.key,
        qty: parseQuantity(row.qty),
        unit: row.unit,
      })),
    [items, rows]
  );
  const checks = useMemo(() => checkRows(resolvedRows), [resolvedRows]);
  const checkSignature = checksSignatureOf(checks);
  const drift =
    driftState && driftState.at === checkSignature ? driftState.entries : [];
  const gate = useMemo(
    () =>
      deriveStockGate({
        ackedSignature,
        checks,
        dbReady,
        driftCount: drift.length,
        items,
        rows,
        submitting,
      }),
    [ackedSignature, checks, dbReady, drift.length, items, rows, submitting]
  );
  const cannotSave = dbReady === false;

  const handleSubmit = useCallback(async () => {
    // `dbReady` is null until the probe finishes — submitting then could write
    // nothing and still report success.
    if (gate.cannotSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await create(
        {
          reason: reason.trim(),
          requestor: { email, id: requestorId, name },
          rows,
          startReady,
        },
        checks
      );
      if (result.drift.length > 0) {
        // §5.6 — nothing was written; the affected rows say what changed and
        // the refetch repaints the breakdown with fresh numbers (which makes
        // this entry stale via the check signature).
        setDriftState({ at: checkSignature, entries: result.drift });
        setAckedSignature(null);
        refetch().catch(() => undefined);
        return;
      }
      if (result.created.length === 0) {
        toast.error("No requests were created", {
          description: "Check the items and quantities, then try again.",
        });
        return;
      }
      const count = result.created.length;
      // §5.6 — today's `skipped` is computed but never shown; name it.
      const skippedNote =
        result.skipped.length > 0
          ? ` Skipped: ${result.skipped.map((entry) => entry.message).join(" ")}`
          : "";
      toast.success(`${count} request${count === 1 ? "" : "s"} created`, {
        action: {
          label: "View on board",
          onClick: () => {
            navigate({ to: "/admin/requests" }).catch(() => undefined);
          },
        },
        description: `${result.created.map((item) => item.id).join(", ")}${skippedNote}`,
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
    checks,
    checkSignature,
    create,
    email,
    gate,
    handleClose,
    navigate,
    name,
    reason,
    refetch,
    requestorId,
    rows,
    startReady,
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

  const { warnSignature } = gate;
  const handleAckChange = useCallback(
    (value: boolean | "indeterminate") =>
      setAckedSignature(value === true ? warnSignature : null),
    [warnSignature]
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
                          check={checks.get(row.key) ?? null}
                          dispensing={dispensingKey === row.key}
                          drift={
                            drift.find((entry) => entry.key === row.key) ?? null
                          }
                          items={items}
                          key={row.key}
                          onChange={updateRow}
                          onDispense={handleDispenseRow}
                          onRemove={removeRow}
                          row={row}
                          startReady={startReady}
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

              <div className="shrink-0 border-border/50 border-t px-4 py-3">
                {gate.warnEntries.length > 0 ? (
                  // §5.4 — the acknowledgment gate: Submit needs this checked
                  // while any warn row exists.
                  <label className="mb-2 flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                      checked={gate.acked}
                      onCheckedChange={handleAckChange}
                    />
                    <span>
                      I understand{" "}
                      <strong>
                        {gate.warnEntries.length} item
                        {gate.warnEntries.length === 1 ? "" : "s"}
                      </strong>{" "}
                      will be partial or dip into reserved stock
                      <span className={HINT_CLASS}>
                        {gate.warnSummaries.join(" · ")}
                      </span>
                    </span>
                  </label>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-caption text-muted-foreground">
                    {footerCaption(gate.attention, drift.length)}
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
                      disabled={gate.cannotSubmit}
                      onClick={handleSubmit}
                      size="sm"
                    >
                      {count === 1
                        ? "Create request"
                        : `Create ${count} requests`}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
