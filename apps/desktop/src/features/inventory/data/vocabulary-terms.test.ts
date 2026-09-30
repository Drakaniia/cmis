import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-db";
import {
  resetVocabularyForTesting,
  vocabulary,
} from "../domain/vocabulary-store";
import {
  createVocabularyTerm,
  deleteVocabularyTerm,
  hydrateVocabulary,
  listVocabularyTerms,
  renameVocabularyTerm,
} from "./vocabulary-terms";

const getDb = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));
vi.mock("@/features/admin/audit/write-audit", () => ({
  recordAudit: vi.fn(() => Promise.resolve()),
}));

let db: FakeDb;

/** Statements `createFakeDb` does not model, so they are inert rather than fatal. */
const IGNORED = "write-audit";

function seed(): void {
  db = createFakeDb({
    inventory_items: [
      {
        display_name: "Paracetamol 500 mg tablet 10/box",
        form: "tablet",
        id: "item-1",
        name: "Paracetamol",
        pack_qty: 10,
        pack_size: "10/box",
        pack_unit: "box",
        strength_unit: "mg",
        strength_value: "500",
        updated_at: "",
      },
      {
        display_name: "Cefalexin 250 mg capsule",
        form: "capsule",
        id: "item-2",
        name: "Cefalexin",
        pack_qty: 0,
        pack_size: "",
        pack_unit: "",
        strength_unit: "mg",
        strength_value: "250",
        updated_at: "",
      },
    ],
    requests: [
      // Pre-0009: no `item_id`, so this row is matched by its copied text alone.
      {
        id: "req-1",
        item_id: null,
        medicine: "Paracetamol 500 mg tablet 10/box",
      },
      // Post-0009: the stable link protects it, and the text is historical.
      {
        id: "req-2",
        item_id: "item-1",
        medicine: "Paracetamol 500 mg tablet 10/box",
      },
    ],
    vocabulary_terms: [
      {
        created_at: "",
        id: "vt-form-tablet",
        kind: "form",
        name: "tablet",
        updated_at: "",
      },
      {
        created_at: "",
        id: "vt-form-capsule",
        kind: "form",
        name: "capsule",
        updated_at: "",
      },
      {
        created_at: "",
        id: "vt-strength-unit-mg",
        kind: "strength_unit",
        name: "mg",
        updated_at: "",
      },
      {
        created_at: "",
        id: "vt-pack-unit-box",
        kind: "pack_unit",
        name: "box",
        updated_at: "",
      },
    ],
  });
  getDb.mockReset();
  getDb.mockResolvedValue(db);
  resetVocabularyForTesting();
}

beforeEach(seed);

describe("listVocabularyTerms", () => {
  it("returns only the requested kind", async () => {
    const terms = await listVocabularyTerms("form");
    expect(terms.map((term) => term.name)).toEqual(["capsule", "tablet"]);
  });

  it("counts the items that carry each name", async () => {
    const terms = await listVocabularyTerms("form");
    expect(terms.find((term) => term.name === "tablet")?.usageCount).toBe(1);
    expect(terms.find((term) => term.name === "capsule")?.usageCount).toBe(1);
  });
});

describe("createVocabularyTerm", () => {
  it("adds the term and publishes it to the snapshot", async () => {
    await createVocabularyTerm("pack_unit", "crate");
    expect(vocabulary("pack_unit")).toContain("crate");
  });

  it("rejects a duplicate without writing", async () => {
    await expect(createVocabularyTerm("form", "tablet")).rejects.toThrow(
      /already exists/
    );
  });

  it("rejects a duplicate that differs only in case", async () => {
    await expect(createVocabularyTerm("form", "TABLET")).rejects.toThrow(
      /already exists/
    );
  });

  it("allows the same word in a different kind", async () => {
    // `box` is legitimately both a dose form and a pack container.
    await expect(createVocabularyTerm("form", "box")).resolves.toMatchObject({
      name: "box",
    });
  });
});

describe("renameVocabularyTerm", () => {
  it("recomposes display_name so the label follows its own parts", async () => {
    await renameVocabularyTerm("vt-form-tablet", "pill");
    const items = db.tables.inventory_items as Record<string, string>[];
    const item = items.find((row) => row.id === "item-1");
    expect(item?.form).toBe("pill");
    expect(item?.display_name).toBe("Paracetamol 500 mg pill 10/box");
  });

  it("regenerates pack_size when the pack unit is renamed", async () => {
    // `pack_size` is derived from the pair, so a container rename has to move it
    // too or the label and its parts disagree.
    await renameVocabularyTerm("vt-pack-unit-box", "crate");
    const items = db.tables.inventory_items as Record<string, string>[];
    const item = items.find((row) => row.id === "item-1");
    expect(item?.pack_unit).toBe("crate");
    expect(item?.pack_size).toBe("10/crate");
    expect(item?.display_name).toBe("Paracetamol 500 mg tablet 10/crate");
  });

  it("leaves an item with no pack pair alone when the unit is renamed", async () => {
    await renameVocabularyTerm("vt-pack-unit-box", "crate");
    const items = db.tables.inventory_items as Record<string, string>[];
    const item = items.find((row) => row.id === "item-2");
    expect(item?.pack_size).toBe("");
    expect(item?.display_name).toBe("Cefalexin 250 mg capsule");
  });

  it("repairs the copied text on a pre-0009 request", async () => {
    // `item_id IS NULL` means this row is found by normalised text alone, so a
    // rename that skipped it would silently detach its history.
    await renameVocabularyTerm("vt-form-tablet", "pill");
    const requests = db.tables.requests as Record<string, string | null>[];
    expect(requests.find((row) => row.id === "req-1")?.medicine).toBe(
      "Paracetamol 500 mg pill 10/box"
    );
  });

  it("leaves a post-0009 request's historical text alone", async () => {
    // `item_id` is the stable link, so the copied text is a record of what was
    // asked for and must not be rewritten.
    await renameVocabularyTerm("vt-form-tablet", "pill");
    const requests = db.tables.requests as Record<string, string | null>[];
    expect(requests.find((row) => row.id === "req-2")?.medicine).toBe(
      "Paracetamol 500 mg tablet 10/box"
    );
  });

  it("reports how many items moved, and updates the snapshot", async () => {
    const result = await renameVocabularyTerm("vt-form-capsule", "cap");
    expect(result.itemsUpdated).toBe(1);
    expect(vocabulary("form")).toContain("cap");
    expect(vocabulary("form")).not.toContain("capsule");
  });

  it("is a no-op when the name has not changed", async () => {
    const result = await renameVocabularyTerm("vt-form-tablet", "tablet");
    expect(result).toEqual({ itemsUpdated: 0, requestsUnresolved: 0 });
  });

  it("rejects a rename onto an existing term", async () => {
    await expect(
      renameVocabularyTerm("vt-form-tablet", "capsule")
    ).rejects.toThrow(/already exists/);
  });

  it("accepts a case-only rename, which is a relabel rather than a duplicate", async () => {
    // `ignore` is matched case-insensitively, so re-saving `tablet` as `TABLET`
    // is not a collision with itself. The table's UNIQUE is `(kind, name)` under
    // `COLLATE NOCASE`, and no other row holds either spelling, so SQLite allows
    // it too — the operator is fixing a capitalisation, not creating a rival.
    const result = await renameVocabularyTerm("vt-form-tablet", "TABLET");
    expect(result.itemsUpdated).toBe(1);
    const terms = await listVocabularyTerms("form");
    expect(terms.map((term) => term.name)).toContain("TABLET");
  });
});

describe("deleteVocabularyTerm", () => {
  it("refuses a term items still use, and says how many", async () => {
    await expect(deleteVocabularyTerm("vt-form-tablet")).rejects.toThrow(
      /1 item uses it/
    );
  });

  it("deletes an unused term and drops it from the snapshot", async () => {
    await createVocabularyTerm("pack_unit", "crate");
    const terms = await listVocabularyTerms("pack_unit");
    const crate = terms.find((term) => term.name === "crate");
    expect(crate).toBeDefined();
    await deleteVocabularyTerm(crate?.id ?? "");
    expect(vocabulary("pack_unit")).not.toContain("crate");
  });
});

describe("hydrateVocabulary", () => {
  it("publishes every kind the table holds", async () => {
    expect(await hydrateVocabulary()).toBe(true);
    expect(vocabulary("form")).toEqual(["capsule", "tablet"]);
    expect(vocabulary("strength_unit")).toEqual(["mg"]);
    expect(vocabulary("pack_unit")).toEqual(["box"]);
  });

  it("keeps the seeds for a kind the table has nothing for", async () => {
    // An empty read must not blank a dropdown the seed had just filled.
    db.tables.vocabulary_terms = [];
    expect(await hydrateVocabulary()).toBe(true);
    expect(vocabulary("form")).toContain("tablet");
  });

  it("reports false rather than throwing when the table is absent", async () => {
    // A database that predates migration 0013 and has not been migrated. The
    // snapshot keeps the seeds, which is a usable vocabulary.
    getDb.mockRejectedValue(new Error("no such table: vocabulary_terms"));
    expect(await hydrateVocabulary()).toBe(false);
    expect(vocabulary("form")).toContain("tablet");
  });
});

describe("IGNORED", () => {
  it("names the statements the fake db does not model", () => {
    expect(IGNORED).toBe("write-audit");
  });
});
