/**
 * The one place a request hand-over moves stock (F7).
 *
 * Dispensing a request used to write a `dispensing_records` row and nothing
 * else: the shelf, the batch and the analytics tables were untouched, so staff
 * had to walk to Inventory and do a manual stock-out afterwards (AF4 — "just
 * stock in and stock out"). Every dispense path — the single modal, the batch
 * modal and the drag into Claimed — now calls these two functions, so the
 * behaviour cannot fork.
 *
 * `planDeduction` is read-only and is what the confirmation shows. `deductStock`
 * re-plans immediately before writing, so a hand-over that follows another
 * hand-over of the same medicine reads the shelf as it is now and becomes a
 * partial rather than driving the quantity below zero (E5).
 *
 * Stock moves at exactly one moment: the move into Claimed (D3). Nothing is
 * reserved at Approve or Prepare.
 *
 * The same service carries the quick-deduct shortcut (`Ctrl+D`). Its two policy
 * differences — refusing a short quantity instead of part-handing it over, and
 * deducting from the item total when there are no batch rows — are `options`
 * here, not a second implementation, so the two surfaces cannot disagree about
 * what "deduct" means. `undoStock` is the reversal only that path offers: a
 * short window to catch a mis-key, while queue dispensing stays irreversible
 * because it moves real stock as the record of a hand-over someone signed for.
 */

import { getOperatorName } from "@/features/admin/audit/operator";
import { recordAudit } from "@/features/admin/audit/write-audit";
import { planDeduct } from "@/features/inventory/domain/deduct-plan";
import {
  decrementBatch,
  recordDispensing,
} from "@/features/inventory/hooks/use-stock-mutations";
import { deriveStatus } from "@/features/inventory/import/inventory-status";
import { getDb } from "@/lib/db";
import { type BatchTake, checkStockAsync } from "./stock";
import type { DispensingRecord } from "./types";

/** What a hand-over is about to do, before it does it. */
export interface DeductPlan {
  /** FEFO batches this hand-over draws from, earliest expiry first. */
  batches: BatchTake[];
  itemId: string;
  /** Item quantity once the take has been subtracted. */
  leftAfter: number;
  medicine: string;
  /**
   * True when the item has no batch rows at all and the deduction came off the
   * item total, so the record carries an empty batch (D7/E1).
   */
  missingBatch: boolean;
  onHand: number;
  /** Quantity that stays on the card, still in Ready to Claim. */
  remaining: number;
  requested: number;
  /** Quantity actually taken from the shelf. */
  take: number;
  /** The item's low-stock threshold, for the standing left behind (F6). */
  threshold: number;
  unit: string;
}

/**
 * The one policy difference between the two deduction surfaces, expressed as
 * options rather than as a second code path (spec §12).
 */
export interface DeductOptions {
  /**
   * D7 — never block a counter hand-over for want of a batch: an item with no
   * batch rows deducts from its total. The queue leaves this off, because a
   * request's hand-over is recorded against a batch.
   */
  allowMissingBatch?: boolean;
  /**
   * D9 — refuse a short quantity instead of handing over a partial and keeping
   * the remainder on a card. The queue leaves this on (companion D4).
   */
  allowPartial?: boolean;
}

export interface DeductError {
  code: "no-batch" | "no-inventory-item" | "short";
  message: string;
}

export type DeductPlanResult =
  | { ok: true; plan: DeductPlan }
  | { ok: false; error: DeductError };

/**
 * Everything an undo needs to put the shelf back (F5). Captured **before** the
 * write: a batch that reaches zero is deleted, so reviving it needs its code,
 * expiry and supplier — a snapshot taken afterwards would be a ghost.
 */
export interface DeductSnapshot {
  batches: { batch: string; expiry: string; qty: number; supplier: string }[];
  /** The day `dispensing_events` was written under, so the total goes back down. */
  date: string;
  itemId: string;
  /** Item quantity before the take. */
  itemQty: number;
  medicine: string;
  take: number;
  unit: string;
}

export type DeductResult =
  | {
      ok: true;
      plan: DeductPlan;
      record: DispensingRecord;
      snapshot: DeductSnapshot;
    }
  | { ok: false; error: DeductError };

/**
 * Read-only: resolves the item, picks batches FEFO and works out how much fits.
 * Expired batches are excluded by `checkStockAsync`, so dispensing expired
 * medicine is not something this can be talked into.
 *
 * When `itemId` is provided (requests created after migration 0009 carry it),
 * the item is resolved directly by id so a rename does not detach the stock
 * check from its history (AF13). Legacy rows with a null item_id fall back to
 * the normalized text match.
 */
export async function planDeduction(
  medicine: string,
  qty: number,
  unit: string,
  options: DeductOptions = {},
  itemId?: string | null
): Promise<DeductPlanResult> {
  const check = itemId
    ? await checkStockAsync({ itemId, medicine, qty, unit })
    : await checkStockAsync({ medicine, qty, unit });

  if (check.state === "no-inventory-item" || check.itemId === null) {
    return {
      error: {
        code: "no-inventory-item",
        message: `No inventory item matches “${medicine}”. Stock in the item, or deny the request.`,
      },
      ok: false,
    };
  }

  // The refusal wording and the FEFO split are the planner's, so an item that
  // cannot be dispensed is refused in the same words wherever it is asked about.
  const outcome = planDeduct({
    allowMissingBatch: options.allowMissingBatch ?? false,
    allowPartial: options.allowPartial ?? true,
    batchCount: check.batchCount,
    onHand: check.onHand,
    options: check.options,
    requested: qty,
    unit,
  });

  if (!outcome.ok) {
    return {
      error: { code: outcome.code, message: outcome.message },
      ok: false,
    };
  }

  return {
    ok: true,
    plan: {
      batches: outcome.plan.batches,
      itemId: check.itemId,
      leftAfter: outcome.plan.leftAfter,
      medicine,
      missingBatch: outcome.plan.missingBatch,
      onHand: check.onHand,
      remaining: outcome.plan.remaining,
      requested: qty,
      take: outcome.plan.take,
      threshold: check.threshold,
      unit,
    },
  };
}

/**
 * Deducts the stock for one hand-over and reports what it took.
 *
 * Writes, in order: the batches (FEFO, deleting a batch that reaches zero), the
 * item total with its recomputed status, the daily `dispensing_events` row that
 * Dashboard and Reports read, and an audit entry. The caller moves the card
 * afterwards — deduct first, move the card second, so a crash can leave stock
 * taken with the card still in Ready to Claim rather than a card that lies about
 * the shelf (F7, ordering).
 */
export async function deductStock(
  request: {
    id: string;
    itemId?: string | null;
    medicine: string;
    qty: number;
    unit: string;
  },
  options: DeductOptions = {}
): Promise<DeductResult> {
  const planned = await planDeduction(
    request.medicine,
    request.qty,
    request.unit,
    options,
    request.itemId ?? null
  );
  if (!planned.ok) {
    return planned;
  }
  const { plan } = planned;

  const db = await getDb();
  const at = new Date().toISOString();
  const { threshold } = plan;

  // Snapshot before anything moves: `decrementBatch` deletes a batch that
  // reaches zero, so undoing means knowing what that row held and who supplied
  // it (E5/E6).
  const batchRows =
    plan.batches.length === 0
      ? []
      : await db.select<
          {
            batch: string;
            expiry: string | null;
            qty: number;
            supplier: string | null;
          }[]
        >(
          "SELECT batch, expiry, qty, supplier FROM inventory_batches WHERE item_id = ?",
          [plan.itemId]
        );
  const snapshot: DeductSnapshot = {
    batches: plan.batches.map((take) => ({
      batch: take.batch,
      expiry: take.expiry,
      qty: take.qty,
      supplier:
        batchRows.find((row) => row.batch === take.batch)?.supplier ?? "",
    })),
    date: at.slice(0, 10),
    itemId: plan.itemId,
    itemQty: plan.onHand,
    medicine: plan.medicine,
    take: plan.take,
    unit: plan.unit,
  };

  for (const take of plan.batches) {
    // biome-ignore lint/performance/noAwaitInLoops: batch order is the FEFO order that must be written in sequence
    await decrementBatch(db, plan.itemId, take.batch, take.qty);
  }

  const newQty = plan.leftAfter;
  const newStatus = deriveStatus(newQty, threshold);
  const remainingBatches = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM inventory_batches WHERE item_id = ?",
    [plan.itemId]
  );
  const needsBatch = (remainingBatches[0]?.c ?? 0) === 0 ? 1 : 0;

  await db.execute(
    "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = ?, updated_at = ? WHERE id = ?",
    [newQty, newStatus, needsBatch, at, plan.itemId]
  );

  // The queue's dispensing used to be invisible to analytics: inventory
  // stock-outs wrote this table and the queue wrote nothing (AF9). Dashboard and
  // Reports now count both the same way (D10).
  await recordDispensing(db, plan.itemId, plan.take);

  const batchLabel = plan.batches.map((take) => take.batch).join(", ");
  const expiryLabel = [
    ...new Set(plan.batches.map((take) => take.expiry).filter(Boolean)),
  ].join(", ");
  const batchNote =
    batchLabel === "" ? "no batch on record" : `batch ${batchLabel}`;

  await recordAudit(
    db,
    {
      action: "stock-out",
      after: { qty: newQty, status: newStatus },
      before: { qty: plan.onHand },
      detail: `${plan.medicine}: dispensed ${plan.take} ${plan.unit} on request ${request.id} (${batchNote}), ${newQty} left`,
      requestRef: request.id,
      targetId: plan.itemId,
      targetKind: "item",
    },
    { bestEffort: true }
  );

  return {
    ok: true,
    plan,
    record: {
      at,
      batch: batchLabel,
      expiry: expiryLabel,
      qty: plan.take,
      staff: getOperatorName(),
    },
    snapshot,
  };
}

/**
 * Puts a quick deduction back (F5, E6–E8).
 *
 * Adds the taken amount back to each batch — reviving one that `decrementBatch`
 * deleted, from the snapshot's own code, expiry and supplier — then to the item
 * total, recomputes the standing, and subtracts from the day's dispensing total
 * with a floor at zero so a reversal can never make a day negative. Each step is
 * additive rather than absolute: a second deduction made in the meantime moved
 * its own amount, so adding this one back leaves the arithmetic correct (E8).
 *
 * Refused when the item has since been deleted — the stock is left as it is
 * rather than quietly discarded (E7).
 */
export async function undoStock(
  snapshot: DeductSnapshot
): Promise<{ ok: true; qty: number } | { ok: false; error: DeductError }> {
  const db = await getDb();
  const itemRows = await db.select<
    { id: string; qty: number; threshold: number }[]
  >("SELECT id, qty, threshold FROM inventory_items WHERE id = ? LIMIT 1", [
    snapshot.itemId,
  ]);
  const [item] = itemRows;
  if (!item) {
    return {
      error: {
        code: "no-inventory-item",
        message:
          "This item no longer exists, so the deduction cannot be undone. The stock has been left alone.",
      },
      ok: false,
    };
  }

  for (const batch of snapshot.batches) {
    // biome-ignore lint/performance/noAwaitInLoops: batches are restored in the order they were taken
    await restoreBatch(db, snapshot.itemId, batch);
  }

  const newQty = item.qty + snapshot.take;
  const newStatus = deriveStatus(newQty, item.threshold);
  const remainingBatches = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM inventory_batches WHERE item_id = ?",
    [snapshot.itemId]
  );
  await db.execute(
    "UPDATE inventory_items SET qty = ?, status = ?, needs_batch = ?, updated_at = ? WHERE id = ?",
    [
      newQty,
      newStatus,
      (remainingBatches[0]?.c ?? 0) === 0 ? 1 : 0,
      new Date().toISOString(),
      snapshot.itemId,
    ]
  );

  // The day's total goes back down, floored at zero: a reversal can never make
  // a day negative, even if the aggregate has already been written down by some
  // other correction (F5, spec §12). Atomic so a concurrent dispense that added
  // 3 between the read and the write does not lose its +3 (the old read-modify-
  // write would read 10, the concurrent write make it 13, the undo write 6).
  // If the day is busy, the floor hides a concurrent write — follow-up is to
  // track per-request deltas rather than a shared daily counter.
  await db.execute(
    "UPDATE dispensing_events SET qty = CASE WHEN qty - ? < 0 THEN 0 ELSE qty - ? END WHERE item_id = ? AND date = ?",
    [snapshot.take, snapshot.take, snapshot.itemId, snapshot.date]
  );

  // The record is deleted by the caller, so the reversal has to be traceable on
  // its own: the log says what went back, when, and under which reference.
  await recordAudit(
    db,
    {
      action: "stock-in",
      after: { qty: newQty, received: snapshot.take, status: newStatus },
      before: { qty: item.qty },
      detail: `${snapshot.medicine}: quick deduction of ${snapshot.take} ${snapshot.unit} undone — ${newQty} back on the shelf`,
      targetId: snapshot.itemId,
      targetKind: "item",
    },
    { bestEffort: true }
  );

  return { ok: true, qty: newQty };
}

/** Adds a taken batch back, recreating the row when the take consumed it. */
async function restoreBatch(
  db: Awaited<ReturnType<typeof getDb>>,
  itemId: string,
  batch: DeductSnapshot["batches"][number]
): Promise<void> {
  const rows = await db.select<{ id: string; qty: number }[]>(
    "SELECT id, qty FROM inventory_batches WHERE item_id = ? AND batch = ? LIMIT 1",
    [itemId, batch.batch]
  );
  const [existing] = rows;
  if (existing) {
    await db.execute("UPDATE inventory_batches SET qty = ? WHERE id = ?", [
      existing.qty + batch.qty,
      existing.id,
    ]);
    return;
  }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `batch-${Date.now()}`;
  await db.execute(
    "INSERT INTO inventory_batches (id, item_id, batch, expiry, qty, supplier) VALUES (?, ?, ?, ?, ?, ?)",
    [
      id,
      itemId,
      batch.batch,
      batch.expiry,
      batch.qty,
      batch.supplier === "" ? null : batch.supplier,
    ]
  );
}
