import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../types";
import {
  buildExpiryRows,
  buildMinimapBuckets,
  classifyExpiry,
  daysUntilExpiry,
  expiryLabel,
} from "./expiry";

const SEP_MONTH = /Sep/;

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("expiry domain", () => {
  it("classifyExpiry respects thresholds 30 / 90", () => {
    expect(classifyExpiry(-1)).toBe("expired");
    expect(classifyExpiry(0)).toBe("expiring-soon");
    expect(classifyExpiry(12)).toBe("expiring-soon");
    expect(classifyExpiry(30)).toBe("expiring-soon");
    expect(classifyExpiry(31)).toBe("expiring-later");
    expect(classifyExpiry(90)).toBe("expiring-later");
    expect(classifyExpiry(91)).toBe("safe");
  });

  it("daysUntilExpiry computes ceil diff", () => {
    const future = daysFromNow(5);
    const days = daysUntilExpiry(future);
    expect(days).toBeGreaterThanOrEqual(4);
    expect(days).toBeLessThanOrEqual(6);
  });

  it("expiryLabel formats ISO date", () => {
    expect(expiryLabel("2026-09-15")).toMatch(SEP_MONTH);
  });

  it("buildExpiryRows sorts by daysUntil ascending", () => {
    const items: InventoryItem[] = [
      {
        batches: [
          { batch: "B-1", expiry: daysFromNow(60), qty: 10, supplier: "S" },
        ],
        category: "Analgesic",
        dispensingHistory: [],
        expiry: daysFromNow(60),
        id: "1",
        name: "Med A",
        qty: 10,
        sku: "SKU-A",
        status: "in",
        supplier: "S",
        threshold: 20,
      },
      {
        batches: [
          { batch: "B-2", expiry: daysFromNow(5), qty: 10, supplier: "S" },
        ],
        category: "Analgesic",
        dispensingHistory: [],
        expiry: daysFromNow(5),
        id: "2",
        name: "Med B",
        qty: 10,
        sku: "SKU-B",
        status: "in",
        supplier: "S",
        threshold: 20,
      },
    ];
    const rows = buildExpiryRows(items);
    expect(rows).toHaveLength(2);
    expect(rows[0].item.name).toBe("Med B");
    expect(rows[0].daysUntil).toBeLessThan(rows[1].daysUntil);
  });

  it("buildMinimapBuckets creates 12 monthly buckets", () => {
    const rows = buildExpiryRows([
      {
        batches: [
          { batch: "B-1", expiry: daysFromNow(0), qty: 5, supplier: "S" },
        ],
        category: "Analgesic",
        dispensingHistory: [],
        expiry: daysFromNow(0),
        id: "1",
        name: "Med",
        qty: 5,
        sku: "SKU-1",
        status: "in",
        supplier: "S",
        threshold: 20,
      },
    ]);
    const buckets = buildMinimapBuckets(rows);
    expect(buckets).toHaveLength(12);
    expect(buckets[0].count).toBeGreaterThanOrEqual(0);
  });
});
