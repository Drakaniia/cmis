/**
 * The Stock Report's rows — every medicine's current standing, derived from the
 * same `inventory_items` rows the Inventory pages read.
 *
 * Pure and outside the component: the Reports page already holds `InventoryItem[]`
 * (the shared `useInventoryItems` query), so the report needs no query of its own,
 * and the sort/filter rules can be unit-tested without a database.
 *
 * Quantities are **base units** with the pack parenthetical from
 * `describeQuantity` (pack-size spec D14): `20 sachet (2 box)`. The pack pair is
 * optional on `InventoryItem` — a database from before migration 0012 carries
 * `0` / `""`, which renders an em dash in the Pack hint column rather than a
 * broken hint (F5).
 */

import { classifyExpiry, daysUntilExpiry, expiryLabel } from "@/features/inventory/domain/expiry";
import { classifyLowStock } from "@/features/inventory/domain/low-stock";
import { describeQuantity, hasPack, packItemOf } from "@/features/inventory/domain/pack-size";
import { composeListLabel, strengthLabel } from "@/features/inventory/domain/strength";
import type { InventoryItem, LowStockStatus } from "@/features/inventory/types";
import {
  EM_DASH,
  type StockLevelRow,
  type StockLevelSortDir,
  type StockLevelSortKey,
} from "./types";

/** Urgency order: the shelf's worst rows lead. */
const STATUS_RANK: Record<LowStockStatus, number> = {
  "in-stock": 2,
  "low-stock": 1,
  "out-of-stock": 0,
};

/** `Paracetamol 500 mg`. Strength only — the pack lives in its own column. */
function displayNameFor(item: InventoryItem): string {
  return composeListLabel(item);
}

/** `tablet · 500 mg` — either part may be blank, both blank degrades to a dash. */
function formStrengthFor(item: InventoryItem): string {
  const strength = strengthLabel(item);
  const parts = [item.form.trim(), strength].filter((part) => part !== "");
  return parts.length === 0 ? EM_DASH : parts.join(" · ");
}

/** The packaged string, or an em dash when the pair is not recorded (F5). */
function packHintFor(item: InventoryItem): string {
  const parts = packItemOf(item);
  return hasPack(parts) ? describeQuantity(item.qty, parts) : EM_DASH;
}

export function buildStockLevelRows(items: InventoryItem[]): StockLevelRow[] {
  return items.map((item) => {
    const hasExpiry = item.expiry.trim() !== "";
    return {
      batches: item.batches.length,
      category: item.category,
      expiry: item.expiry,
      expiryLabel: hasExpiry ? expiryLabel(item.expiry) : EM_DASH,
      expiryStatus: hasExpiry
        ? classifyExpiry(daysUntilExpiry(item.expiry))
        : null,
      formStrength: formStrengthFor(item),
      id: item.id,
      name: displayNameFor(item),
      onHand: item.qty,
      packHint: packHintFor(item),
      sku: item.sku,
      status: classifyLowStock(item.qty, item.threshold),
      threshold: item.threshold,
    };
  });
}

/** Case-insensitive match on the label, SKU or category. */
export function filterStockLevelRows(
  rows: StockLevelRow[],
  search: string
): StockLevelRow[] {
  const query = search.trim().toLowerCase();
  if (query === "") {
    return rows;
  }
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(query) ||
      row.sku.toLowerCase().includes(query) ||
      row.category.toLowerCase().includes(query)
  );
}

function compare(
  a: StockLevelRow,
  b: StockLevelRow,
  key: StockLevelSortKey
): number {
  switch (key) {
    case "onHand":
      return a.onHand - b.onHand;
    case "threshold":
      return a.threshold - b.threshold;
    case "status":
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    default:
      return a.name.localeCompare(b.name);
  }
}

/**
 * Sorts a copy, never the caller's array. Ties fall back to the label so the
 * order is stable and the reader can find a row twice in a row.
 */
export function sortStockLevelRows(
  rows: StockLevelRow[],
  key: StockLevelSortKey,
  dir: StockLevelSortDir
): StockLevelRow[] {
  const direction = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = compare(a, b, key) * direction;
    return primary === 0 ? a.name.localeCompare(b.name) : primary;
  });
}
