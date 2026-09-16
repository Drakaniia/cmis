import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../types";
import {
  buildItemUpdate,
  draftFromItem,
  isRename,
  validateItemDraft,
} from "./item-update";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: true,
    dispensingHistory: [],
    displayName: "Paracetamol 500 mg",
    expiry: "",
    form: "",
    id: "item-1",
    name: "Paracetamol",
    packSize: "",
    qty: 40,
    sku: "SKU-PARA-40",
    status: "in",
    strengthUnit: "mg",
    strengthValue: "500",
    supplier: "PharmaCorp",
    threshold: 50,
    ...overrides,
  };
}

const OTHERS = [item(), item({ id: "item-2", sku: "SKU-AMOX-12" })];

describe("draftFromItem", () => {
  it("carries every editable field off the item, including the strength four", () => {
    expect(draftFromItem(item())).toMatchObject({
      category: "Analgesic",
      form: "",
      packSize: "",
      qty: 40,
      sku: "SKU-PARA-40",
      strengthUnit: "mg",
      strengthValue: "500",
      supplier: "PharmaCorp",
      threshold: 50,
    });
  });

  it("edits the bare name, not the composed list label", () => {
    expect(draftFromItem(item()).name).toBe("Paracetamol");
  });
});

describe("validateItemDraft", () => {
  it("accepts a clean draft", () => {
    expect(validateItemDraft(draftFromItem(item()), OTHERS, "item-1")).toEqual(
      {}
    );
  });

  it("requires a name", () => {
    const draft = { ...draftFromItem(item()), name: "   " };
    expect(validateItemDraft(draft, OTHERS, "item-1").name).toBeDefined();
  });

  it("requires a SKU that is unique across the inventory", () => {
    const draft = { ...draftFromItem(item()), sku: "SKU-AMOX-12" };
    expect(validateItemDraft(draft, OTHERS, "item-1").sku).toBeDefined();
  });

  it("lets an item keep its own SKU", () => {
    const draft = { ...draftFromItem(item()), sku: "SKU-PARA-40" };
    expect(validateItemDraft(draft, OTHERS, "item-1").sku).toBeUndefined();
  });

  it("rejects a blank SKU", () => {
    const draft = { ...draftFromItem(item()), sku: "  " };
    expect(validateItemDraft(draft, OTHERS, "item-1").sku).toBeDefined();
  });

  it("rejects a negative, fractional or empty quantity", () => {
    const base = draftFromItem(item());
    expect(
      validateItemDraft({ ...base, qty: -1 }, OTHERS, "item-1").qty
    ).toBeDefined();
    expect(
      validateItemDraft({ ...base, qty: 1.5 }, OTHERS, "item-1").qty
    ).toBeDefined();
    expect(
      validateItemDraft({ ...base, qty: Number.NaN }, OTHERS, "item-1").qty
    ).toBeDefined();
  });

  it("rejects a negative or fractional threshold", () => {
    const base = draftFromItem(item());
    expect(
      validateItemDraft({ ...base, threshold: -5 }, OTHERS, "item-1").threshold
    ).toBeDefined();
    expect(
      validateItemDraft({ ...base, threshold: 2.5 }, OTHERS, "item-1").threshold
    ).toBeDefined();
  });

  it("caps pack size at 40 characters", () => {
    const base = draftFromItem(item());
    const long = "x".repeat(41);
    expect(
      validateItemDraft({ ...base, packSize: long }, OTHERS, "item-1").packSize
    ).toBeDefined();
    expect(
      validateItemDraft({ ...base, packSize: "x".repeat(40) }, OTHERS, "item-1")
        .packSize
    ).toBeUndefined();
  });

  it("never blocks saving on empty strength fields", () => {
    const draft = {
      ...draftFromItem(item()),
      form: "",
      packSize: "",
      strengthUnit: "",
      strengthValue: "",
    };
    expect(validateItemDraft(draft, OTHERS, "item-1")).toEqual({});
  });
});

describe("buildItemUpdate", () => {
  it("recomputes status from the quantity and threshold", () => {
    const base = draftFromItem(item());
    expect(buildItemUpdate(item(), { ...base, qty: 0 }).status).toBe("out");
    expect(buildItemUpdate(item(), { ...base, qty: 20 }).status).toBe("low");
    expect(buildItemUpdate(item(), { ...base, qty: 80 }).status).toBe("in");
  });

  it("flags details incomplete when any of the four strength fields is blank", () => {
    const complete = {
      ...draftFromItem(item()),
      form: "tablet",
      packSize: "10",
      strengthUnit: "mg",
      strengthValue: "500",
    };

    expect(buildItemUpdate(item(), complete).dosage_missing).toBe(0);
    for (const field of [
      "form",
      "packSize",
      "strengthUnit",
      "strengthValue",
    ] as const) {
      expect(
        buildItemUpdate(item(), { ...complete, [field]: "" }).dosage_missing,
        `${field} blank should count as incomplete`
      ).toBe(1);
    }
  });

  it("derives the display name the request matching reads", () => {
    const update = buildItemUpdate(item(), {
      ...draftFromItem(item()),
      form: "tablet",
      name: "Paracetamol",
      packSize: "10",
      strengthUnit: "mg",
      strengthValue: "500",
    });

    expect(update.display_name).toBe("Paracetamol 500 mg tablet 10");
  });

  it("trims every text field it writes", () => {
    const update = buildItemUpdate(item(), {
      ...draftFromItem(item()),
      category: "  Antibiotic  ",
      name: "  Amoxicillin  ",
      sku: "  SKU-AMOX-9  ",
      supplier: "  MedSupply Co  ",
    });

    expect(update.category).toBe("Antibiotic");
    expect(update.name).toBe("Amoxicillin");
    expect(update.sku).toBe("SKU-AMOX-9");
    expect(update.supplier).toBe("MedSupply Co");
  });
});

describe("isRename", () => {
  it("is true only when the name actually changed", () => {
    const base = draftFromItem(item());
    expect(isRename(item(), base)).toBe(false);
    expect(isRename(item(), { ...base, qty: 5 })).toBe(false);
    expect(isRename(item(), { ...base, name: "Paracetamol 500mg" })).toBe(true);
  });

  it("treats surrounding whitespace as no change", () => {
    const base = draftFromItem(item());
    expect(isRename(item(), { ...base, name: "  Paracetamol  " })).toBe(false);
  });
});
