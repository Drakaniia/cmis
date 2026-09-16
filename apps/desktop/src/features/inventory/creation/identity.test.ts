import { describe, expect, it } from "vitest";
import { createFakeDb, type DbRow } from "@/test/fake-db";
import { allIdentityKeys } from "../domain/identity";
import { loadIdentityIndex } from "./identity";

/**
 * Identity is `name + all four strength fields` (decision 9). These tests pin the
 * two consequences that matter:
 *
 * - a row that has been backfilled is recognised by its **structured** key, which
 *   is what makes a re-import an update rather than a duplicate (§7.1);
 * - a row the backfill has not reached yet is still recognised by its legacy
 *   `name|dosage` text, so an interrupted migration cannot double the inventory.
 */

const IMPORTED: DbRow = {
  display_name: "",
  dosage: "500mg tabs",
  form: "",
  id: "item-1",
  name: "Paracetamol",
  pack_size: "",
  sku: "SKU-PARA-500",
  strength_unit: "",
  strength_value: "",
};

const CREATED: DbRow = {
  display_name: "Cetirizine 10 mg tablet",
  dosage: "10 mg tablet",
  form: "tablet",
  id: "item-2",
  name: "Cetirizine",
  pack_size: "",
  sku: "SKU-CET-10",
  strength_unit: "mg",
  strength_value: "10",
};

describe("loadIdentityIndex", () => {
  it("keys a row by its four fields, canonical and label form", async () => {
    const index = await loadIdentityIndex(
      createFakeDb({ inventory_items: [CREATED] })
    );

    expect(index.identities.get("cetirizine|10|mg|tablet|")).toMatchObject({
      id: "item-2",
    });
    expect(index.identities.get("cetirizine 10 mg tablet")).toMatchObject({
      id: "item-2",
    });
  });

  it("still keys a not-yet-backfilled row by its legacy dosage text", async () => {
    const index = await loadIdentityIndex(
      createFakeDb({ inventory_items: [IMPORTED] })
    );

    // The fallback key is built from the stored `dosage` exactly as typed, not
    // recomposed, so spacing drift in old data cannot break the match.
    expect(index.identities.get("paracetamol|500mg tabs")).toMatchObject({
      id: "item-1",
    });
  });

  it("matches a backfilled row and an import of the same medicine on one key", async () => {
    const index = await loadIdentityIndex(
      createFakeDb({ inventory_items: [CREATED] })
    );

    // What the importer computes for a template row of the same medication.
    const keys = allIdentityKeys({
      form: "tablet",
      name: "Cetirizine",
      packSize: "",
      strengthUnit: "mg",
      strengthValue: "10",
    });

    expect(keys.some((key) => index.identities.has(key))).toBe(true);
  });

  it("keeps SKUs as stored for deriveSku and lower-cased for validation", async () => {
    const index = await loadIdentityIndex(
      createFakeDb({ inventory_items: [IMPORTED, CREATED] })
    );

    expect([...index.rawSkus]).toEqual(["SKU-PARA-500", "SKU-CET-10"]);
    expect(index.skus.has("sku-para-500")).toBe(true);
    expect(index.skus.has("SKU-PARA-500")).toBe(false);
  });

  it("prefers the display name the row was stored with", async () => {
    const index = await loadIdentityIndex(
      createFakeDb({ inventory_items: [CREATED] })
    );

    expect(index.identities.get("cetirizine|10|mg|tablet|")?.name).toBe(
      "Cetirizine 10 mg tablet"
    );
  });

  it("returns an empty index for an empty database", async () => {
    const index = await loadIdentityIndex(createFakeDb());

    expect(index.identities.size).toBe(0);
    expect(index.rawSkus.size).toBe(0);
    expect(index.skus.size).toBe(0);
  });
});
