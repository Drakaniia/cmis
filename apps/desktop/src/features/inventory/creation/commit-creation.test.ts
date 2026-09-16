import { describe, expect, it } from "vitest";
import { createFakeDb, type DbRow, type FakeDb } from "@/test/fake-db";
import { commitCreation } from "./commit-creation";
import type { DbLike } from "./db-like";
import {
  type BatchDraft,
  type CreationDraft,
  newBatchDraftRow,
  newProductDraft,
  type ProductDraft,
} from "./draft";

const ROLLBACK_FAILED = /locked — the automatic rollback failed too \(locked\)/;
const SKU_TAKEN = /SKU-AMOX-250 was taken while you were filling/;

const NOW = "2026-09-16T10:00:00.000Z";

const ITEM: DbRow = {
  category: "Antibiotic",
  created_at: "2026-01-01T00:00:00.000Z",
  display_name: "",
  dosage: "250mg caps",
  dosage_missing: 0,
  form: "",
  id: "item-1",
  is_no_stock: 0,
  name: "Amoxicillin",
  needs_batch: 0,
  notes: null,
  pack_size: "",
  qty: 40,
  sku: "SKU-AMOX-250",
  status: "low",
  stock_on_hand: 40,
  stock_remaining: 40,
  strength_unit: "",
  strength_value: "",
  supplier: null,
  threshold: 100,
  total_dispensed: 0,
  total_mismatch: 0,
  updated_at: "2026-01-01T00:00:00.000Z",
};

function batch(seed: Partial<BatchDraft> = {}): BatchDraft {
  return newBatchDraftRow({
    batch: "B-2027-01",
    expiry: "2027-03-01",
    qty: 200,
    ...seed,
  });
}

function productDraft(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return {
    ...newProductDraft(),
    batches: [
      batch({ batch: "B-2027-01", qty: 200 }),
      batch({ batch: "B-2027-02", expiry: "2027-05-01", qty: 200 }),
      batch({ batch: "B-2027-03", expiry: "2027-09-01", qty: 50 }),
    ],
    category: "Analgesic",
    name: "Paracetamol",
    sku: "SKU-PARA-500",
    strengthUnit: "mg",
    strengthValue: "500",
    ...overrides,
  };
}

function newProductCommit(draft: ProductDraft): CreationDraft {
  return { additions: [], newProducts: [draft] };
}

function additionCommit(itemId: string, batches: BatchDraft[]): CreationDraft {
  return { additions: [{ batches, itemId }], newProducts: [] };
}

/** Fails the `nth` statement starting with `prefix`, then behaves normally. */
function failOnNth(db: FakeDb, prefix: string, nth: number): DbLike {
  let seen = 0;
  return {
    execute: (sql, params) => {
      if (sql.startsWith(prefix)) {
        seen += 1;
        if (seen === nth) {
          return Promise.reject(new Error("disk full"));
        }
      }
      return db.execute(sql, params);
    },
    select: db.select,
  };
}

describe("commitCreation", () => {
  it("creates a product with every batch and derives qty, status and needs_batch", async () => {
    const db = createFakeDb();

    const result = await commitCreation(db, newProductCommit(productDraft()), {
      now: NOW,
    });

    expect(result).toEqual({
      addedBatches: 0,
      batches: 3,
      createdItems: 1,
      units: 450,
    });

    const [item] = db.tables.inventory_items;
    expect(item).toMatchObject({
      category: "Analgesic",
      display_name: "Paracetamol 500 mg",
      form: "",
      is_no_stock: 0,
      name: "Paracetamol",
      needs_batch: 0,
      qty: 450,
      sku: "SKU-PARA-500",
      status: "in",
      strength_unit: "mg",
      strength_value: "500",
      threshold: 20,
    });

    expect(db.tables.inventory_batches).toHaveLength(3);
    expect(db.tables.inventory_batches.map((row) => row.item_id)).toEqual([
      item.id,
      item.id,
      item.id,
    ]);
    expect(db.tables.inventory_batches.map((row) => row.batch)).toEqual([
      "B-2027-01",
      "B-2027-02",
      "B-2027-03",
    ]);

    // Atomic: the creation cannot exist without its audit row.
    expect(db.tables.audit_log).toHaveLength(1);
    expect(db.tables.audit_log[0]).toMatchObject({
      action: "stock-in",
      target_id: item.id,
      target_kind: "item",
    });
    expect(String(db.tables.audit_log[0].detail)).toContain(
      "Created Paracetamol 500 mg (SKU-PARA-500) — 3 batches, 450 units"
    );
  });

  it("derives a sub-threshold status from the batch total", async () => {
    const db = createFakeDb();

    await commitCreation(
      db,
      newProductCommit(
        productDraft({
          batches: [batch({ qty: 10 })],
          threshold: 20,
        })
      ),
      { now: NOW }
    );

    expect(db.tables.inventory_items[0]).toMatchObject({
      qty: 10,
      status: "low",
    });
  });

  it("registers a zero-stock product with no batch rows", async () => {
    const db = createFakeDb();

    const result = await commitCreation(
      db,
      newProductCommit(
        productDraft({ batches: [newBatchDraftRow()], zeroStock: true })
      ),
      { now: NOW }
    );

    expect(result).toMatchObject({ batches: 0, createdItems: 1, units: 0 });
    expect(db.tables.inventory_items[0]).toMatchObject({
      is_no_stock: 1,
      needs_batch: 1,
      qty: 0,
      status: "out",
    });
    expect(db.tables.inventory_batches).toHaveLength(0);
  });

  it("adds batches to an existing product and re-derives its status", async () => {
    const db = createFakeDb({ inventory_items: [ITEM] });

    const result = await commitCreation(
      db,
      additionCommit("item-1", [batch({ batch: "B-2027-09", qty: 60 })]),
      { now: NOW }
    );

    expect(result).toEqual({
      addedBatches: 1,
      batches: 1,
      createdItems: 0,
      units: 60,
    });
    expect(db.tables.inventory_items[0]).toMatchObject({
      needs_batch: 0,
      qty: 100,
      status: "in",
      updated_at: NOW,
    });
    expect(db.tables.inventory_batches).toHaveLength(1);
    expect(db.tables.inventory_batches[0]).toMatchObject({
      batch: "B-2027-09",
      item_id: "item-1",
      qty: 60,
    });
    expect(db.tables.audit_log[0]).toMatchObject({
      action: "stock-in",
      target_id: "item-1",
      target_kind: "item",
    });
    expect(String(db.tables.audit_log[0].detail)).toContain(
      "Added 1 batch to Amoxicillin — 60 units"
    );
  });

  it("refuses a SKU a concurrent write took, and leaves the database as it found it", async () => {
    const db = createFakeDb({ inventory_items: [ITEM] });

    await expect(
      commitCreation(
        db,
        newProductCommit(productDraft({ sku: "SKU-AMOX-250" })),
        { now: NOW }
      )
    ).rejects.toThrow(SKU_TAKEN);

    expect(db.tables.inventory_items).toHaveLength(1);
    expect(db.tables.inventory_items[0]).toMatchObject({ id: "item-1" });
    expect(db.tables.inventory_batches).toHaveLength(0);
    expect(db.tables.audit_log).toHaveLength(0);
  });

  it("removes the product and its batches when a batch insert fails halfway", async () => {
    const db = createFakeDb();
    const wrapped = failOnNth(db, "INSERT INTO inventory_batches", 2);

    await expect(
      commitCreation(wrapped, newProductCommit(productDraft()), { now: NOW })
    ).rejects.toThrow("disk full");

    expect(db.tables.inventory_items).toHaveLength(0);
    expect(db.tables.inventory_batches).toHaveLength(0);
    expect(db.tables.audit_log).toHaveLength(0);
  });

  it("restores an existing product's columns when the audit write fails", async () => {
    const db = createFakeDb({ inventory_items: [ITEM] });
    const wrapped = failOnNth(db, "INSERT INTO audit_log", 1);

    await expect(
      commitCreation(
        wrapped,
        additionCommit("item-1", [batch({ batch: "B-2027-09", qty: 60 })]),
        { now: NOW }
      )
    ).rejects.toThrow("disk full");

    // The batch is gone and qty/status/needs_batch/updated_at are back.
    expect(db.tables.inventory_batches).toHaveLength(0);
    expect(db.tables.inventory_items[0]).toMatchObject({
      needs_batch: 0,
      qty: 40,
      status: "low",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("says so when the rollback itself fails", async () => {
    const db = createFakeDb();
    const broken: DbLike = {
      execute: (sql, params) =>
        sql.startsWith("INSERT") || sql.startsWith("DELETE")
          ? Promise.reject(new Error("locked"))
          : db.execute(sql, params),
      select: db.select,
    };

    await expect(
      commitCreation(broken, newProductCommit(productDraft()), { now: NOW })
    ).rejects.toThrow(ROLLBACK_FAILED);
  });

  it("rejects a batch addition whose product no longer exists", async () => {
    const db = createFakeDb();

    await expect(
      commitCreation(db, additionCommit("gone", [batch()]), { now: NOW })
    ).rejects.toThrow("no longer in inventory");
  });
});
