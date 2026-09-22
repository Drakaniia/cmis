import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@/features/inventory/types";
import { buildStockLevelRows, filterStockLevelRows } from "./stock-level-rows";
import { buildGrandTotal, groupByCategory } from "./stock-report-groups";
import { buildStockSummary } from "./stock-report-summary";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500 mg tab",
    expiry: "",
    form: "tab",
    id: "inv-001",
    name: "Paracetamol",
    packQty: 0,
    packSize: "",
    packUnit: "",
    qty: 20,
    sku: "SKU-001",
    status: "in",
    strengthUnit: "mg",
    strengthValue: "500",
    supplier: "S",
    threshold: 10,
    ...overrides,
  };
}

const SORT = { dir: "asc", key: "status" } as const;

const ITEMS = [
  item({
    category: "Supplement",
    id: "z",
    name: "Zinc",
    qty: 50,
    threshold: 10,
  }),
  item({
    category: "Analgesic",
    id: "a",
    name: "Aspirin",
    qty: 0,
    threshold: 10,
  }),
  item({
    category: "Analgesic",
    id: "b",
    name: "Paracetamol",
    qty: 4,
    threshold: 10,
  }),
  item({ category: "", id: "u", name: "Unlabelled", qty: 3, threshold: 10 }),
];

describe("groupByCategory", () => {
  it("orders groups alphabetically with the blank bucket last", () => {
    const groups = groupByCategory(buildStockLevelRows(ITEMS), SORT);
    expect(groups.map((g) => g.label)).toEqual([
      "Analgesic",
      "Supplement",
      "Uncategorized",
    ]);
    expect(groups.at(-1)?.category).toBe("");
  });

  it("sorts within each group only", () => {
    const groups = groupByCategory(buildStockLevelRows(ITEMS), SORT);
    const analgesic = groups.find((g) => g.label === "Analgesic");
    expect(analgesic?.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("drops groups emptied by a search", () => {
    const rows = filterStockLevelRows(buildStockLevelRows(ITEMS), "Supplement");
    const groups = groupByCategory(rows, SORT);
    expect(groups.map((g) => g.label)).toEqual(["Supplement"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["z"]);
  });

  it("builds a per-group subtotal", () => {
    const groups = groupByCategory(buildStockLevelRows(ITEMS), SORT);
    const analgesic = groups.find((g) => g.label === "Analgesic");
    expect(analgesic?.subtotal).toEqual({
      low: 1,
      medicines: 2,
      nearestExpiry: "—",
      out: 1,
      unitsOnHand: 4,
    });
  });
});

describe("buildGrandTotal", () => {
  it("sums to the same figures as the summary block", () => {
    const rows = buildStockLevelRows(ITEMS);
    const grandTotal = buildGrandTotal(groupByCategory(rows, SORT));
    const summary = buildStockSummary(ITEMS);
    expect(grandTotal.medicines).toBe(summary.medicines);
    expect(grandTotal.unitsOnHand).toBe(summary.unitsOnHand);
    expect(grandTotal.low).toBe(summary.low);
    expect(grandTotal.out).toBe(summary.out);
    expect(grandTotal.categories).toBe(summary.categories);
  });
});
