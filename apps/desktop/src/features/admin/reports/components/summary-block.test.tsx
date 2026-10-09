import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StockSummary } from "../types";
import { SummaryBlock } from "./summary-block";

const SUMMARY: StockSummary = {
  categories: 1,
  expired: 0,
  expiringLater: 0,
  expiringSoon: 0,
  low: 0,
  medicines: 1,
  out: 0,
  unitsOnHand: 5,
};

function renderBlock(isActivityLoading = false) {
  render(
    <SummaryBlock
      activity={{ dispensed: "4", received: "12" }}
      asOf="Stock as of Feb 1, 2026"
      category="All"
      isActivityLoading={isActivityLoading}
      monthLabel="February 2026"
      summary={SUMMARY}
    />
  );
}

describe("SummaryBlock", () => {
  it("shows the settled month figures when ready", () => {
    renderBlock();
    const block = screen.getByLabelText("Month summary");
    expect(block).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("reads a pending month as loading rather than as a quiet one", () => {
    renderBlock(true);
    const block = screen.getByLabelText("Month summary");
    expect(block).toHaveAttribute("aria-busy", "true");
    // The stale/placeholder figures are withheld while the month loads.
    expect(screen.queryByText("12")).not.toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });
});
