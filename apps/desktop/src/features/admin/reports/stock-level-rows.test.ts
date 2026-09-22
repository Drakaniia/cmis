import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@/features/inventory/types";
import {
  buildStockLevelRows,
  filterStockLevelRows,
  sortStockLevelRows,
} from "./stock-level-rows";

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

describe("buildStockLevelRows", () => {
  it("classifies status from qty and threshold", () => {
    const rows = buildStockLevelRows([
      item({ id: "a", qty: 0, threshold: 10 }),
      item({ id: "b", qty: 8, threshold: 10 }),
      item({ id: "c", qty: 10, threshold: 10 }),
    ]);
    expect(rows.map((r) => r.status)).toEqual([
      "out-of-stock",
      "low-stock",
      "in-stock",
    ]);
    expect(rows[1].onHand).toBe(8);
    expect(rows[1].threshold).toBe(10);
  });

  it("renders form and strength with a middle dot", () => {
    const rows = buildStockLevelRows([item({ form: "tab" })]);
    expect(rows[0].formStrength).toBe("tab · 500 mg");
  });

  it("degrades blank form and strength to an em dash", () => {
    const rows = buildStockLevelRows([
      item({ form: "", strengthUnit: "", strengthValue: "" }),
    ]);
    expect(rows[0].formStrength).toBe("—");
  });

  it("renders the pack hint when the pair is recorded", () => {
    const rows = buildStockLevelRows([
      item({ form: "sachet", packQty: 10, packUnit: "box", qty: 20 }),
    ]);
    expect(rows[0].packHint).toBe("20 sachet (2 box)");
    expect(rows[0].onHand).toBe(20);
  });

  it("degrades an unset pack pair to an em dash", () => {
    const rows = buildStockLevelRows([item({ form: "tab", qty: 7 })]);
    expect(rows[0].packHint).toBe("—");
  });

  it("carries expiry, its urgency and the batch count", () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 2);
    const rows = buildStockLevelRows([
      item({
        batches: [
          { batch: "B-1", expiry: farFuture.toISOString(), qty: 5, supplier: "S" },
        ],
        expiry: farFuture.toISOString(),
      }),
    ]);
    expect(rows[0].batches).toBe(1);
    expect(rows[0].expiryStatus).toBe("safe");
    expect(rows[0].expiryLabel).not.toBe("—");
  });

  it("degrades a blank expiry to an em dash and a null status", () => {
    const rows = buildStockLevelRows([item({ expiry: "" })]);
    expect(rows[0].expiryLabel).toBe("—");
    expect(rows[0].expiryStatus).toBeNull();
  });
});

describe("filterStockLevelRows", () => {
  const rows = buildStockLevelRows([
    item({ id: "a", name: "Paracetamol", sku: "SKU-001" }),
    item({
      category: "Antibiotic",
      id: "b",
      name: "Amoxicillin",
      sku: "SKU-002",
    }),
  ]);

  it("returns the list unchanged for a blank query", () => {
    expect(filterStockLevelRows(rows, "   ")).toBe(rows);
  });

  it("matches name, SKU and category case-insensitively", () => {
    expect(filterStockLevelRows(rows, "para").map((r) => r.id)).toEqual(["a"]);
    expect(filterStockLevelRows(rows, "sku-002").map((r) => r.id)).toEqual([
      "b",
    ]);
    expect(filterStockLevelRows(rows, "antibiotic").map((r) => r.id)).toEqual([
      "b",
    ]);
  });
});

describe("sortStockLevelRows", () => {
  const rows = buildStockLevelRows([
    item({ id: "safe", name: "Zinc", qty: 50, threshold: 10 }),
    item({ id: "out", name: "Amoxicillin", qty: 0, threshold: 10 }),
    item({ id: "low", name: "Paracetamol", qty: 4, threshold: 10 }),
  ]);

  it("orders by urgency, worst first, ascending", () => {
    expect(sortStockLevelRows(rows, "status", "asc").map((r) => r.id)).toEqual([
      "out",
      "low",
      "safe",
    ]);
  });

  it("orders by on-hand quantity without mutating the input", () => {
    const sorted = sortStockLevelRows(rows, "onHand", "desc");
    expect(sorted.map((r) => r.id)).toEqual(["safe", "low", "out"]);
    expect(rows.map((r) => r.id)).toEqual(["safe", "out", "low"]);
  });

  it("breaks ties on the label for a stable order", () => {
    const tied = buildStockLevelRows([
      item({ id: "z", name: "Zinc", qty: 5, threshold: 10 }),
      item({ id: "a", name: "Aspirin", qty: 5, threshold: 10 }),
    ]);
    expect(sortStockLevelRows(tied, "onHand", "asc").map((r) => r.id)).toEqual([
      "a",
      "z",
    ]);
  });
});
