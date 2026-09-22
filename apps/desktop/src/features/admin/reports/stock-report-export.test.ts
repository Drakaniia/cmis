import { describe, expect, it } from "vitest";

import type { InventoryExportSheet } from "@/features/inventory/import/export-xlsx";
import type { InventoryItem } from "@/features/inventory/types";
import { daysInMonth } from "@/lib/month";

import { buildStockLevelRows } from "./stock-level-rows";
import {
  buildExportRows,
  buildExportSummary,
  exportFileName,
  orderedExportRows,
} from "./stock-report-export";
import type { StockSummary } from "./types";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500 mg tabs",
    expiry: "",
    form: "tabs",
    id: "item-1",
    name: "Paracetamol",
    packQty: 20,
    packSize: "(100/box)",
    packUnit: "box",
    qty: 100,
    sku: "SKU-001",
    status: "in",
    strengthUnit: "mg",
    strengthValue: "500",
    supplier: "Acme Pharma",
    threshold: 10,
    ...overrides,
  };
}

const ITEMS: InventoryItem[] = [
  item({ category: "Analgesic", id: "a1", name: "Paracetamol", qty: 100 }),
  item({
    category: "Analgesic",
    id: "a2",
    name: "Ibuprofen",
    packQty: 0,
    packUnit: "",
    qty: 20,
  }),
  item({ category: "Antibiotic", id: "b1", name: "Amoxicillin", qty: 50 }),
  // `mapRowToItem` renders a blank stored category as `Uncategorized`; the
  // export must turn that back into a blank cell (E-F3).
  item({ category: "Uncategorized", id: "u1", name: "Cetirizine", qty: 5 }),
];

const ROWS = buildStockLevelRows(ITEMS);

const SUMMARY: StockSummary = {
  categories: 2,
  expired: 0,
  expiringLater: 0,
  expiringSoon: 1,
  low: 1,
  medicines: 4,
  out: 0,
  unitsOnHand: 175,
};

function sheetValue(
  sheet: InventoryExportSheet,
  label: string
): string | number | null | undefined {
  return sheet.rows.find((row) => row[0] === label)?.[1];
}

describe("exportFileName", () => {
  it("names the file after the selected month", () => {
    expect(exportFileName("2026-09")).toBe("cmis-stock-report-2026-09.xlsx");
  });
});

describe("daysInMonth", () => {
  it("follows the calendar, including leap February", () => {
    expect(daysInMonth("2026-01")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-09")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
  });
});

describe("orderedExportRows", () => {
  it("flattens the on-screen group order with the sort applied within groups", () => {
    const ordered = orderedExportRows({
      rows: ROWS,
      search: "",
      sort: { dir: "asc", key: "onHand" },
    });
    // Category groups alphabetical, `Uncategorized` last; on-hand ascending inside
    // each group.
    expect(ordered.map((row) => row.id)).toEqual(["a2", "a1", "b1", "u1"]);
  });

  it("honours the active sort direction", () => {
    const ordered = orderedExportRows({
      rows: ROWS,
      search: "",
      sort: { dir: "desc", key: "onHand" },
    });
    expect(ordered.map((row) => row.id)).toEqual(["a1", "a2", "b1", "u1"]);
  });

  it("narrows to the search query before ordering", () => {
    const ordered = orderedExportRows({
      rows: ROWS,
      search: "ibu",
      sort: { dir: "asc", key: "onHand" },
    });
    expect(ordered.map((row) => row.id)).toEqual(["a2"]);
  });
});

describe("buildExportRows", () => {
  const rows = buildExportRows({
    dailyByItem: new Map([["a1", [5, 3, 0]]]),
    items: ITEMS,
    rows: ROWS,
    search: "",
    sort: { dir: "asc", key: "onHand" },
  });
  const byId = new Map(rows.map((row) => [row.name, row]));

  it("writes the stored identity fields verbatim, not re-derived", () => {
    const paracetamol = byId.get("Paracetamol");
    expect(paracetamol?.strengthValue).toBe("500");
    expect(paracetamol?.strengthUnit).toBe("mg");
    expect(paracetamol?.form).toBe("tabs");
    expect(paracetamol?.packSize).toBe("(100/box)");
    expect(paracetamol?.packQty).toBe(20);
    expect(paracetamol?.packUnit).toBe("box");
  });

  it("derives total_dispensed from the days and stock_remaining from on-hand", () => {
    const paracetamol = byId.get("Paracetamol");
    expect(paracetamol?.daily).toEqual([5, 3, 0]);
    expect(paracetamol?.totalDispensed).toBe(8);
    expect(paracetamol?.stockOnHand).toBe(100);
    expect(paracetamol?.stockRemaining).toBe(92);
  });

  it("writes a blank cell for an unset pack pair and a blank category", () => {
    expect(byId.get("Ibuprofen")?.packQty).toBeNull();
    expect(byId.get("Ibuprofen")?.packUnit).toBe("");
    // Never the report-only `Uncategorized` label.
    expect(byId.get("Cetirizine")?.category).toBeNull();
  });
});

describe("buildExportSummary", () => {
  it("keeps the em dash for a quiet month and a real 0 for a received-only month", () => {
    const quiet = buildExportSummary({
      activity: { dispensed: "—", received: "—" },
      asOf: "Stock as of Sep 22, 2026",
      category: "All",
      monthLabel: "September 2026",
      operator: "Local user",
      search: "   ",
      summary: SUMMARY,
    });

    expect(quiet.name).toBe("Summary");
    expect(sheetValue(quiet, "Received")).toBe("—");
    expect(sheetValue(quiet, "Dispensed")).toBe("—");
    // Context is written in words, and a blank search says so rather than
    // leaving an ambiguous empty cell.
    expect(sheetValue(quiet, "Category")).toBe("All categories");
    expect(sheetValue(quiet, "Search")).toBe("none");
    expect(sheetValue(quiet, "Month")).toBe("September 2026");
    expect(sheetValue(quiet, "Medicines")).toBe(4);

    const receivedOnly = buildExportSummary({
      activity: { dispensed: "0", received: "12" },
      asOf: "Stock as of Sep 22, 2026",
      category: "Analgesic",
      monthLabel: "September 2026",
      operator: "Local user",
      search: "para",
      summary: SUMMARY,
    });

    expect(sheetValue(receivedOnly, "Received")).toBe(12);
    expect(sheetValue(receivedOnly, "Dispensed")).toBe(0);
    expect(sheetValue(receivedOnly, "Category")).toBe("Analgesic");
    expect(sheetValue(receivedOnly, "Search")).toBe("para");
  });
});
