import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-db";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from "./categories";

const getDb = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

let db: FakeDb;

function seed(): void {
  db = createFakeDb({
    categories: [
      {
        created_at: "2026-01-01T00:00:00.000Z",
        id: "cat-1",
        name: "Analgesic",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        created_at: "2026-01-01T00:00:00.000Z",
        id: "cat-2",
        name: "Antibiotic",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    inventory_items: [
      {
        category: "Analgesic",
        id: "item-1",
        name: "Paracetamol",
        updated_at: "",
      },
      {
        category: "Analgesic",
        id: "item-2",
        name: "Ibuprofen",
        updated_at: "",
      },
      {
        category: "Antibiotic",
        id: "item-3",
        name: "Amoxicillin",
        updated_at: "",
      },
      { category: "", id: "item-4", name: "Unlabelled", updated_at: "" },
    ],
  });
  getDb.mockReset();
  getDb.mockResolvedValue(db);
}

beforeEach(seed);

describe("listCategories", () => {
  it("returns every category with the number of items that use it", async () => {
    await expect(listCategories()).resolves.toEqual([
      { id: "cat-1", itemCount: 2, name: "Analgesic" },
      { id: "cat-2", itemCount: 1, name: "Antibiotic" },
    ]);
  });

  it("orders the list the way the dropdowns render it", async () => {
    const names = (await listCategories()).map((category) => category.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("createCategory", () => {
  it("adds the row and audits it as a settings change", async () => {
    const created = await createCategory("  Ophthalmic  ");

    expect(created).toMatchObject({ itemCount: 0, name: "Ophthalmic" });
    expect(db.tables.categories).toHaveLength(3);
    expect(db.tables.audit_log).toHaveLength(1);
    expect(db.tables.audit_log[0]).toMatchObject({
      action: "settings",
      detail: "Category added: Ophthalmic",
      target_id: created.id,
      target_kind: "settings",
    });
  });

  it("refuses a name another category already holds, ignoring case", async () => {
    await expect(createCategory("analgesic")).rejects.toThrow(
      "Analgesic already exists."
    );
    expect(db.tables.categories).toHaveLength(2);
  });

  it("refuses a blank name", async () => {
    await expect(createCategory("   ")).rejects.toThrow("Name is required.");
  });

  it("removes the row again when the audit write fails", async () => {
    const original = db.execute;
    db.execute = (sql, params) => {
      if (sql.startsWith("INSERT INTO audit_log")) {
        return Promise.reject(new Error("disk full"));
      }
      return original(sql, params);
    };

    await expect(createCategory("Ophthalmic")).rejects.toThrow("disk full");
    expect(db.tables.categories.map((row) => row.name)).not.toContain(
      "Ophthalmic"
    );
  });
});

describe("renameCategory", () => {
  it("cascades the new name over every item that used the old one", async () => {
    const result = await renameCategory("cat-1", "Pain relief");

    expect(result).toEqual({ itemsUpdated: 2 });
    expect(db.tables.categories.find((row) => row.id === "cat-1")?.name).toBe(
      "Pain relief"
    );
    const items = db.tables.inventory_items;
    expect(items.filter((row) => row.category === "Pain relief")).toHaveLength(
      2
    );
    expect(items.find((row) => row.id === "item-3")?.category).toBe(
      "Antibiotic"
    );
    expect(items.find((row) => row.id === "item-4")?.category).toBe("");
  });

  it("touches updated_at on the items it rewrote", async () => {
    await renameCategory("cat-1", "Pain relief");

    const updated = db.tables.inventory_items.find(
      (row) => row.id === "item-1"
    );
    expect(updated?.updated_at).not.toBe("");
  });

  it("records the old and new name so the audit diff can show both", async () => {
    await renameCategory("cat-2", " Antimicrobial ");

    expect(db.tables.audit_log[0]).toMatchObject({
      after_json: JSON.stringify({ itemsUpdated: 1, name: "Antimicrobial" }),
      before_json: JSON.stringify({ name: "Antibiotic" }),
      detail: "Category renamed: Antibiotic → Antimicrobial (1 item)",
    });
  });

  it("refuses a name another category already holds", async () => {
    await expect(renameCategory("cat-2", "Analgesic")).rejects.toThrow(
      "Analgesic already exists."
    );
    expect(db.tables.categories.find((row) => row.id === "cat-2")?.name).toBe(
      "Antibiotic"
    );
  });

  it("treats a save that changes nothing as a no-op", async () => {
    await expect(renameCategory("cat-1", "Analgesic")).resolves.toEqual({
      itemsUpdated: 0,
    });
    expect(db.tables.audit_log).toHaveLength(0);
  });

  it("refuses a category that is no longer there", async () => {
    await expect(renameCategory("cat-gone", "Pain relief")).rejects.toThrow(
      "That category no longer exists."
    );
  });

  it("puts the items and the category row back when the audit write fails", async () => {
    const original = db.execute;
    db.execute = (sql, params) => {
      if (sql.startsWith("INSERT INTO audit_log")) {
        return Promise.reject(new Error("disk full"));
      }
      return original(sql, params);
    };

    await expect(renameCategory("cat-1", "Pain relief")).rejects.toThrow(
      "disk full"
    );

    expect(db.tables.categories.find((row) => row.id === "cat-1")?.name).toBe(
      "Analgesic"
    );
    expect(
      db.tables.inventory_items.filter((row) => row.category === "Analgesic")
    ).toHaveLength(2);
  });
});

describe("deleteCategory", () => {
  it("removes an unreferenced category and audits the deletion", async () => {
    await createCategory("Ophthalmic");
    const created = db.tables.categories.find(
      (row) => row.name === "Ophthalmic"
    );
    db.tables.audit_log.length = 0;

    await deleteCategory(String(created?.id));

    expect(db.tables.categories.map((row) => row.name)).not.toContain(
      "Ophthalmic"
    );
    expect(db.tables.audit_log[0]).toMatchObject({
      action: "settings",
      detail: "Category deleted: Ophthalmic",
    });
  });

  it("refuses to delete a category items still use, and names the count", async () => {
    await expect(deleteCategory("cat-1")).rejects.toThrow(
      "Cannot delete Analgesic — 2 items use it. Reassign them first."
    );
    expect(db.tables.categories).toHaveLength(2);
    expect(db.tables.audit_log).toHaveLength(0);
  });

  it("counts references at delete time rather than trusting the caller", async () => {
    // The panel's row said zero items; the inventory gained one afterwards, so
    // the delete has to re-check instead of removing a name items still carry.
    db.tables.inventory_items.push({
      category: "Antibiotic",
      id: "item-9",
      name: "Azithromycin",
      updated_at: "",
    });

    await expect(deleteCategory("cat-2")).rejects.toThrow("2 items use it");
  });

  it("restores the row when the audit write fails", async () => {
    await createCategory("Ophthalmic");
    const created = db.tables.categories.find(
      (row) => row.name === "Ophthalmic"
    );
    const original = db.execute;
    db.execute = (sql, params) => {
      if (sql.startsWith("INSERT INTO audit_log")) {
        return Promise.reject(new Error("disk full"));
      }
      return original(sql, params);
    };

    await expect(deleteCategory(String(created?.id))).rejects.toThrow(
      "disk full"
    );
    expect(db.tables.categories.map((row) => row.name)).toContain("Ophthalmic");
  });
});
