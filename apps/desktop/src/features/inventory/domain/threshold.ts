/**
 * The low-stock threshold the workbook implies.
 *
 * The clinic's template records what *happened* — stock on hand, a day-by-day
 * dispensing grid, the month's totals — and no reorder point, because a
 * threshold is a **policy**, not an observation. Rather than stamping every
 * imported row with the schema's flat `20` (`0002_inventory.sql`), the import
 * derives one from the usage the file already carries:
 *
 *   average daily dispensing × (supplier lead time + safety days)
 *
 * The lead time comes from the same shared list the Low-Stock page reasons
 * about (`domain/low-stock.ts`), so the two surfaces cannot invent different
 * answers for one supplier.
 *
 * `0` is a real answer, not a failure: an item the month shows no dispensing
 * for has no usage to cover, so it is never "low" — it goes straight to
 * out-of-stock at zero. That is why this returns `0` rather than falling back
 * to the schema default.
 *
 * The value stays in **base units** (pack-size D13): the daily grid counts base
 * units, so the derived threshold does too.
 */

import { getLeadTime } from "./low-stock";

/** Days of cover added on top of lead time — the safety buffer. */
export const THRESHOLD_SAFETY_DAYS = 3;

/** Lead time assumed when the supplier is blank or not in the shared list. */
export const THRESHOLD_DEFAULT_LEAD_DAYS = 7;

/** The template's grid is days 1–31, so a full month is the divisor. */
export const THRESHOLD_GRID_DAYS = 31;

export interface ThresholdInput {
  /** The month's per-day dispensing counts (days 1–31). */
  daily: readonly number[];
  /** Supplier name, matched against the shared lead-time list. */
  supplier?: string | null;
}

/** The supplier's lead time, or the conservative default when it is unknown. */
export function leadTimeFor(supplier: string | null | undefined): number {
  return getLeadTime((supplier ?? "").trim()) ?? THRESHOLD_DEFAULT_LEAD_DAYS;
}

/**
 * Usage over the month's lead-time window, plus the safety buffer.
 *
 * Rounds **up**, never down: a threshold that under-reports what the shelf needs
 * is exactly the failure the alert exists to prevent.
 */
/**
 * Total dispensed over `days` → the threshold.
 *
 * This is **the one arithmetic**: the import derives a row's threshold from its
 * parsed daily grid and the backfill derives it from the dispensing events
 * already stored, and both come through here so the two can never disagree.
 */
export function thresholdForUsage(
  total: number,
  days: number,
  supplier: string | null | undefined
): number {
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const span = days > 0 ? days : THRESHOLD_GRID_DAYS;
  const perDay = total / span;
  const cover = leadTimeFor(supplier) + THRESHOLD_SAFETY_DAYS;
  return Math.max(1, Math.ceil(perDay * cover));
}

/** The month's day-by-day grid → the threshold. */
export function deriveThreshold(input: ThresholdInput): number {
  const total = input.daily.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0
  );
  return thresholdForUsage(total, input.daily.length, input.supplier);
}
