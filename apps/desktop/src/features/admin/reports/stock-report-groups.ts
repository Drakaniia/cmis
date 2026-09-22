/**
 * The Stock Report's grouped layout (D7, D8).
 *
 * Rows are grouped alphabetically by category, with the blank bucket last, and
 * each group carries its own mini-summary. Grouping is pure so the ordering,
 * the subtotals and the grand total can be tested without a database.
 *
 * Sorting is applied **within** each group, never across them (D11): group order
 * is always alphabetical so a printed page reads the same regardless of the
 * active sort.
 */

import { expiryLabel } from "@/features/inventory/domain/expiry";
import { sortStockLevelRows } from "./stock-level-rows";
import {
  type CategoryGroup,
  EM_DASH,
  type GrandTotal,
  type GroupSubtotal,
  type StockLevelRow,
  type StockLevelSort,
} from "./types";

const UNCATEGORIZED = "Uncategorized";

/** `""` → `Uncategorized`; every other name is used as stored. */
export function categoryLabel(category: string): string {
  return category.trim() === "" ? UNCATEGORIZED : category;
}

/** The group's earliest expiry date, rendered, or an em dash when none exist. */
function nearestExpiryFor(rows: StockLevelRow[]): string {
  let earliest = "";
  for (const row of rows) {
    if (row.expiry !== "" && (earliest === "" || row.expiry < earliest)) {
      earliest = row.expiry;
    }
  }
  return earliest === "" ? EM_DASH : expiryLabel(earliest);
}

export function buildSubtotal(rows: StockLevelRow[]): GroupSubtotal {
  let unitsOnHand = 0;
  let low = 0;
  let out = 0;
  for (const row of rows) {
    unitsOnHand += row.onHand;
    if (row.status === "low-stock") {
      low += 1;
    }
    if (row.status === "out-of-stock") {
      out += 1;
    }
  }
  return {
    low,
    medicines: rows.length,
    nearestExpiry: nearestExpiryFor(rows),
    out,
    unitsOnHand,
  };
}

function compareGroups(a: CategoryGroup, b: CategoryGroup): number {
  if (a.label === UNCATEGORIZED) {
    return b.label === UNCATEGORIZED ? 0 : 1;
  }
  if (b.label === UNCATEGORIZED) {
    return -1;
  }
  return a.label.localeCompare(b.label);
}

/**
 * The filtered rows grouped by category. `rows` is assumed to be already
 * search-filtered (F4), so a query can leave a group empty — an empty group is
 * dropped rather than rendered.
 */
export function groupByCategory(
  rows: StockLevelRow[],
  sort: StockLevelSort
): CategoryGroup[] {
  const byLabel = new Map<string, StockLevelRow[]>();
  for (const row of rows) {
    const label = categoryLabel(row.category);
    const group = byLabel.get(label) ?? [];
    group.push(row);
    byLabel.set(label, group);
  }

  const groups: CategoryGroup[] = [];
  for (const [label, groupRows] of byLabel) {
    groups.push({
      category: label === UNCATEGORIZED ? "" : label,
      label,
      rows: sortStockLevelRows(groupRows, sort.key, sort.dir),
      subtotal: buildSubtotal(groupRows),
    });
  }
  return groups.sort(compareGroups);
}

/** The closing row: the whole filtered set's subtotal plus its group count. */
export function buildGrandTotal(groups: CategoryGroup[]): GrandTotal {
  const rows = groups.flatMap((group) => group.rows);
  return { ...buildSubtotal(rows), categories: groups.length };
}
