/**
 * CMIS-UI-05 §7 / §4.4 — stock verification shared by the single dispense and
 * the batch dispense.
 *
 * One implementation so the modal and the bulk toolbar can never disagree about
 * what is dispensable. Expired batches are excluded structurally (never merely
 * greyed out): dispensing expired medicine is the harm this screen must not
 * enable (Apple §16 Responsibility).
 */

import { daysUntilExpiry, mockInventory } from "@/features/inventory/mock";
import type { RequestItem } from "./types";

export interface BatchOption {
  batch: string;
  days: number;
  expiry: string;
  qty: number;
}

export type StockState =
  | "insufficient"
  | "no-inventory-item"
  | "ok"
  | "split-required";

export interface StockCheck {
  /** Earliest-expiring batch that can cover the request outright, if any. */
  batch: BatchOption | null;
  onHand: number;
  options: BatchOption[];
  state: StockState;
}

/** FEFO order (earliest expiry first), expired and empty batches removed. */
export function batchOptionsFor(medicine: string): BatchOption[] {
  const inventoryItem = mockInventory.find((item) => item.name === medicine);
  if (!inventoryItem) {
    return [];
  }
  return inventoryItem.batches
    .map((batch) => ({
      batch: batch.batch,
      days: daysUntilExpiry(batch.expiry),
      expiry: batch.expiry,
      qty: batch.qty,
    }))
    .filter((batch) => batch.days >= 0 && batch.qty > 0)
    .sort((a, b) => a.days - b.days);
}

export function hasInventoryItem(medicine: string): boolean {
  return mockInventory.some((item) => item.name === medicine);
}

export function onHandFor(medicine: string): number {
  return mockInventory.find((item) => item.name === medicine)?.qty ?? 0;
}

/**
 * Whether a request can be dispensed right now, and which batch would cover it.
 * A batch that is short is still offered — the single-dispense modal lets staff
 * split across batches by choosing, and the batch toolbar only needs to know
 * whether *something* covers it.
 */
export function checkStock(item: RequestItem): StockCheck {
  const inventoryItem = mockInventory.find(
    (candidate) => candidate.name === item.medicine
  );
  const options = batchOptionsFor(item.medicine);
  const onHand = inventoryItem?.qty ?? 0;

  if (!inventoryItem) {
    return { batch: null, onHand: 0, options, state: "no-inventory-item" };
  }
  if (onHand < item.qty) {
    return { batch: null, onHand, options, state: "insufficient" };
  }
  const covering = options.find((option) => option.qty >= item.qty) ?? null;
  return {
    batch: covering,
    onHand,
    options,
    state: covering ? "ok" : "split-required",
  };
}

export function stockStateLabel(check: StockCheck, item: RequestItem): string {
  switch (check.state) {
    case "no-inventory-item":
      return "No matching inventory item";
    case "insufficient":
      return `${check.onHand} in stock — needs ${item.qty} ${item.unit}`;
    case "split-required":
      return `${check.onHand} in stock, but no single batch covers ${item.qty} ${item.unit} — dispense from the detail view`;
    case "ok":
      return `Batch ${check.batch?.batch} · exp ${check.batch?.expiry}`;
    default:
      return "";
  }
}
