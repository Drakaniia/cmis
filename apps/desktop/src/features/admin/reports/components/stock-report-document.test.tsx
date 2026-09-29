import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildGrandTotal, groupByCategory } from "../stock-report-groups";
import type { StockLevelRow } from "../types";
import { StockReportDocument } from "./stock-report-document";

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

function renderDocument(rows: StockLevelRow[] = [row()]) {
  const groups = groupByCategory(rows, { dir: "asc", key: "status" });
  render(
    <StockReportDocument
      activity={{ dispensed: "12", received: "30" }}
      asOf="Stock as of Sep 22, 2026"
      category="All"
      generatedAt="Sep 22, 2026, 10:00 AM"
      grandTotal={buildGrandTotal(groups)}
      groups={groups}
      location="Local"
      monthLabel="September 2026"
      operator="Local user"
      summary={{
        categories: 1,
        expired: 0,
        expiringLater: 1,
        expiringSoon: 1,
        low: 0,
        medicines: rows.length,
        out: 0,
        unitsOnHand: rows.reduce((sum, item) => sum + item.onHand, 0),
      }}
    />
  );
}

describe("StockReportDocument", () => {
  it("names the document and carries its context", () => {
    renderDocument();
    expect(
      screen.getByRole("heading", { name: "Stock Level Report" })
    ).toBeInTheDocument();
    expect(screen.getByText(/September 2026 · received/)).toBeInTheDocument();
    expect(screen.getByText(/Stock as of Sep 22, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Operator: Local user/)).toBeInTheDocument();
  });

  it("renders one row per medicine with the SKU", () => {
    renderDocument([
      row(),
      row({ id: "2", name: "Ibuprofen 200 mg", sku: "IBU-200" }),
    ]);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Paracetamol 500 mg")).toBeInTheDocument();
    expect(within(table).getByText("Ibuprofen 200 mg")).toBeInTheDocument();
    // SKU sits beside the name in the Medicine cell.
    expect(within(table).getByText(/\(PARA-500\)/)).toBeInTheDocument();
  });

  it("uses the shared status labels rather than raw status keys", () => {
    renderDocument();
    expect(screen.getByText("In Stock")).toBeInTheDocument();
    expect(screen.queryByText("in-stock")).not.toBeInTheDocument();
  });

  it("right-aligns the numeric columns", () => {
    renderDocument();
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    // Medicine, Form & strength, On hand, Pack hint, Threshold, Status, …
    const [, , onHandHeader, , , statusHeader] = headers;
    expect(onHandHeader).toHaveClass("text-right");
    expect(statusHeader).toHaveClass("text-center");
  });

  it("closes with a subtotal and a grand total", () => {
    renderDocument();
    expect(screen.getByText(/Analgesic subtotal/)).toBeInTheDocument();
    expect(screen.getByText(/Grand total · 1 category/)).toBeInTheDocument();
    expect(screen.getByText(/1 medicines · 50 units/)).toBeInTheDocument();
  });

  it("labels the blank category bucket", () => {
    renderDocument([row({ category: "", id: "9" })]);
    expect(
      screen.getByRole("heading", { name: /Uncategorized/ })
    ).toBeInTheDocument();
  });
});
