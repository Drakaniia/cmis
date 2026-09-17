/**
 * The pure arithmetic every deduction runs on (spec §10, E1–E3).
 *
 * Nothing here touches the database, React or the clock beyond a `now` the
 * caller passes in, so the rules that decide *what leaves the shelf* can be
 * tested directly: which batches are dispensable, in what order, how a quantity
 * splits across them, and when a deduction is refused.
 *
 * Both deduction paths use these functions. The queue allows a partial
 * hand-over and insists on a batch; quick deduct refuses a short quantity and
 * tolerates an item with no batch rows at all (its policy differences arrive as
 * `allowPartial` / `allowMissingBatch`, not as a second implementation), so the
 * two surfaces can never disagree about what "deduct" means.
 */

const MS_PER_DAY = 86_400_000;

/** A batch with no recorded expiry never expires, so it sorts last. */
const NO_EXPIRY_DAYS = 9999;

/** A batch as stored — `expiry` is nullable in `inventory_batches`. */
export interface PlanBatchRow {
  batch: string;
  expiry: string | null;
  qty: number;
}

/** A dispensable batch, FEFO-ordered: `days` is days until expiry. */
export interface PlanBatch {
  batch: string;
  days: number;
  expiry: string;
  qty: number;
}

/** How much of a deduction comes out of which batch. */
export interface PlanTake {
  batch: string;
  expiry: string;
  qty: number;
}

/** Days until `expiry`; blank or unparseable dates are treated as no expiry. */
export function expiryDays(expiry: string | null, now: number): number {
  const text = (expiry ?? "").trim();
  if (text === "") {
    return NO_EXPIRY_DAYS;
  }
  const at = new Date(text).getTime();
  if (Number.isNaN(at)) {
    return NO_EXPIRY_DAYS;
  }
  return Math.ceil((at - now) / MS_PER_DAY);
}

/**
 * FEFO order — earliest expiry first — with expired and empty batches removed.
 * Expired medicine must never leave the shelf, which is why the exclusion lives
 * here rather than at each call site: a batch this function drops cannot be
 * dispensed by any surface.
 */
export function usableBatches(
  rows: readonly PlanBatchRow[],
  now: number = Date.now()
): PlanBatch[] {
  return rows
    .map((row) => ({
      batch: row.batch,
      days: expiryDays(row.expiry, now),
      expiry: row.expiry ?? "",
      qty: row.qty,
    }))
    .filter((batch) => batch.days >= 0 && batch.qty > 0)
    .sort((a, b) => a.days - b.days || a.batch.localeCompare(b.batch));
}

/** Total across the batches a deduction may draw on. */
export function dispensableTotal(options: readonly { qty: number }[]): number {
  let total = 0;
  for (const option of options) {
    total += option.qty;
  }
  return total;
}

/**
 * Splits `qty` across the FEFO batches, earliest expiry first, continuing to the
 * next batch when one is exhausted — this is what makes "3 from batch A, 2 from
 * batch B" a single hand-over (E3).
 */
export function splitFefo(
  options: readonly PlanBatch[],
  qty: number
): PlanTake[] {
  const takes: PlanTake[] = [];
  let outstanding = qty;
  for (const option of options) {
    if (outstanding <= 0) {
      break;
    }
    const take = Math.min(outstanding, option.qty);
    if (take > 0) {
      takes.push({ batch: option.batch, expiry: option.expiry, qty: take });
      outstanding -= take;
    }
  }
  return takes;
}

export interface DeductPlanInput {
  /**
   * D7: take from the item total when the item has **no batch rows at all**.
   * This never covers expired batches — `options` is empty in both cases, so
   * `batchCount` is what tells the two apart.
   */
  allowMissingBatch: boolean;
  /**
   * D9: quick deduct refuses a short quantity and names what is there. The
   * queue allows the partial and keeps the remainder on the card (companion D4).
   */
  allowPartial: boolean;
  /** How many batch rows exist for the item, expired and empty ones included. */
  batchCount: number;
  /** The item's recorded quantity, which is what a batch-less take is limited by. */
  onHand: number;
  /** Dispensable batches, FEFO-ordered — `usableBatches` output. */
  options: readonly PlanBatch[];
  requested: number;
  /** Only used to phrase a refusal legibly. */
  unit: string;
}

export interface DeductPlanValue {
  batches: PlanTake[];
  /** Item quantity once the take has been subtracted. */
  leftAfter: number;
  /** True when there were no batch rows and the item total carried the take. */
  missingBatch: boolean;
  /** Quantity still outstanding afterwards — the queue keeps this on the card. */
  remaining: number;
  /** Quantity that will actually leave the shelf. */
  take: number;
}

export type DeductPlanOutcome =
  | { ok: true; plan: DeductPlanValue }
  | {
      ok: false;
      /** How much *could* have left the shelf, when there was some. */
      available: number;
      code: "no-batch" | "short";
      message: string;
    };

const NOTHING_ON_HAND = "Nothing is on hand for this item. Stock in first.";
const NO_DISPENSABLE_BATCH =
  "No dispensable batch — every batch of this item is expired or empty. Dispose of it, or stock in.";
const NO_BATCH_ON_RECORD =
  "This item has no batch on record, so the queue cannot dispense it. Stock in to record one.";

function withUnit(quantity: number, unit: string): string {
  const trimmed = unit.trim();
  return trimmed === "" ? String(quantity) : `${quantity} ${trimmed}`;
}

function short(available: number, unit: string): DeductPlanOutcome {
  return {
    available,
    code: "short",
    message: `Only ${withUnit(available, unit)} in stock.`,
    ok: false,
  };
}

/**
 * Decides what a deduction of `requested` would take, or refuses it.
 *
 * The refusal is a value, not an exception: a counter hand-over that cannot
 * happen should say so in the operator's words ("Only 3 tabs in stock.") rather
 * than fail silently, and the caller decides how to surface it.
 */
export function planDeduct(input: DeductPlanInput): DeductPlanOutcome {
  const {
    allowMissingBatch,
    allowPartial,
    batchCount,
    onHand,
    options,
    requested,
    unit,
  } = input;

  // No batch rows at all: the item total is the only thing there is to decrement
  // (E1). All-expired batches are the opposite case and are refused below.
  if (batchCount === 0) {
    if (onHand <= 0) {
      return {
        available: 0,
        code: "no-batch",
        message: NOTHING_ON_HAND,
        ok: false,
      };
    }
    if (!allowMissingBatch) {
      return {
        available: 0,
        code: "no-batch",
        message: NO_BATCH_ON_RECORD,
        ok: false,
      };
    }
    const take = Math.min(requested, onHand);
    if (take < requested && !allowPartial) {
      return short(onHand, unit);
    }
    return {
      ok: true,
      plan: {
        batches: [],
        leftAfter: onHand - take,
        missingBatch: true,
        remaining: requested - take,
        take,
      },
    };
  }

  const available = dispensableTotal(options);
  if (available === 0) {
    return {
      available: 0,
      code: "no-batch",
      message: onHand === 0 ? NOTHING_ON_HAND : NO_DISPENSABLE_BATCH,
      ok: false,
    };
  }

  // The shelf, not the item's recorded total, is what limits a batched take: a
  // row with expiring-only stock must not hand over more than it can carry.
  const ceiling = Math.min(available, onHand > 0 ? onHand : available);
  const take = Math.min(requested, ceiling);
  if (take < requested && !allowPartial) {
    return short(ceiling, unit);
  }

  return {
    ok: true,
    plan: {
      batches: splitFefo(options, take),
      leftAfter: onHand - take,
      missingBatch: false,
      remaining: requested - take,
      take,
    },
  };
}
