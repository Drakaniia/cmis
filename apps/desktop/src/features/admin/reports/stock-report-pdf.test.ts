import { describe, expect, it } from "vitest";

import { groupByCategory } from "./stock-report-groups";
import {
  buildStockReportPdfPayload,
  STOCK_REPORT_LOCATION,
  stockReportPdfFilenamePrefix,
} from "./stock-report-pdf";
import type { StockLevelRow } from "./types";

function row(overrides: Partial<StockLevelRow> = {}): StockLevelRow {
  return {
    batches: 2,
    category: "Analgesic",
    expiry: "2026-10-01",
    expiryLabel: "Oct 1, 2026",
    expiryStatus: "expiring-soon",
    formStrength: "tablet · 500 mg",
    id: "1",
    name: "Paracetamol 500 mg",
    onHand: 50,
    packHint: "50 tablet (5 box)",
    sku: "PARA-500",
    status: "in-stock",
    threshold: 10,
    ...overrides,
  };
}

describe("stock report PDF payload", () => {
  it("maps groups, summary and context without re-sorting", () => {
    const rows = [
      row({ category: "Analgesic", id: "1", name: "B-Med" }),
      row({ category: "", id: "2", name: "A-Med" }),
    ];
    const groups = groupByCategory(rows, { dir: "asc", key: "status" });
    const payload = buildStockReportPdfPayload({
      activity: { dispensed: "12", received: "30" },
      asOf: "Stock as of Sep 22, 2026",
      category: "All",
      generatedAt: "Sep 22, 2026",
      grandTotal: {
        categories: 2,
        low: 0,
        medicines: 2,
        nearestExpiry: "Oct 1, 2026",
        out: 0,
        unitsOnHand: 100,
      },
      groups,
      month: "2026-09",
      monthLabel: "September 2026",
      operator: "Local user",
      summary: {
        categories: 2,
        expired: 0,
        expiringLater: 1,
        expiringSoon: 2,
        low: 0,
        medicines: 2,
        out: 0,
        unitsOnHand: 100,
      },
    });

    // Alphabetical groups, blank bucket last — the on-screen order.
    expect(payload.groups.map((group) => group.category)).toEqual([
      "Analgesic",
      "Uncategorized",
    ]);
    expect(payload.category_label).toBe("All categories");
    expect(payload.location).toBe(STOCK_REPORT_LOCATION);
    expect(payload.summary.units_on_hand).toBe(100);
    expect(payload.month_activity).toEqual({
      dispensed: "12",
      received: "30",
    });
    // Em-dash figures pass through untouched for the PDF to draw.
    const dash = buildStockReportPdfPayload({
      activity: { dispensed: "—", received: "—" },
      asOf: "Stock as of Sep 22, 2026",
      category: "Analgesic",
      generatedAt: "Sep 22, 2026",
      grandTotal: {
        categories: 1,
        low: 0,
        medicines: 1,
        nearestExpiry: "—",
        out: 0,
        unitsOnHand: 50,
      },
      groups: groups.slice(0, 1),
      month: "2026-09",
      monthLabel: "September 2026",
      operator: "Local user",
      summary: {
        categories: 1,
        expired: 0,
        expiringLater: 0,
        expiringSoon: 1,
        low: 0,
        medicines: 1,
        out: 0,
        unitsOnHand: 50,
      },
    });
    expect(dash.month_activity.received).toBe("—");
    expect(dash.category_label).toBe("Analgesic");
  });

  it("uses the timestamped PDF filename prefix", () => {
    expect(stockReportPdfFilenamePrefix("2026-09")).toBe(
      "cmis-stock-report-2026-09-"
    );
  });
});
