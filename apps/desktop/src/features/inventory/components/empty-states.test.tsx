import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ExpiryList } from "./expiry-list";
import { LowStockList } from "./low-stock-list";

const BG_MUTED = /bg-muted/;
const BG_MUTED_TINT = /bg-muted\/20/;
const BORDER_ZERO = /border-0/;
const CLEAR_FILTERS = /clear filters/i;

const noop = () => undefined;

/**
 * "No data at all" renders as a plain status line; only a filter mismatch keeps
 * the dashed card, because that state needs a way out.
 */
function renderExpiry(totalUnfiltered: number) {
  const { container } = render(
    <ExpiryList
      density="comfortable"
      onClearFilters={vi.fn()}
      onDispose={noop}
      onExtend={noop}
      onOpenInStockManagement={noop}
      onSort={noop}
      onToggleAll={noop}
      onToggleBatch={noop}
      onView={noop}
      rows={[]}
      selectedBatchKeys={new Set()}
      sortDir="asc"
      sortKey="expiry"
      totalUnfiltered={totalUnfiltered}
    />
  );
  return container.querySelector('[data-slot="empty"]');
}

function renderLowStock(totalUnfiltered: number) {
  const { container } = render(
    <LowStockList
      density="comfortable"
      onAdjustThreshold={noop}
      onClearFilters={vi.fn()}
      onOpenInStockManagement={noop}
      onReorder={noop}
      onSort={noop}
      onToggleAll={noop}
      onToggleItem={noop}
      onView={noop}
      rows={[]}
      selectedIds={new Set()}
      sortDir="asc"
      sortKey="qty"
      totalUnfiltered={totalUnfiltered}
    />
  );
  return container.querySelector('[data-slot="empty"]');
}

/** No border width and no wash — `border-0 bg-transparent` is the unboxed look. */
function expectUnboxed(empty: Element | null) {
  expect(empty).not.toBeNull();
  expect(empty?.className).toMatch(BORDER_ZERO);
  expect(empty?.className).not.toMatch(BG_MUTED);
}

function expectFramed(empty: Element | null) {
  expect(empty).not.toBeNull();
  expect(empty?.className).toMatch(BG_MUTED_TINT);
}

it("expiring-soon list drops the box when there is nothing at all", () => {
  expectUnboxed(renderExpiry(0));
  expect(screen.getByText("No items expiring soon")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: CLEAR_FILTERS })
  ).not.toBeInTheDocument();
});

it("expiring-soon list keeps the framed card for a filter mismatch", () => {
  expectFramed(renderExpiry(12));
  expect(screen.getByText("No items match filters")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: CLEAR_FILTERS })
  ).toBeInTheDocument();
});

it("low-stock list drops the box when there is nothing at all", () => {
  expectUnboxed(renderLowStock(0));
  expect(screen.getByText("All items are well-stocked.")).toBeInTheDocument();
});

it("low-stock list keeps the framed card for a filter mismatch", () => {
  expectFramed(renderLowStock(7));
  expect(screen.getByText("No items match filters")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: CLEAR_FILTERS })
  ).toBeInTheDocument();
});
