import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/fake-db";
import { deductStock, undoStock } from "./deduct-stock";

/**
 * The shared service is where a hand-over actually moves stock, so these cases
 * are the ones that matter: which batch leaves the shelf, what the two
 * quick-deduct policy differences do (refuse a short quantity, tolerate a
 * missing batch), and whether an undo really puts everything back — including a
 * batch that the deduction deleted at zero.
 */

const getDb = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

const QUICK = { allowMissingBatch: true, allowPartial: false } as const;

function item(overrides: Record<string, unknown> = {}) {
  return {
    category: "Analgesic",
    display_name: "Paracetamol 500 mg",
    dosage: "",
    dosage_missing: 0,
    form: "tablet",
    id: "item-1",
    name: "Paracetamol",
    needs_batch: 0,
    pack_size: "10",
    qty: 10,
    sku: "SKU-1",
    status: "in",
    strength_unit: "mg",
    strength_value: "500",
    supplier: "PharmaCorp",
    threshold: 5,
    updated_at: "",
    ...overrides,
  };
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    batch: "B-4412",
    expiry: "2030-01-31",
    id: "batch-1",
    item_id: "item-1",
    qty: 6,
    supplier: "PharmaCorp",
    ...overrides,
  };
}

const LATER = batch({
  batch: "B-9900",
  expiry: "2031-01-31",
  id: "batch-2",
  qty: 4,
});

let db: FakeDb;

function seed(seedData: Parameters<typeof createFakeDb>[0]) {
  db = createFakeDb({ inventory_items: [item()], ...seedData });
  getDb.mockReset();
  getDb.mockResolvedValue(db);
}

function request(qty: number) {
  return {
    id: "REQ-2026-0001",
    medicine: "Paracetamol 500 mg",
    qty,
    unit: "tabs",
  };
}

beforeEach(() => {
  seed({ inventory_batches: [batch(), LATER] });
});

describe("deductStock", () => {
  it("takes from the earliest-expiring batch and moves every table it should", async () => {
    const result = await deductStock(request(3), QUICK);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.batches).toEqual([
      { batch: "B-4412", expiry: "2030-01-31", qty: 3 },
    ]);
    expect(result.record.batch).toBe("B-4412");
    expect(result.record.qty).toBe(3);

    // The batch, the item total and its recomputed standing.
    expect(db.tables.inventory_batches[0]).toMatchObject({
      batch: "B-4412",
      qty: 3,
    });
    expect(db.tables.inventory_items[0]).toMatchObject({
      needs_batch: 0,
      qty: 7,
      status: "in",
    });
    // Analytics: Dashboard and Reports count this the same way they count a
    // stock-out (companion D10).
    expect(db.tables.dispensing_events[0]).toMatchObject({
      item_id: "item-1",
      qty: 3,
    });
    // Traceability: the audit entry names the request the movement belongs to.
    expect(db.tables.audit_log[0]).toMatchObject({
      action: "stock-out",
      request_ref: "REQ-2026-0001",
      target_id: "item-1",
    });
  });

  it("splits across batches when one cannot cover the quantity", async () => {
    const result = await deductStock(request(8), QUICK);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.batches.map((take) => take.batch)).toEqual([
      "B-4412",
      "B-9900",
    ]);
    // One hand-over, one record, both batch names.
    expect(result.record.batch).toBe("B-4412, B-9900");
    expect(result.snapshot.batches).toHaveLength(2);
    expect(db.tables.inventory_batches).toHaveLength(1);
    expect(db.tables.inventory_items[0]?.qty).toBe(2);
  });

  it("refuses a short quantity and writes nothing (D9)", async () => {
    const result = await deductStock(request(12), QUICK);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("short");
    expect(result.error.message).toBe("Only 10 tabs in stock.");
    expect(db.tables.inventory_items[0]?.qty).toBe(10);
    expect(db.tables.dispensing_events).toHaveLength(0);
    expect(db.tables.audit_log).toHaveLength(0);
  });

  it("takes from the item total when there are no batch rows (D7)", async () => {
    seed({ inventory_batches: [] });

    const result = await deductStock(request(3), QUICK);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.missingBatch).toBe(true);
    expect(result.plan.batches).toEqual([]);
    // An empty batch is recorded rather than an invented one.
    expect(result.record.batch).toBe("");
    expect(db.tables.inventory_items[0]).toMatchObject({
      needs_batch: 1,
      qty: 7,
    });
  });

  it("refuses an item with no batch rows on the queue path (the deliberate divergence)", async () => {
    seed({ inventory_batches: [] });

    const result = await deductStock(request(3));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("no-batch");
    expect(db.tables.inventory_items[0]?.qty).toBe(10);
  });

  it("refuses when every batch is expired rather than dispensing expired medicine", async () => {
    seed({
      inventory_batches: [batch({ expiry: "2020-01-31", qty: 10 })],
    });

    const result = await deductStock(request(3), QUICK);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("no-batch");
    expect(result.error.message).toContain("No dispensable batch");
    expect(db.tables.inventory_batches[0]?.qty).toBe(10);
    expect(db.tables.inventory_items[0]?.qty).toBe(10);
  });
});

describe("undoStock", () => {
  it("puts the item, a batch emptied by the take, and the day's total back", async () => {
    seed({ inventory_batches: [batch({ qty: 4 })] });

    const deducted = await deductStock(request(4), QUICK);
    expect(deducted.ok).toBe(true);
    if (!deducted.ok) {
      return;
    }
    // A batch that reaches zero is deleted (E5) — the reason the snapshot exists.
    expect(db.tables.inventory_batches).toHaveLength(0);
    expect(db.tables.inventory_items[0]?.qty).toBe(6);

    const reverted = await undoStock(deducted.snapshot);

    expect(reverted.ok).toBe(true);
    // Revived from the snapshot with its code, expiry, supplier and quantity.
    expect(db.tables.inventory_batches[0]).toMatchObject({
      batch: "B-4412",
      expiry: "2030-01-31",
      item_id: "item-1",
      qty: 4,
      supplier: "PharmaCorp",
    });
    expect(db.tables.inventory_items[0]).toMatchObject({
      needs_batch: 0,
      qty: 10,
      status: "in",
    });
    expect(db.tables.dispensing_events[0]?.qty).toBe(0);
    // The reversal is traceable on its own, because the caller deletes the card
    // (and with it the dispensing record) once the stock is back.
    expect(db.tables.audit_log).toHaveLength(2);
    expect(db.tables.audit_log[1]).toMatchObject({ action: "stock-in" });
  });

  it("refuses when the item no longer exists, leaving the stock alone (E7)", async () => {
    const deducted = await deductStock(request(3), QUICK);
    expect(deducted.ok).toBe(true);
    if (!deducted.ok) {
      return;
    }
    db.tables.inventory_items = [];

    const reverted = await undoStock(deducted.snapshot);

    expect(reverted.ok).toBe(false);
    if (reverted.ok) {
      return;
    }
    expect(reverted.error.message).toContain("no longer exists");
  });
});
