import { describe, expect, it } from "vitest";

import type { InventoryItem } from "@/features/inventory/types";
import { searchStockItems } from "./item-search";

/**
 * Hand-built fixtures in the style of `stock-level-rows.test.ts`: the matcher is
 * pure, so it needs no database and no rendering (spec D18).
 */
function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    barcode: "5060123456789",
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500 mg tablet (100/box)",
    expiry: "",
    form: "tablet",
    id: "inv-001",
    name: "Paracetamol",
    packQty: 0,
    packSize: "100/box",
    packUnit: "box",
    qty: 20,
    sku: "SKU-001",
    status: "in",
    strengthUnit: "mg",
    strengthValue: "500",
    supplier: "PharmaCorp",
    threshold: 10,
    ...overrides,
  };
}

/** The ordered ids a query returns, which is what every ranking test asserts. */
function ids(items: InventoryItem[], query: string): string[] {
  return searchStockItems(items, query).matches.map((match) => match.item.id);
}

describe("searchStockItems", () => {
  it("returns an empty result for a blank or whitespace query", () => {
    expect(searchStockItems([item()], "")).toEqual({
      matches: [],
      total: 0,
    });
    expect(searchStockItems([item()], "   ")).toEqual({
      matches: [],
      total: 0,
    });
  });

  it("matches name, display name, SKU and barcode case-insensitively", () => {
    const catalogue = [item({ id: "para" })];

    expect(ids(catalogue, "paracetamol")).toEqual(["para"]);
    expect(ids(catalogue, "PARACETAMOL")).toEqual(["para"]);
    // The full stored label carries the dose form and pack, not just the name.
    expect(ids(catalogue, "tablet")).toEqual(["para"]);
    expect(ids(catalogue, "sku-001")).toEqual(["para"]);
    expect(ids(catalogue, "0123456789")).toEqual(["para"]);
  });

  it("collapses internal whitespace and trims before matching", () => {
    expect(ids([item()], "  para   500  ")).toEqual(["inv-001"]);
  });

  it("ranks an exact SKU above a name prefix above a mid-string substring", () => {
    const catalogue = [
      item({
        displayName: "Extra Paracetamol",
        id: "sub",
        name: "Extra Paracetamol",
        sku: "SKU-S",
      }),
      item({
        displayName: "Paracetamol",
        id: "prefix",
        name: "Paracetamol",
        sku: "SKU-P",
      }),
      item({ displayName: "Zinc", id: "exact", name: "Zinc", sku: "PARA" }),
    ];

    const result = searchStockItems(catalogue, "PARA");

    expect(result.matches.map((match) => match.item.id)).toEqual([
      "exact",
      "prefix",
      "sub",
    ]);
    expect(result.matches.map((match) => match.tier)).toEqual([0, 1, 2]);
  });

  it("breaks ties inside a tier alphabetically and stays stable across calls", () => {
    const catalogue = [
      item({
        displayName: "Paracetamol Compound",
        id: "compound",
        name: "Paracetamol Compound",
        sku: "SKU-2",
      }),
      item({
        displayName: "Paracetamol",
        id: "plain",
        name: "Paracetamol",
        sku: "SKU-1",
      }),
    ];

    expect(ids(catalogue, "para")).toEqual(["plain", "compound"]);
    expect(ids(catalogue, "para")).toEqual(ids(catalogue, "para"));
  });

  it("keeps catalogue order for two identically named items", () => {
    const catalogue = [
      item({ id: "a", name: "Paracetamol", sku: "SKU-002" }),
      item({ id: "b", name: "Paracetamol", sku: "SKU-001" }),
    ];

    expect(ids(catalogue, "paracetamol")).toEqual(["a", "b"]);
  });

  it("caps the matches but reports the true total, honouring a limit override", () => {
    const catalogue = Array.from({ length: 10 }, (_, index) =>
      item({
        id: `i-${index}`,
        name: `Paracetamol ${index}`,
        sku: `SKU-${index}`,
      })
    );

    const capped = searchStockItems(catalogue, "para");
    expect(capped.matches).toHaveLength(8);
    expect(capped.total).toBe(10);

    const limited = searchStockItems(catalogue, "para", { limit: 3 });
    expect(limited.matches).toHaveLength(3);
    expect(limited.total).toBe(10);
  });

  it("falls back to fuzzy matching when substring finds nothing", () => {
    const result = searchStockItems([item({ id: "para" })], "paracetmol");

    expect(result.matches.map((match) => match.item.id)).toEqual(["para"]);
    expect(result.matches[0]?.tier).toBe(3);
  });

  it("does not run fuzzy when substring already matched", () => {
    const catalogue = [
      item({
        displayName: "Paracetmol",
        id: "typo-name",
        name: "Paracetmol",
        sku: "SKU-T",
      }),
      item({
        displayName: "Paracetamol",
        id: "real",
        name: "Paracetamol",
        sku: "SKU-R",
      }),
    ];

    // "paracetmol" is a substring of the first item only, so the fallback never
    // runs and the fuzzy-only Paracetamol stays out of the list.
    expect(ids(catalogue, "paracetmol")).toEqual(["typo-name"]);
  });

  it("never matches on a blank barcode", () => {
    const catalogue = [
      item({ barcode: "", id: "blank", name: "Zinc", sku: "SKU-BLANK" }),
      item({ barcode: "9999", id: "coded", name: "Other", sku: "SKU-CODED" }),
    ];

    expect(ids(catalogue, "9999")).toEqual(["coded"]);
    expect(ids(catalogue, "5060123456789")).toEqual([]);
  });

  it("highlights the matched range in the label and the SKU", () => {
    const [byStrength] = searchStockItems([item()], "500").matches;
    expect(byStrength?.highlight.label).toEqual([[12, 15]]);
    expect(byStrength?.highlight.sku).toEqual([]);

    const [bySku] = searchStockItems([item()], "001").matches;
    expect(bySku?.highlight.label).toEqual([]);
    expect(bySku?.highlight.sku).toEqual([[4, 7]]);

    const [both] = searchStockItems(
      [item({ displayName: "SKU", name: "SKU", sku: "SKU-001" })],
      "sku"
    ).matches;
    expect(both?.highlight.label).toEqual([[0, 3]]);
    expect(both?.highlight.sku).toEqual([[0, 3]]);
  });

  it("reports empty (not undefined) highlight ranges for a fuzzy match", () => {
    const [match] = searchStockItems([item()], "paracetmol").matches;

    expect(match?.tier).toBe(3);
    expect(match?.highlight.label).toEqual([]);
    expect(match?.highlight.sku).toEqual([]);
  });
});
