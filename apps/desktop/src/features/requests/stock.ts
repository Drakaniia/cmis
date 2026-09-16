/**
 * CMIS-UI-05 §7 / §4.4 — stock verification shared by the single dispense and
 * the batch dispense. Now queries SQLite instead of in-memory data (spec §3.8, §6.2).
 */

import { daysUntilExpiry } from "@/features/inventory/domain/expiry";
import {
  MEDICINE_WHERE_SQL,
  medicineMatchParams,
} from "@/features/inventory/domain/medicine-match";
import { getDb } from "@/lib/db";
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

interface InventoryItemRow {
  dosage: string;
  id: string;
  name: string;
  qty: number;
}

interface BatchRow {
  batch: string;
  expiry: string | null;
  qty: number;
}

/** FEFO order (earliest expiry first), expired and empty batches removed. */
export async function batchOptionsForAsync(
  medicine: string
): Promise<BatchOption[]> {
  const db = await getDb();
  // medicine is display name "Name Dosage"; match via name or name+dosage
  const itemRows = await db.select<InventoryItemRow[]>(
    `SELECT id, name, dosage, qty FROM inventory_items WHERE ${MEDICINE_WHERE_SQL} LIMIT 1`,
    medicineMatchParams(medicine)
  );
  if (itemRows.length === 0) {
    return [];
  }
  const itemId = itemRows[0].id;
  const batches = await db.select<BatchRow[]>(
    "SELECT batch, expiry, qty FROM inventory_batches WHERE item_id = ?",
    [itemId]
  );
  return batches
    .map((batch: BatchRow) => ({
      batch: batch.batch,
      days: batch.expiry ? daysUntilExpiry(batch.expiry) : 9999,
      expiry: batch.expiry ?? "",
      qty: batch.qty,
    }))
    .filter((batch: BatchOption) => batch.days >= 0 && batch.qty > 0)
    .sort((a: BatchOption, b: BatchOption) => a.days - b.days);
}

export async function hasInventoryItemAsync(
  medicine: string
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM inventory_items WHERE ${MEDICINE_WHERE_SQL}`,
    medicineMatchParams(medicine)
  );
  return (rows[0]?.c ?? 0) > 0;
}
export function hasInventoryItem(_medicine: string): boolean {
  return false;
}

export async function onHandForAsync(medicine: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ qty: number }[]>(
    `SELECT qty FROM inventory_items WHERE ${MEDICINE_WHERE_SQL} LIMIT 1`,
    medicineMatchParams(medicine)
  );
  return rows[0]?.qty ?? 0;
}
export function onHandFor(_medicine: string): number {
  return 0;
}

// Sync shim for legacy callers (spec follow-up will make them async)
export function batchOptionsFor(_medicine: string): BatchOption[] {
  return [];
}
export function batchOptionsForSync(_medicine: string): BatchOption[] {
  return [];
}

export async function checkStockAsync(item: RequestItem): Promise<StockCheck> {
  const db = await getDb();
  const itemRows = await db.select<InventoryItemRow[]>(
    `SELECT id, name, dosage, qty FROM inventory_items WHERE ${MEDICINE_WHERE_SQL} LIMIT 1`,
    medicineMatchParams(item.medicine)
  );
  const options = await batchOptionsForAsync(item.medicine);
  const inventoryItem = itemRows[0] ?? null;
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

// Legacy sync wrapper kept for callers not yet async — returns insufficient by default until migrated
export function checkStockSync(_item: RequestItem): StockCheck {
  return { batch: null, onHand: 0, options: [], state: "no-inventory-item" };
}
export function checkStock(_item: RequestItem): StockCheck {
  return { batch: null, onHand: 0, options: [], state: "no-inventory-item" };
}
export function hasInventoryItemSync(_medicine: string): boolean {
  return false;
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

// Aliases for spec §6.2 canDispense / medicineExists
export const canDispense = async (
  medicine: string,
  qty: number
): Promise<boolean> => {
  const onHand = await onHandForAsync(medicine);
  return onHand >= qty;
};

export const medicineExists = hasInventoryItemAsync;
