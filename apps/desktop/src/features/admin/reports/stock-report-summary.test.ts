import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@/features/inventory/types";
import {
  buildMonthActivity,
  buildStockSummary,
  formatAsOf,
} from "./stock-report-summary";

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

/** An ISO date `days` from now, so the shared bands can be exercised. */
function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function batch(expiry: string) {
  return { batch: "B-1", expiry, qty: 1, supplier: "S" };
}

describe("buildStockSummary", () => {
  it("returns zeros for an empty catalogue", () => {
    expect(buildStockSummary([])).toEqual({
      categories: 0,
      expired: 0,
      expiringLater: 0,
      expiringSoon: 0,
      low: 0,
      medicines: 0,
      out: 0,
      unitsOnHand: 0,
    });
  });

  it("counts medicines, units and distinct categories", () => {
    const summary = buildStockSummary([
      item({ category: "Analgesic", id: "a", qty: 5 }),
      item({ category: "Analgesic", id: "b", qty: 7 }),
      item({ category: "", id: "c", qty: 3 }),
    ]);
    expect(summary.medicines).toBe(3);
    expect(summary.unitsOnHand).toBe(15);
    expect(summary.categories).toBe(2);
  });

  it("classifies low and out stock with the shared classifier", () => {
    const summary = buildStockSummary([
      item({ id: "out", qty: 0, threshold: 10 }),
      item({ id: "low", qty: 4, threshold: 10 }),
      item({ id: "ok", qty: 10, threshold: 10 }),
    ]);
    expect(summary.low).toBe(1);
    expect(summary.out).toBe(1);
  });

  it("counts a medicine once per expiry band across its batches", () => {
    const summary = buildStockSummary([
      item({
        batches: [batch(isoInDays(10)), batch(isoInDays(20))],
        id: "soon",
      }),
      item({ batches: [batch(isoInDays(60))], id: "later" }),
      item({ batches: [batch(isoInDays(-3))], id: "expired" }),
      item({ batches: [batch(isoInDays(400))], id: "safe" }),
    ]);
    expect(summary.expiringSoon).toBe(1);
    expect(summary.expiringLater).toBe(1);
    expect(summary.expired).toBe(1);
  });

  it("falls back to the nearest expiry when no batches are recorded", () => {
    const summary = buildStockSummary([item({ expiry: isoInDays(10) })]);
    expect(summary.expiringSoon).toBe(1);
  });
});

describe("buildMonthActivity", () => {
  it("renders dashes when the month has no activity", () => {
    const activity = buildMonthActivity({
      dispensed: 0,
      hasActivity: false,
      received: 0,
    });
    expect(activity).toEqual({ dispensed: "—", received: "—" });
  });

  it("shows a real zero for a direction that moved nothing", () => {
    const activity = buildMonthActivity({
      dispensed: 0,
      hasActivity: true,
      received: 12,
    });
    expect(activity.received).toBe("12");
    expect(activity.dispensed).toBe("0");
  });
});

describe("formatAsOf", () => {
  it("stamps the snapshot so a screenshot is never read as history", () => {
    const asOf = formatAsOf(new Date(2026, 8, 21, 15, 4));
    expect(asOf.startsWith("Stock as of ")).toBe(true);
    expect(asOf).toContain("2026");
  });
});
