/**
 * CMIS-UI-05 §7 / §4.4 — stock verification shared by the single dispense, the
 * batch dispense and the drag-to-Claimed path.
 *
 * The checks here are **read-only**: they answer "what would a hand-over take,
 * and from which batches?" so the confirmation can show the plan before
 * anything moves. The write side lives in `deduct-stock.ts`, which consumes this
 * module so there is exactly one implementation of FEFO order and of the
 * partial-take arithmetic.
 *
 * The sync shims this file used to export (`hasInventoryItem`, `onHandFor`,
 * `batchOptionsFor`, `checkStock`, …) returned hardcoded `false` / `[]` / `0`,
 * which is why dispensing could never be confirmed (AF6, AF7). They are deleted
 * rather than fixed: a caller that reintroduces one reintroduces the bug (F11).
 */

import {
  dispensableTotal,
  type PlanBatch,
  type PlanTake,
  usableBatches,
} from "@/features/inventory/domain/deduct-plan";
import {
  MEDICINE_WHERE_SQL,
  medicineMatchParams,
} from "@/features/inventory/domain/medicine-match";
import { baseUnitFor, toBaseUnits } from "@/features/inventory/domain/pack-size";
import { getDb } from "@/lib/db";

/**
 * A dispensable batch: FEFO order, expired and empty batches already removed.
 *
 * The shape and the rules are `deduct-plan.ts`'s — this is a re-export, not a
 * second definition, so the queue and the quick-deduct shortcut cannot drift
 * apart about which batch leaves the shelf first.
 */
export type BatchOption = PlanBatch;

/** How much of a hand-over comes out of which batch. */
export type BatchTake = PlanTake;

export type StockState =
  /** No inventory item matches the request's medicine text. */
  | "no-inventory-item"
  /** The item exists but nothing dispensable is on hand (empty, or all expired). */
  | "no-batch"
  /**
   * The requested unit cannot be placed against the item — a pack-worded request
   * on an item with no usable pack, or a unit that is neither the base unit nor
   * the pack unit. Nothing may be written (pack-size F5/E4/E5).
   */
  | "pack-unknown"
  /** Everything asked for fits on the shelf. */
  | "ok"
  /** Some of it fits — the hand-over is partial, the remainder stays on the card. */
  | "partial";

export interface StockCheck {
  /**
   * The item's base unit — the dose form (`sachet`, `tab`, …) every stock number
   * is counted in (pack-size D5/D9). Empty when no item was resolved.
   */
  baseUnit: string;
  /**
   * The requested quantity **converted to base units**, or `0` when the
   * conversion could not be made (`state: "pack-unknown"`).
   */
  baseQty: number;
  /** Earliest-expiring single batch that covers the request outright, if any. */
  batch: BatchOption | null;
  /**
   * How many batch rows exist for the item, expired and empty ones included.
   * This is what separates "the item has no batches at all" — deductible from
   * the item total — from "every batch is dead", which is a refusal (E1/E2).
   */
  batchCount: number;
  /** Total dispensable quantity across every usable batch. */
  dispensable: number;
  itemId: string | null;
  onHand: number;
  /** FEFO order, expired and empty batches removed. */
  options: BatchOption[];
  /** Quantity that would still be outstanding after taking `take`. */
  remaining: number;
  state: StockState;
  /** The item's pack multiple, for rendering `20 sachet (2 box)` (D11). */
  packQty: number;
  /** The item's pack container, e.g. `box`. Blank when no usable pack. */
  packUnit: string;
  /** Quantity this hand-over would actually take (`min(qty, dispensable)`). */
  take: number;
  /** The item's low-stock threshold, for the standing a deduction leaves behind. */
  threshold: number;
}

interface InventoryItemRow {
  dosage: string;
  form: string | null;
  id: string;
  name: string;
  pack_qty: number | null;
  pack_unit: string | null;
  qty: number;
  threshold: number;
}

/** The pack shape `pack-size.ts` needs, read off a stored row (migration 0012). */
function packItemOf(row: InventoryItemRow) {
  return {
    form: row.form ?? "",
    packQty: row.pack_qty ?? 0,
    packUnit: row.pack_unit ?? "",
  };
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
    `SELECT id, name, dosage, qty, threshold FROM inventory_items WHERE ${MEDICINE_WHERE_SQL} LIMIT 1`,
    medicineMatchParams(medicine)
  );
  if (itemRows.length === 0) {
    return [];
  }
  return usableBatches(await batchRowsFor(db, itemRows[0].id));
}

/**
 * Every batch row on file for an item, unfiltered — the planner decides what is
 * dispensable. A missing `inventory_batches` table (a half-migrated build)
 * reads as "no batches" rather than failing the whole check.
 */
async function batchRowsFor(
  db: Awaited<ReturnType<typeof getDb>>,
  itemId: string
): Promise<BatchRow[]> {
  try {
    return await db.select<BatchRow[]>(
      "SELECT batch, expiry, qty FROM inventory_batches WHERE item_id = ?",
      [itemId]
    );
  } catch {
    return [];
  }
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

export async function onHandForAsync(medicine: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ qty: number }[]>(
    `SELECT qty FROM inventory_items WHERE ${MEDICINE_WHERE_SQL} LIMIT 1`,
    medicineMatchParams(medicine)
  );
  return rows[0]?.qty ?? 0;
}

/**
 * Read-only plan for handing one request over: what fits now, from which
 * batches, and what would be left on the card.
 *
 * When `item.itemId` is provided (requests created after migration 0009), the
 * item is resolved directly by id so a rename does not detach the check
 * (AF13). Otherwise the normalized text match is used as before.
 */
export async function checkStockAsync(item: {
  itemId?: string | null;
  medicine: string;
  qty: number;
  unit: string;
}): Promise<StockCheck> {
  const db = await getDb();
  let inventoryItem: InventoryItemRow | null = null;
  const columns =
    "id, name, dosage, qty, threshold, form, pack_qty, pack_unit";
  if (item.itemId) {
    const direct = await db.select<InventoryItemRow[]>(
      `SELECT ${columns} FROM inventory_items WHERE id = ? LIMIT 1`,
      [item.itemId]
    );
    inventoryItem = direct[0] ?? null;
  }
  if (!inventoryItem) {
    const itemRows = await db.select<InventoryItemRow[]>(
      `SELECT ${columns} FROM inventory_items WHERE ${MEDICINE_WHERE_SQL} LIMIT 1`,
      medicineMatchParams(item.medicine)
    );
    inventoryItem = itemRows[0] ?? null;
  }

  if (!inventoryItem) {
    return {
      baseQty: 0,
      baseUnit: "",
      batch: null,
      batchCount: 0,
      dispensable: 0,
      itemId: null,
      onHand: 0,
      options: [],
      packQty: 0,
      packUnit: "",
      remaining: item.qty,
      state: "no-inventory-item",
      take: 0,
      threshold: 0,
    };
  }

  // Convert the request **before** any stock arithmetic: `2 box × 10 = 20
  // sachets` is what the batch and the item lose (D9). A unit that cannot be
  // placed — a pack-worded request on an item with no usable pack — returns
  // `null`, which blocks rather than silently treating a box as a single
  // (pack-size F1/F5, E4/E5).
  const packItem = packItemOf(inventoryItem);
  const baseUnit = baseUnitFor(packItem);
  // A blank unit is a legacy row: it can only mean the item's own base unit, so
  // it is read as such rather than refused (`canDispense` calls with no unit).
  const requestedUnit = item.unit.trim() === "" ? baseUnit : item.unit;
  const baseQty = toBaseUnits(item.qty, requestedUnit, packItem);
  if (baseQty === null) {
    return {
      baseQty: 0,
      baseUnit,
      batch: null,
      batchCount: 0,
      dispensable: 0,
      itemId: inventoryItem.id,
      onHand: inventoryItem.qty,
      options: [],
      packQty: packItem.packQty,
      packUnit: packItem.packUnit,
      remaining: 0,
      state: "pack-unknown",
      take: 0,
      threshold: inventoryItem.threshold,
    };
  }

  // The item is read once and its batches once: the FEFO exclusion, the
  // dispensable total and the row count all come from the same read, so a
  // concurrent stock-in cannot make the options and the count disagree.
  const batchRows = await batchRowsFor(db, inventoryItem.id);
  const options = usableBatches(batchRows);
  const dispensable = dispensableTotal(options);
  const base = {
    baseQty,
    baseUnit,
    batchCount: batchRows.length,
    itemId: inventoryItem.id,
    onHand: inventoryItem.qty,
    options,
    packQty: packItem.packQty,
    packUnit: packItem.packUnit,
    threshold: inventoryItem.threshold,
  };

  if (dispensable === 0) {
    // The item is on file but nothing can leave the shelf: no batches at all, or
    // every one expired. Deducting here would either conjure stock or dispense
    // expired medicine, so it is a refusal (E2) — unless the caller is the
    // quick-deduct path, which takes from the item total in this case (E1/D7)
    // and decides that from `batchCount`.
    return {
      ...base,
      batch: null,
      dispensable: 0,
      remaining: baseQty,
      state: "no-batch",
      take: 0,
    };
  }

  const take = Math.min(baseQty, dispensable);
  return {
    ...base,
    batch: options.find((option) => option.qty >= baseQty) ?? null,
    dispensable,
    remaining: baseQty - take,
    state: take < baseQty ? "partial" : "ok",
    take,
  };
}

export function stockStateLabel(
  check: StockCheck,
  item: { qty: number; unit: string }
): string {
  switch (check.state) {
    case "no-inventory-item":
      return "No matching inventory item — deduction cannot be verified";
    case "pack-unknown":
      return `${item.qty} ${item.unit} cannot be converted — this item has no pack size recorded. Dispense in ${check.baseUnit} instead, or set the pack size in Inventory.`;
    case "no-batch":
      return check.onHand === 0
        ? "Nothing on hand"
        : "No dispensable batch — none on hand, or all expired";
    case "partial":
      return `Only ${check.take} of ${check.baseQty} ${check.baseUnit} available — the rest stays in Ready to Claim`;
    case "ok":
      return check.batch
        ? `Batch ${check.batch.batch} · exp ${check.batch.expiry}`
        : `${check.dispensable} available across ${check.options.length} batches (earliest expiry first)`;
    default:
      return "";
  }
}

/** True when a hand-over of `qty` can deduct from the shelf right now. */
export const canDispense = async (
  medicine: string,
  qty: number
): Promise<boolean> => {
  const check = await checkStockAsync({ medicine, qty, unit: "" });
  return check.state === "ok" || check.state === "partial";
};

export const medicineExists = hasInventoryItemAsync;
