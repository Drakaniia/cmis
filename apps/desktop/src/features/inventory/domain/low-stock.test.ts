import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../types";
import {
  buildLowStockRows,
  calculateGap,
  calculateGapPercent,
  calculateSuggestedQty,
  classifyLowStock,
} from "./low-stock";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("low-stock domain", () => {
  it("classifyLowStock: 0 -> out-of-stock", () => {
    expect(classifyLowStock(0, 20)).toBe("out-of-stock");
  });
  it("classifyLowStock: < threshold -> low-stock", () => {
    expect(classifyLowStock(8, 15)).toBe("low-stock");
    expect(classifyLowStock(14, 15)).toBe("low-stock");
  });
  it("classifyLowStock: >= threshold -> in-stock", () => {
    expect(classifyLowStock(15, 15)).toBe("in-stock");
    expect(classifyLowStock(120, 20)).toBe("in-stock");
  });

  it("calculateGap threshold - current", () => {
    expect(calculateGap(8, 15)).toBe(7);
    expect(calculateGap(20, 20)).toBe(0);
    expect(calculateGap(25, 20)).toBe(-5);
  });

  it("calculateGapPercent clamped 0-100", () => {
    expect(calculateGapPercent(0, 20)).toBe(0);
    expect(calculateGapPercent(10, 20)).toBe(50);
    expect(calculateGapPercent(30, 20)).toBe(100);
    expect(calculateGapPercent(5, 0)).toBe(100);
    expect(calculateGapPercent(0, 0)).toBe(0);
  });

  it("calculateSuggestedQty max(threshold*2 - current, threshold)", () => {
    expect(calculateSuggestedQty(8, 15)).toBe(22); // 30-8=22
    expect(calculateSuggestedQty(0, 20)).toBe(40);
    expect(calculateSuggestedQty(120, 20)).toBe(20); // max(40-120=-80,20)=20
  });

  it("buildLowStockRows maps items to rows", () => {
    const items: InventoryItem[] = [
      {
        batches: [],
        category: "Analgesic",
        detailsIncomplete: false,
        dispensingHistory: [],
        displayName: "Paracetamol 500mg",
        expiry: daysFromNow(90),
        form: "tablet",
        id: "inv-001",
        name: "Paracetamol",
        packSize: "(100/box)",
        qty: 8,
        sku: "SKU-001",
        status: "low",
        strengthUnit: "mg",
        strengthValue: "500",
        supplier: "S",
        threshold: 15,
      },
    ];
    const rows = buildLowStockRows(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].lowStockStatus).toBe("low-stock");
    expect(rows[0].gap).toBe(7);
    expect(rows[0].suggestedQty).toBe(22);
  });
});
