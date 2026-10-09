/**
 * Creation-time stock availability for the New Request form
 * (stock-validation-request-queue-spec.md §4).
 *
 * Pure: no React, no database, `now` injectable — the same discipline as
 * `deduct-plan.ts`. Every number comes from machinery that already exists
 * (`usableBatches` / `expiryDays` / `dispensableTotal` for the shelf,
 * `toBaseUnits` / `packItemOf` for pack arithmetic), so the form's breakdown
 * and the hand-over's plan cannot disagree about what is on the shelf.
 *
 * Two lenses on one item:
 * - `itemAvailability` — the item alone (§4.1/§4.2). This is what disables a
 *   picker option.
 * - `checkRows` — the form's rows in order (§4.3), with the duplicate-row
 *   running budget keyed by `itemId`, and optionally fed fresh availability
 *   for the submit-time re-check (§5.6).
 */

import {
  dispensableTotal,
  expiryDays,
  usableBatches,
} from "@/features/inventory/domain/deduct-plan";
import {
  describeQuantity,
  type PackItem,
  packItemOf,
  toBaseUnits,
} from "@/features/inventory/domain/pack-size";
import {
  EXPIRY_THRESHOLDS,
  type InventoryItem,
} from "@/features/inventory/types";
import { requestUnitsFor } from "../request-units";

export type StockState =
  /** `toBaseUnits` returned null — existing pack-size block (F1/F5). */
  | "pack-unknown"
  /** Only the threshold reserve stands in the way — warn, ack (§4.3.5). */
  | "reserve-dip"
  /** Requested more than the shelf can give — warn, ack (§4.3.4). */
  | "shortfall"
  /** The item itself cannot be requested at all — block (§4.2). */
  | "unavailable"
  /** Everything asked for fits within `available`. */
  | "ok";

export type UnavailableReason =
  | "all-expired"
  | "expiring-only"
  | "no-batch"
  | "out-of-stock"
  | "reserved";

/** Short picker labels, one per §4.2 reason (§5.1). */
export const UNAVAILABLE_SHORT: Record<UnavailableReason, string> = {
  "all-expired": "Expired or empty batches",
  "expiring-only": `All stock expires ≤${EXPIRY_THRESHOLDS.soon}d`,
  "no-batch": "No batch on record",
  "out-of-stock": "Out of stock",
  reserved: "Reserved for low-stock threshold",
};

export interface AvailabilityBreakdown {
  /** What a request may be written against (§4.1). */
  available: number;
  /** dispensable − soonExpiring, before the threshold reserve. */
  coreAvailable: number;
  /** planDeduct-ceiling-capped, expired/empty batches removed. */
  dispensable: number;
  /** The item's recorded quantity, raw. */
  onHand: number;
  /** max(0, threshold) — stock at or below it is not requestable. */
  reserved: number;
  /** Usable batch qty expiring within `EXPIRY_THRESHOLDS.soon` days. */
  soonExpiring: number;
}

export interface ItemAvailability extends AvailabilityBreakdown {
  /** `available === 0` — the picker disables the option (§5.1). */
  disabled: boolean;
  /** Non-null iff `disabled`, chosen by the §4.2 total order. */
  reason: UnavailableReason | null;
}

/** §4.2 — first match wins; the order resolves every overlap. */
function reasonFor(
  item: Pick<InventoryItem, "batches" | "qty">,
  dispensable: number,
  coreAvailable: number,
  available: number
): UnavailableReason | null {
  if (available !== 0) {
    return null;
  }
  // §4.2 reason 1's `batches.length === 0` clause is dropped: as written it
  // would subsume reason 2 entirely, and §9 mandates batch-less + qty>0 ⇒
  // `no-batch`. With `dispensable === 0` already established, `qty === 0` is
  // the only overlap that needs resolving here.
  if (dispensable === 0 && item.qty === 0) {
    return "out-of-stock";
  }
  if (item.batches.length === 0 && item.qty > 0) {
    return "no-batch";
  }
  if (dispensable === 0) {
    return "all-expired";
  }
  if (coreAvailable === 0) {
    return "expiring-only";
  }
  return "reserved";
}

/** §4.1 — one item, no request context. */
export function itemAvailability(
  item: Pick<InventoryItem, "batches" | "id" | "qty" | "threshold">,
  now: number = Date.now()
): ItemAvailability {
  const options = usableBatches(item.batches, now);
  const rawDispensable = dispensableTotal(options);
  // The same ceiling as planDeduct's, so the form's number and the hand-over's
  // number cannot disagree on drifted data (batches sum ≠ recorded qty).
  const dispensable =
    item.qty > 0 ? Math.min(rawDispensable, item.qty) : rawDispensable;

  let soon = 0;
  for (const option of options) {
    if (expiryDays(option.expiry, now) <= EXPIRY_THRESHOLDS.soon) {
      soon += option.qty;
    }
  }
  // On drifted data the soon slice can exceed the ceiling; clamp so
  // `coreAvailable ≥ 0` and every `available === 0` resolves to exactly one
  // §4.2 reason.
  const soonExpiring = Math.min(soon, dispensable);
  const coreAvailable = dispensable - soonExpiring;
  const reserved = Math.max(0, item.threshold);
  const available = Math.max(0, coreAvailable - reserved);
  const disabled = available === 0;

  return {
    available,
    coreAvailable,
    disabled,
    dispensable,
    onHand: item.qty,
    reason: disabled
      ? reasonFor(item, dispensable, coreAvailable, available)
      : null,
    reserved,
    soonExpiring,
  };
}

export interface ResolvedRow {
  /** Null ⇒ the structural `rowProblem` already owns this row. */
  item: InventoryItem | null;
  /** `RequestDraftRow.key`. */
  key: string;
  /** Null ⇒ same. */
  qty: number | null;
  unit: string;
}

export interface RowStockCheck extends ItemAvailability {
  /** True when an earlier row in the same form consumed part of the budget. */
  afterOtherRow?: boolean;
  /** Pack pair, for rendering quantities in messages (§5.2). */
  pack: PackItem;
  /** The row's typed quantity — only the pack-unknown message needs it. */
  qty: number;
  /** What a request asks for, in base units (0 when pack-unknown). */
  requestedBaseQty: number;
  /** max(0, requestedBaseQty − available), base units. */
  shortBy: number;
  state: StockState;
  /** The row's typed unit — only the pack-unknown message needs it. */
  unit: string;
}

/** §4.3 quantity comparisons — `unavailable` has already been ruled out. */
function qtyState(
  available: number,
  coreAvailable: number,
  requested: number
): StockState {
  if (requested > available && requested > coreAvailable) {
    return "shortfall";
  }
  if (coreAvailable >= requested && requested > available) {
    return "reserve-dip";
  }
  return "ok";
}

function buildCheck(
  item: InventoryItem,
  availability: ItemAvailability,
  qty: number,
  unit: string
): RowStockCheck {
  const pack = packItemOf(item);
  const baseQty = toBaseUnits(qty, unit, pack);
  if (baseQty === null) {
    return {
      ...availability,
      pack,
      qty,
      requestedBaseQty: 0,
      shortBy: 0,
      state: "pack-unknown",
      unit,
    };
  }
  // §4.3: the item-level reason is evaluated before any quantity comparison, so
  // a reserved-out item can never also read `reserve-dip`.
  const state =
    availability.reason === null
      ? qtyState(availability.available, availability.coreAvailable, baseQty)
      : "unavailable";
  return {
    ...availability,
    pack,
    qty,
    requestedBaseQty: baseQty,
    shortBy: Math.max(0, baseQty - availability.available),
    state,
    unit,
  };
}

/** One row, no budget — used by tests and single-item paths. */
export function checkRowStock(input: {
  item: InventoryItem;
  now?: number;
  qty: number;
  unit: string;
}): RowStockCheck {
  return buildCheck(
    input.item,
    itemAvailability(input.item, input.now),
    input.qty,
    input.unit
  );
}

/**
 * All rows at once, with the §4 duplicate-row running budget (form order,
 * keyed by `itemId`). Rows whose `item`/`qty` is null are omitted — `rowProblem`
 * owns them.
 *
 * `availabilityById`, when given, replaces each item's cached availability with
 * fresh numbers (the §5.6 submit-time re-check). An id missing from the map is
 * omitted from the result, which `create()` reads as blocking drift.
 *
 * Returns `Map<row.key, RowStockCheck>`.
 */
export function checkRows(
  rows: readonly ResolvedRow[],
  now: number = Date.now(),
  availabilityById?: ReadonlyMap<string, ItemAvailability>
): Map<string, RowStockCheck> {
  const checks = new Map<string, RowStockCheck>();
  const consumed = new Map<string, number>();

  for (const row of rows) {
    if (!(row.item && row.qty !== null)) {
      continue;
    }
    const fresh = availabilityById?.get(row.item.id);
    if (availabilityById && !fresh) {
      continue;
    }
    const check = buildCheck(
      row.item,
      fresh ?? itemAvailability(row.item, now),
      row.qty,
      row.unit
    );

    const prior = consumed.get(row.item.id) ?? 0;
    if (prior > 0 && check.reason === null && check.state !== "pack-unknown") {
      // Budget exhaustion is a warn (`shortfall`/`reserve-dip`), never
      // `unavailable` — that reason is strictly item-level (§4.3). `disabled`
      // and `reason` therefore stay the item's own values.
      const available = Math.max(0, check.available - prior);
      const coreAvailable = Math.max(0, check.coreAvailable - prior);
      checks.set(row.key, {
        ...check,
        afterOtherRow: true,
        available,
        coreAvailable,
        shortBy: Math.max(0, check.requestedBaseQty - available),
        state: qtyState(available, coreAvailable, check.requestedBaseQty),
      });
    } else {
      checks.set(row.key, check);
    }
    consumed.set(row.item.id, prior + check.requestedBaseQty);
  }
  return checks;
}

function unavailableMessage(check: RowStockCheck): string {
  switch (check.reason) {
    case "all-expired":
      return "Every batch of this item is expired or empty — dispose of it, or stock in.";
    case "expiring-only":
      return `All remaining stock expires within ${EXPIRY_THRESHOLDS.soon} days.`;
    case "no-batch":
      return "No batch on record — stock in first.";
    case "reserved":
      return `All stock above the low-stock threshold (${describeQuantity(check.reserved, check.pack)}) is reserved.`;
    default:
      // Covers `out-of-stock` — no reason can mean nothing else.
      return "Nothing on hand.";
  }
}

/** Footer/summary helper: the one user-facing line for a row's state (§8). */
export function stockMessageFor(check: RowStockCheck): string {
  const fmt = (value: number) => describeQuantity(value, check.pack);
  switch (check.state) {
    case "pack-unknown": {
      // `requestUnitsFor` wants the plain numeric pack shape, not PackItem's
      // `number | string` union (a stored pair is always numeric here).
      const pack = {
        form: check.pack.form,
        packQty:
          typeof check.pack.packQty === "number" ? check.pack.packQty : 0,
        packUnit: check.pack.packUnit,
      };
      return `${check.qty} ${check.unit} cannot be converted — this item has no pack size recorded. Dispense in ${requestUnitsFor(pack)[0]} instead, or set the pack size in Inventory.`;
    }
    case "unavailable":
      return unavailableMessage(check);
    case "shortfall": {
      const after = check.afterOtherRow ? " after the row above" : "";
      const soon =
        check.soonExpiring > 0
          ? ` · ${fmt(check.soonExpiring)} more expires within ${EXPIRY_THRESHOLDS.soon} days`
          : "";
      return `Only ${fmt(check.available)} requestable — ${fmt(check.shortBy)} short of ${fmt(check.requestedBaseQty)}${after}${soon}.`;
    }
    case "reserve-dip":
      return `Only ${fmt(check.available)} above the low-stock threshold of ${fmt(check.reserved)}.`;
    default:
      return "";
  }
}
