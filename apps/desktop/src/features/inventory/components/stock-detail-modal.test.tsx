import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useItemHistory } from "../hooks/use-item-history";
import type { InventoryBatch, InventoryItem } from "../types";
import { StockDetailModal } from "./stock-detail-modal";

// The history and edit views own their own database work; the modal's job is
// only to show them.
vi.mock("../hooks/use-item-history", () => ({ useItemHistory: vi.fn() }));
vi.mock("../hooks/use-item-update", () => ({
  useItemUpdateMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("../hooks/use-categories", () => import("@/test/categories-mock"));
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(useItemHistory).mockReturnValue({
    hasMore: false,
    isError: false,
    isLoading: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    rows: [],
    totals: { first: null, last: null, records: 0, units: 0 },
  });
});

const EXPIRED_DAYS_AGO = 12;
const EXPIRED_HEADLINE = `expired ${EXPIRED_DAYS_AGO}d ago`;
const DETAIL_TITLE = "Item details";

// Top level, so a case is not compiling a fresh pattern on each assertion.
const ITEM_NAME_RE = /Paracetamol 500mg/;
const ITEM_HEADER_RE = /Paracetamol 500mg — Analgesic/;
const BATCH_CODE_RE = /LOT-8842/;
const NAME_FIELD_RE = /Name/;

/** The band reads the real clock, so the fixture has to as well. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [
      {
        batch: "LOT-8842",
        expiry: daysAgo(EXPIRED_DAYS_AGO),
        qty: 40,
        supplier: "PharmaCorp",
      },
    ],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500mg",
    expiry: daysAgo(EXPIRED_DAYS_AGO),
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
    expiry: daysAgo(EXPIRED_DAYS_AGO),
    qty: 40,
    supplier: "PharmaCorp",
    ...overrides,
  };
}

function renderModal(
  props: Partial<Parameters<typeof StockDetailModal>[0]> = {}
) {
  return render(
    <StockDetailModal
      item={item()}
      onOpenChange={vi.fn()}
      onStockIn={vi.fn()}
      onStockOut={vi.fn()}
      open
      {...props}
    />
  );
}

describe("StockDetailModal", () => {
  it("reuses the shared detail surface and names itself after the item", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toHaveAccessibleName(ITEM_NAME_RE);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText(DETAIL_TITLE)).toBeInTheDocument();
    expect(screen.getByText(ITEM_HEADER_RE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stock In" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stock Out" })
    ).toBeInTheDocument();
  });

  it("shows the batch band when a batch is passed and omits it otherwise", () => {
    const { rerender } = renderModal({ batch: batch() });

    expect(screen.getByText(EXPIRED_HEADLINE)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName(BATCH_CODE_RE);

    // Low-Stock Alerts passes no batch — no band, no batch in the name.
    rerender(
      <StockDetailModal
        item={item()}
        onOpenChange={vi.fn()}
        onStockIn={vi.fn()}
        onStockOut={vi.fn()}
        open
      />
    );
    expect(screen.queryByText(EXPIRED_HEADLINE)).toBeNull();
  });

  it("renders nothing while closed", () => {
    renderModal({ open: false });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(DETAIL_TITLE)).toBeNull();
  });

  it("closes on Escape and from the close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderModal({ onOpenChange });

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it("only offers the contextual actions the page passes in", () => {
    renderModal({ onReorder: vi.fn() });

    expect(screen.getByRole("button", { name: "Reorder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dispose" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Extend expiry" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Adjust threshold" })
    ).toBeNull();
  });

  it("swaps the detail body for the edit form and back", async () => {
    const user = userEvent.setup();
    renderModal({ items: [item()] });

    expect(screen.getByText("Batches (FEFO)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit item")).toBeInTheDocument();
    // The detail body is gone, not merely relabelled.
    expect(screen.queryByText("Batches (FEFO)")).toBeNull();
    expect(screen.getByLabelText(NAME_FIELD_RE)).toHaveValue(
      "Paracetamol 500mg"
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(DETAIL_TITLE)).toBeInTheDocument();
    expect(screen.getByText("Batches (FEFO)")).toBeInTheDocument();
  });

  it("swaps the detail body for the real dispensing history", async () => {
    const user = userEvent.setup();
    renderModal({ items: [item()] });

    await user.click(screen.getByRole("button", { name: "History" }));

    expect(screen.getByText("Dispensing history")).toBeInTheDocument();
    expect(screen.queryByText("Batches (FEFO)")).toBeNull();
    expect(useItemHistory).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1" }),
      true
    );
    expect(
      screen.getByText("No dispensing recorded for this item.")
    ).toBeInTheDocument();
  });

  it("hands focus back to the row that opened it, so the list keeps its place", async () => {
    const user = userEvent.setup();

    // Stands in for a row: whatever was focused before the modal opened is what
    // a keyboard operator has to come back to (§6.4).
    function Harness() {
      const [open, setOpen] = useState(false);
      const handleOpen = useCallback(() => setOpen(true), []);
      return (
        <>
          <button onClick={handleOpen} type="button">
            Open details
          </button>
          <StockDetailModal
            item={item()}
            onOpenChange={setOpen}
            onStockIn={vi.fn()}
            onStockOut={vi.fn()}
            open={open}
          />
        </>
      );
    }

    render(<Harness />);
    const row = screen.getByRole("button", { name: "Open details" });

    await user.click(row);
    expect(screen.getByRole("dialog")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(row).toHaveFocus();
  });

  it("forwards every action to its handler without opening anything itself", async () => {
    const user = userEvent.setup();
    const onDispose = vi.fn();
    const onExtend = vi.fn();
    const onStockIn = vi.fn();
    const onStockOut = vi.fn();
    renderModal({ onDispose, onExtend, onStockIn, onStockOut });

    await user.click(screen.getByRole("button", { name: "Dispose" }));
    await user.click(screen.getByRole("button", { name: "Extend expiry" }));
    await user.click(screen.getByRole("button", { name: "Stock In" }));
    await user.click(screen.getByRole("button", { name: "Stock Out" }));

    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(onExtend).toHaveBeenCalledTimes(1);
    expect(onStockIn).toHaveBeenCalledTimes(1);
    expect(onStockOut).toHaveBeenCalledTimes(1);
  });
});
