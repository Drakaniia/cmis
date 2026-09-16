import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useItemHistory } from "../hooks/use-item-history";
import type { InventoryItem } from "../types";
import { InventoryDetailContent } from "./inventory-detail";

// Both in-place views own their own database work; the panel's job is only to
// show them.
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

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [
      {
        batch: "LOT-8842",
        expiry: "2027-02-12",
        qty: 40,
        supplier: "PharmaCorp",
      },
    ],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500mg",
    expiry: "2027-02-12",
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

describe("InventoryDetailContent", () => {
  it("calls onEdit and onHistory so the buttons stop being dead code", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onHistory = vi.fn();
    render(
      <InventoryDetailContent
        item={item()}
        onEdit={onEdit}
        onHistory={onHistory}
        onStockIn={vi.fn()}
        onStockOut={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "History" }));
    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it("keeps Stock In and Stock Out working when the new props are absent", async () => {
    const user = userEvent.setup();
    const onStockIn = vi.fn();
    const onStockOut = vi.fn();
    render(
      <InventoryDetailContent
        item={item()}
        onStockIn={onStockIn}
        onStockOut={onStockOut}
      />
    );

    await user.click(screen.getByRole("button", { name: "Stock In" }));
    await user.click(screen.getByRole("button", { name: "Stock Out" }));

    expect(onStockIn).toHaveBeenCalledTimes(1);
    expect(onStockOut).toHaveBeenCalledTimes(1);
    // Still rendered for pages that do not supply handlers yet.
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
  });

  it("shows the real history in place when the surface has no view state of its own", async () => {
    const user = userEvent.setup();
    render(
      <InventoryDetailContent
        item={item()}
        onStockIn={vi.fn()}
        onStockOut={vi.fn()}
      />
    );

    expect(screen.getByText("Batches (FEFO)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "History" }));

    expect(useItemHistory).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1" }),
      true
    );
    expect(
      screen.getByText("No dispensing recorded for this item.")
    ).toBeInTheDocument();
    // The detail body is replaced, not stacked underneath.
    expect(screen.queryByText("Batches (FEFO)")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to details" }));
    expect(screen.getByText("Batches (FEFO)")).toBeInTheDocument();
  });

  it("leaves an in-place view when another row is selected", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <InventoryDetailContent
        item={item()}
        onStockIn={vi.fn()}
        onStockOut={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "History" }));
    expect(screen.queryByText("Batches (FEFO)")).toBeNull();

    rerender(
      <InventoryDetailContent
        item={item({ id: "item-2" })}
        onStockIn={vi.fn()}
        onStockOut={vi.fn()}
      />
    );

    expect(screen.getByText("Batches (FEFO)")).toBeInTheDocument();
  });
});
