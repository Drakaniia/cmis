import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-db";
import { insertNewItemWithBatch } from "./create-item-with-batch";

const getDb = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

/** The four strength parts, blank by default — they are never required. */
const NO_STRENGTH = {
  form: "",
  packSize: "",
  strengthUnit: "",
  strengthValue: "",
};

let db: FakeDb;

beforeEach(() => {
  db = createFakeDb();
  getDb.mockReset();
  getDb.mockResolvedValue(db);
});

describe("insertNewItemWithBatch", () => {
  it("writes the product and its first batch, and returns the new id", async () => {
    const id = await insertNewItemWithBatch({
      ...NO_STRENGTH,
      batch: "LOT-1",
      category: "Analgesic",
      expiry: "2027-01-31",
      name: "Paracetamol",
      qty: 40,
      supplier: "PharmaCorp",
    });

    const [item] = db.tables.inventory_items;
    expect(item).toMatchObject({
      category: "Analgesic",
      id,
      name: "Paracetamol",
      qty: 40,
      status: "in",
      supplier: "PharmaCorp",
    });

    const [batch] = db.tables.inventory_batches;
    expect(batch).toMatchObject({
      batch: "LOT-1",
      expiry: "2027-01-31",
      item_id: id,
      qty: 40,
      supplier: "PharmaCorp",
    });
  });

  it("stores the strength columns and the composed display name", async () => {
    await insertNewItemWithBatch({
      batch: "LOT-9",
      category: "Analgesic",
      expiry: "2027-01-31",
      form: "tablet",
      name: "Paracetamol",
      packSize: "10",
      qty: 40,
      strengthUnit: "mg",
      strengthValue: "500",
      supplier: "PharmaCorp",
    });

    const [item] = db.tables.inventory_items;
    expect(item).toMatchObject({
      display_name: "Paracetamol 500 mg tablet 10",
      dosage_missing: 0,
      form: "tablet",
      pack_size: "10",
      strength_unit: "mg",
      strength_value: "500",
    });
  });

  it("flags details incomplete when the strength fields are left blank", async () => {
    await insertNewItemWithBatch({
      ...NO_STRENGTH,
      batch: "LOT-1",
      category: "Analgesic",
      expiry: "2027-01-31",
      name: "Paracetamol",
      qty: 40,
      supplier: "PharmaCorp",
    });

    const [item] = db.tables.inventory_items;
    expect(item?.dosage_missing).toBe(1);
    expect(item?.display_name).toBe("Paracetamol");
  });

  it("stores an absent supplier as an empty string, not null", async () => {
    await insertNewItemWithBatch({
      ...NO_STRENGTH,
      batch: "LOT-2",
      category: "Antibiotic",
      expiry: "2027-01-31",
      name: "Amoxicillin",
      qty: 12,
      supplier: null,
    });

    const [item] = db.tables.inventory_items;
    expect(item?.supplier).toBe("");
    const [batch] = db.tables.inventory_batches;
    expect(batch?.supplier).toBe("");
  });

  it("marks an empty first batch out of stock", async () => {
    await insertNewItemWithBatch({
      ...NO_STRENGTH,
      batch: "LOT-3",
      category: "Analgesic",
      expiry: "2027-01-31",
      name: "Ibuprofen",
      qty: 0,
      supplier: "PharmaCorp",
    });

    const [item] = db.tables.inventory_items;
    expect(item?.status).toBe("out");
  });

  it("skips the batch row when the wizard collected no batch code", async () => {
    await insertNewItemWithBatch({
      ...NO_STRENGTH,
      batch: "",
      category: "Analgesic",
      expiry: "",
      name: "Ibuprofen",
      qty: 5,
      supplier: "PharmaCorp",
    });

    expect(db.tables.inventory_items).toHaveLength(1);
    expect(db.tables.inventory_batches).toHaveLength(0);
  });
});
