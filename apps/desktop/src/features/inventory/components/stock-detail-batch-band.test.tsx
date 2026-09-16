import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ExpiryRow, InventoryBatch, InventoryItem } from "../types";
import { StockDetailBatchBand } from "./stock-detail-batch-band";

const EXPIRED_DAYS = -12;
const NO_EXPIRY_RE = /no expiry on record/i;

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500mg",
    expiry: "2025-02-12",
    form: "",
    id: "item-1",
    name: "Paracetamol 500mg",
    packSize: "",
    qty: 40,
    sku: "SKU-PARA-40",
    status: "in",
    strengthUnit: "",
    strengthValue: "",
    supplier: "PharmaCorp",
    threshold: 50,
    ...overrides,
  };
}

function batch(overrides: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    batch: "LOT-8842",
    expiry: "2025-02-12",
    qty: 40,
    supplier: "PharmaCorp",
    ...overrides,
  };
}

function expiryRow(
  rowOverrides: Partial<ExpiryRow> = {},
  itemOverrides: Partial<InventoryItem> = {},
  batchOverrides: Partial<InventoryBatch> = {}
): ExpiryRow {
  return {
    batch: batch(batchOverrides),
    daysUntil: EXPIRED_DAYS,
    expiryStatus: "expired",
    item: item(itemOverrides),
    ...rowOverrides,
  };
}

describe("StockDetailBatchBand", () => {
  it("leads with the urgency headline, the batch facts, and the item context", () => {
    render(<StockDetailBatchBand row={expiryRow()} />);

    expect(screen.getByText("expired 12d ago")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText(/LOT-8842/)).toBeInTheDocument();
    expect(screen.getByText(/40/)).toBeInTheDocument();
    expect(screen.getByText(/PharmaCorp/)).toBeInTheDocument();
    // Locale-independent date assertion: the year must survive the format.
    expect(screen.getByText(/2025/)).toBeInTheDocument();
    expect(screen.getByText(/Analgesic/)).toBeInTheDocument();
    expect(screen.getByText(/Threshold 50/)).toBeInTheDocument();
    expect(screen.getByText(/12 days/)).toBeInTheDocument();
  });

  it("renders em-dashes for a batch with no code and no supplier", () => {
    render(
      <StockDetailBatchBand
        row={expiryRow({}, { supplier: "" }, { batch: "", supplier: "" })}
      />
    );

    // Batch code and supplier are both missing → two em-dashes, band still renders.
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("expired 12d ago")).toBeInTheDocument();
  });

  it("says there is no expiry rather than showing a broken date or NaN days", () => {
    render(
      <StockDetailBatchBand
        row={expiryRow(
          { daysUntil: Number.NaN, expiryStatus: "expired" },
          {},
          { expiry: "" }
        )}
      />
    );

    expect(screen.getByText(NO_EXPIRY_RE)).toBeInTheDocument();
    expect(screen.getByText("No expiry")).toBeInTheDocument();
    // No relative urgency is claimed when the date is unparseable.
    expect(screen.queryByText(/expired 12d ago/)).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/days\b/)).toBeNull();
  });

  it("treats an unparseable expiry string the same as a blank one", () => {
    render(
      <StockDetailBatchBand
        row={expiryRow({ daysUntil: Number.NaN }, {}, { expiry: "not-a-date" })}
      />
    );

    expect(screen.getByText(NO_EXPIRY_RE)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });
});
