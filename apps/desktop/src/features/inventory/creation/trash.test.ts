import { beforeEach, describe, expect, it } from "vitest";
import {
  resetOperatorForTesting,
  setOperatorName,
} from "@/features/admin/audit/operator";
import { createFakeDb, type DbRow } from "@/test/fake-db";
import {
  describeTrashEntry,
  listTrash,
  purgeTrash,
  restoreBatch,
  restoreItem,
  softDeleteBatch,
  softDeleteItem,
  type TrashEntry,
} from "./trash";

const ITEM: DbRow = {
  category: "Analgesic",
  created_at: "2026-01-01T00:00:00.000Z",
  display_name: "",
  dosage: "500mg tabs",
  dosage_missing: 0,
  id: "item-1",
  is_no_stock: 0,
  name: "Paracetamol",
  needs_batch: 0,
  qty: 450,
  sku: "SKU-PARA-500",
  status: "in",
  stock_on_hand: 450,
  stock_remaining: 450,
  supplier: "MedSupply",
  threshold: 20,
  total_dispensed: 0,
  total_mismatch: 0,
  updated_at: "2026-01-01T00:00:00.000Z",
};

const BATCHES: DbRow[] = [
  {
    batch: "B-2027-01",
    expiry: "2027-03-01",
    id: "batch-1",
    item_id: "item-1",
    qty: 200,
    supplier: "MedSupply",
  },
  {
    batch: "B-2027-02",
    expiry: "2027-05-01",
    id: "batch-2",
    item_id: "item-1",
    qty: 200,
    supplier: "MedSupply",
  },
  {
    batch: "B-2027-03",
    expiry: "2027-09-01",
    id: "batch-3",
    item_id: "item-1",
    qty: 50,
    supplier: "MedSupply",
  },
];

const EVENTS: DbRow[] = [
  {
    date: "2026-08-01",
    day: 1,
    id: 1,
    item_id: "item-1",
    month: "2026-08",
    qty: 10,
  },
  {
    date: "2026-08-02",
    day: 2,
    id: 2,
    item_id: "item-1",
    month: "2026-08",
    qty: 4,
  },
];

function seeded() {
  return createFakeDb({
    dispensing_events: EVENTS,
    inventory_batches: BATCHES,
    inventory_items: [ITEM],
  });
}

function deleteOrder(db: ReturnType<typeof createFakeDb>): string[] {
  return db.statements
    .filter((entry) => entry.sql.startsWith("DELETE FROM"))
    .map((entry) => entry.sql);
}

describe("trash", () => {
  beforeEach(() => {
    resetOperatorForTesting();
    setOperatorName("A. Lim");
  });

  it("extracts a product, its batches and its history into one trash row before deleting children", async () => {
    const db = seeded();

    const summary = await softDeleteItem(db, "item-1", {
      reason: "Discontinued",
    });

    expect(summary.label).toBe("Paracetamol 500mg tabs");
    expect(summary.batchCount).toBe(3);
    expect(summary.dispensingCount).toBe(2);
    expect(summary.totalQty).toBe(450);

    expect(db.tables.trash_records).toHaveLength(1);
    const [record] = db.tables.trash_records;
    expect(record).toMatchObject({
      deleted_by: "A. Lim",
      entity_id: "item-1",
      item_id: "item-1",
      kind: "item",
      reason: "Discontinued",
      restore_hint: "SKU was SKU-PARA-500",
    });
    const snapshot = JSON.parse(String(record.snapshot)) as {
      batches: unknown[];
      dispensingEvents: unknown[];
      item: { qty: number };
    };
    expect(snapshot.batches).toHaveLength(3);
    expect(snapshot.dispensingEvents).toHaveLength(2);
    expect(snapshot.item.qty).toBe(450);

    expect(db.tables.inventory_items).toHaveLength(0);
    expect(db.tables.inventory_batches).toHaveLength(0);
    expect(db.tables.dispensing_events).toHaveLength(0);

    // Children first, parent last — the snapshot is authoritative, not the cascade.
    const order = deleteOrder(db);
    expect(order[0]).toContain("dispensing_events");
    expect(order[1]).toContain("inventory_batches");
    expect(order[2]).toContain("inventory_items");

    // Atomic: the deletion cannot exist without its audit row.
    expect(db.tables.audit_log).toHaveLength(1);
    expect(db.tables.audit_log[0]).toMatchObject({
      action: "correction",
      actor: "A. Lim",
      reason: "Discontinued",
      target_id: "item-1",
      target_kind: "item",
    });
    expect(String(db.tables.audit_log[0].detail)).toContain(
      "Deleted Paracetamol 500mg tabs → Trash"
    );
  });

  it("subtracts a deleted batch from qty and re-derives status and needs_batch", async () => {
    const db = seeded();

    const summary = await softDeleteBatch(db, { batchId: "batch-1" });

    expect(summary.qtyBefore).toBe(450);
    expect(summary.qtyAfter).toBe(250);
    expect(db.tables.inventory_items[0]).toMatchObject({
      needs_batch: 0,
      qty: 250,
      status: "in",
    });
    expect(db.tables.inventory_batches.map((row) => row.id)).toEqual([
      "batch-2",
      "batch-3",
    ]);
    expect(db.tables.trash_records[0]).toMatchObject({
      entity_id: "batch-1",
      item_id: "item-1",
      kind: "batch",
      label: "B-2027-01 · 200 units",
    });
  });

  it("never rebuilds qty from batches — the imported shape (qty with no batches) survives", async () => {
    // Imported products carry qty > 0 and zero batch rows, so the last batch of
    // such a product must not take the whole stock with it.
    const db = createFakeDb({
      inventory_batches: [
        {
          batch: "B-ONLY",
          expiry: "2027-01-01",
          id: "batch-only",
          item_id: "item-1",
          qty: 200,
          supplier: null,
        },
      ],
      inventory_items: [{ ...ITEM, needs_batch: 1, qty: 1000 }],
    });

    await softDeleteBatch(db, { batchId: "batch-only" });

    expect(db.tables.inventory_items[0]).toMatchObject({
      needs_batch: 1,
      qty: 800,
      status: "in",
    });
  });

  it("moves an item to out when its last batch is deleted", async () => {
    const db = createFakeDb({
      inventory_batches: [
        {
          batch: "B-ONLY",
          expiry: "2027-01-01",
          id: "batch-only",
          item_id: "item-1",
          qty: 250,
          supplier: null,
        },
      ],
      inventory_items: [{ ...ITEM, needs_batch: 0, qty: 250 }],
    });

    const summary = await softDeleteBatch(db, {
      batchName: "B-ONLY",
      itemId: "item-1",
    });

    expect(summary.qtyAfter).toBe(0);
    expect(db.tables.inventory_items[0]).toMatchObject({
      needs_batch: 1,
      qty: 0,
      status: "out",
    });
  });

  it("restores a product as a full undo, keeping the stored qty", async () => {
    const db = seeded();
    const { trashId } = await softDeleteItem(db, "item-1");

    const result = await restoreItem(db, trashId);

    expect(result).toEqual({
      kind: "item",
      label: "Paracetamol 500mg tabs",
      ok: true,
    });
    expect(db.tables.trash_records).toHaveLength(0);
    expect(db.tables.inventory_items).toHaveLength(1);
    expect(db.tables.inventory_items[0]).toMatchObject({
      id: "item-1",
      needs_batch: 0,
      qty: 450,
      sku: "SKU-PARA-500",
      status: "in",
    });
    expect(db.tables.inventory_batches).toHaveLength(3);
    expect(db.tables.dispensing_events).toHaveLength(2);
  });

  it("blocks a restore whose SKU was taken, and offers a suffixed one", async () => {
    const db = seeded();
    const { trashId } = await softDeleteItem(db, "item-1");
    db.tables.inventory_items.push({
      ...ITEM,
      id: "item-2",
      name: "Paracetamol (new)",
      qty: 10,
    });

    const blocked = await restoreItem(db, trashId);

    expect(blocked).toMatchObject({
      ok: false,
      reason: "sku-taken",
      suggestedSku: "SKU-PARA-500-2",
    });
    expect(db.tables.inventory_items).toHaveLength(1);

    const restored = await restoreItem(db, trashId, {
      skuOverride: "SKU-PARA-500-2",
    });

    expect(restored.ok).toBe(true);
    const restoredItem = db.tables.inventory_items.find(
      (row) => row.id === "item-1"
    );
    expect(restoredItem).toMatchObject({
      qty: 450,
      sku: "SKU-PARA-500-2",
      status: "in",
    });
  });

  it("restores a batch and puts its qty back on the product", async () => {
    const db = seeded();
    const { trashId } = await softDeleteBatch(db, { batchId: "batch-1" });

    const result = await restoreBatch(db, trashId);

    expect(result.ok).toBe(true);
    expect(db.tables.inventory_items[0].qty).toBe(450);
    expect(db.tables.inventory_batches).toHaveLength(3);
    expect(db.tables.trash_records).toHaveLength(0);
  });

  it("brings the product back with a batch whose product is itself in Trash", async () => {
    const db = seeded();
    const itemTrash = await softDeleteItem(db, "item-1");
    // A batch trashed separately before the product went: same shape, own row.
    db.tables.trash_records.push({
      deleted_at: "2026-09-01T00:00:00.000Z",
      deleted_by: "A. Lim",
      entity_id: "batch-1",
      id: "trash-batch-1",
      item_id: "item-1",
      kind: "batch",
      label: "B-2027-01 · 200 units",
      reason: null,
      restore_hint: "Batch of Paracetamol 500mg tabs",
      snapshot: JSON.stringify({
        batch: BATCHES[0],
        item: ITEM,
        kind: "batch",
      }),
    });

    const result = await restoreBatch(db, "trash-batch-1");

    expect(result.ok).toBe(true);
    expect(db.tables.inventory_items).toHaveLength(1);
    expect(db.tables.trash_records.map((row) => row.id)).not.toContain(
      itemTrash.trashId
    );
  });

  it("purges a product for good, and leaves qty alone when purging a batch", async () => {
    const db = seeded();
    const item = await softDeleteItem(db, "item-1");
    const summary = await purgeTrash(db, [item.trashId]);

    expect(summary).toEqual({ batches: 3, dispensingRecords: 2, products: 1 });
    expect(db.tables.trash_records).toHaveLength(0);
    expect(db.tables.inventory_items).toHaveLength(0);

    const db2 = seeded();
    const batch = await softDeleteBatch(db2, { batchId: "batch-1" });
    const qtyAfterDelete = db2.tables.inventory_items[0].qty;
    await purgeTrash(db2, [batch.trashId]);

    expect(db2.tables.trash_records).toHaveLength(0);
    // The subtraction already happened at delete time — purging must not repeat it.
    expect(db2.tables.inventory_items[0].qty).toBe(qtyAfterDelete);
  });

  it("lists trash with counts computed from the snapshot", async () => {
    const db = seeded();
    await softDeleteBatch(db, { batchId: "batch-1" });
    await softDeleteItem(db, "item-1");

    const entries = await listTrash(db);
    expect(entries).toHaveLength(2);
    const item = entries.find((entry) => entry.kind === "item");
    const batch = entries.find((entry) => entry.kind === "batch");
    expect(item).toBeDefined();
    expect(batch).toBeDefined();
    // The batch went first, so the product snapshot holds 250 units in 2 batches.
    expect(describeTrashEntry(item as TrashEntry)).toBe(
      "2 batches · 250 units"
    );
    expect(describeTrashEntry(batch as TrashEntry)).toBe(
      "200 units · exp 2027-03-01"
    );
    expect(item?.dispensingCount).toBe(2);
  });

  it("reports the operator fallback when no name is configured", async () => {
    resetOperatorForTesting();
    const db = seeded();

    await softDeleteItem(db, "item-1");

    expect(db.tables.trash_records[0].deleted_by).toBe("Local user");
    expect(db.tables.audit_log[0].actor).toBe("Local user");
  });
});
