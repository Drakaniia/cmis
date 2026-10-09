/**
 * The Stock Report's month summary — stock totals, shelf health and this
 * month's movement (F2).
 *
 * Pure and tested without a database, in the style of `stock-level-rows.ts`.
 *
 * Health counts reuse the shared classifiers rather than private constants:
 * `classifyLowStock` for low/out and `classifyExpiry` over
 * `daysUntilExpiry(batch.expiry)` for the expiry bands, so the report and Expiry
 * Alerts can never disagree (SL10). A medicine with several batches in the same
 * band counts once.
 */

import {
  classifyExpiry,
  daysUntilExpiry,
} from "@/features/inventory/domain/expiry";
import { classifyLowStock } from "@/features/inventory/domain/low-stock";
import type { InventoryItem } from "@/features/inventory/types";
import {
  EM_DASH,
  type MonthActivity,
  type MonthActivityData,
  type StockSummary,
} from "./types";

/** An em dash for a month with no inbound and no outbound activity (D15). */
export function monthFigure(value: number, hasActivity: boolean): string {
  return hasActivity ? String(value) : EM_DASH;
}

/**
 * This month's in/out figures, already resolved for display. The dash rule is
 * global per F2: a month with neither direction of activity reads `—` for both,
 * while a month that received but dispensed nothing shows a real `0`.
 */
export function buildMonthActivity(input: {
  dispensed: number;
  hasActivity: boolean;
  received: number;
}): MonthActivity {
  return {
    dispensed: monthFigure(input.dispensed, input.hasActivity),
    received: monthFigure(input.received, input.hasActivity),
  };
}

/** The figures a report may render, plus whether the month is still loading. */
export interface ResolvedMonthActivity {
  activity: MonthActivity;
  /** `true` while the selected month's own figures have not been read yet. */
  isPending: boolean;
}

/**
 * The only month figures a report is allowed to display.
 *
 * Data is accepted only when it was measured for the selected `month`. A month
 * change therefore reads as *loading* — the two pills pulse — rather than
 * silently pairing the new month's label with the previous month's numbers, and
 * no PDF, workbook or print run can be captured mid-switch with the wrong
 * figures (the report's "no false assumption" rule).
 */
export function resolveMonthActivity(
  month: string,
  data: MonthActivityData | undefined
): ResolvedMonthActivity {
  if (!data || data.month !== month) {
    return {
      activity: buildMonthActivity({
        dispensed: 0,
        hasActivity: false,
        received: 0,
      }),
      isPending: true,
    };
  }
  return { activity: buildMonthActivity(data), isPending: false };
}

/** `Stock as of Sep 21, 2026, 3:04 PM` — the stamp that keeps a screenshot honest. */
export function formatAsOf(date: Date): string {
  const stamp = date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `Stock as of ${stamp}`;
}

/** Every expiry date a medicine carries — each batch, or its nearest expiry. */
function expiriesFor(item: InventoryItem): string[] {
  if (item.batches.length > 0) {
    return item.batches.map((batch) => batch.expiry);
  }
  return item.expiry.trim() === "" ? [] : [item.expiry];
}

/**
 * Which expiry bands an item touches. An item counts once per band, so a
 * medicine with one expired batch and one far-future batch counts as both.
 */
function expiryBands(item: InventoryItem): {
  expired: boolean;
  later: boolean;
  soon: boolean;
} {
  const bands = { expired: false, later: false, soon: false };
  for (const iso of expiriesFor(item)) {
    if (iso.trim() === "") {
      continue;
    }
    const band = classifyExpiry(daysUntilExpiry(iso));
    if (band === "expired") {
      bands.expired = true;
    } else if (band === "expiring-soon") {
      bands.soon = true;
    } else if (band === "expiring-later") {
      bands.later = true;
    }
  }
  return bands;
}

export function buildStockSummary(items: InventoryItem[]): StockSummary {
  const categories = new Set<string>();
  let unitsOnHand = 0;
  let low = 0;
  let out = 0;
  let expiringSoon = 0;
  let expiringLater = 0;
  let expired = 0;

  for (const item of items) {
    categories.add(
      item.category.trim() === "" ? "Uncategorized" : item.category
    );
    unitsOnHand += item.qty;

    const status = classifyLowStock(item.qty, item.threshold);
    if (status === "low-stock") {
      low += 1;
    }
    if (status === "out-of-stock") {
      out += 1;
    }

    const expiry = expiryBands(item);
    if (expiry.expired) {
      expired += 1;
    }
    if (expiry.soon) {
      expiringSoon += 1;
    }
    if (expiry.later) {
      expiringLater += 1;
    }
  }

  return {
    categories: categories.size,
    expired,
    expiringLater,
    expiringSoon,
    low,
    medicines: items.length,
    out,
    unitsOnHand,
  };
}
