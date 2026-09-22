import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InventoryItem, LowStockRow } from "../types";
import { LowStockList } from "./low-stock-list";

vi.mock("@tanstack/react-virtual", () => import("@/test/virtualizer-shim"));
vi.mock(
  "@cmis/ui/components/dropdown-menu",
  () => import("@/test/dropdown-menu-shim")
);

function lowStockRow(
  id: string,
  name: string,
  qty: number,
  threshold: number
): LowStockRow {
  const item: InventoryItem = {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: name,
    expiry: "",
    form: "",
    id,
    name,
    packSize: "",
    qty,
    sku: `SKU-${id}`,
    status: qty === 0 ? "out" : "low",
    strengthUnit: "",
    strengthValue: "",
    supplier: "PharmaCorp",
    threshold,
  };
  return {
    currentQty: qty,
    gap: threshold - qty,
    gapPercent: (qty / threshold) * 100,
    item,
    lowStockStatus: qty === 0 ? "out-of-stock" : "low-stock",
    suggestedQty: Math.max(threshold * 2 - qty, threshold),
    threshold,
  };
}

const ROWS = [
  lowStockRow("1", "Paracetamol 500mg", 0, 50),
  lowStockRow("2", "Amoxicillin 250mg", 12, 40),
  lowStockRow("3", "Ibuprofen 200mg", 30, 60),
];

function renderList(
  overrides: Partial<Parameters<typeof LowStockList>[0]> = {}
) {
  const onAdjustThreshold = vi.fn();
  const onOpenInStockManagement = vi.fn();
  const onReorder = vi.fn();
  const onView = vi.fn();
  const props: Parameters<typeof LowStockList>[0] = {
    density: "compact",
    onAdjustThreshold,
    onClearFilters: vi.fn(),
    onOpenInStockManagement,
    onReorder,
    onSort: vi.fn(),
    onToggleAll: vi.fn(),
    onToggleItem: vi.fn(),
    onView,
    rows: ROWS,
    selectedIds: new Set<string>(),
    sortDir: "asc",
    sortKey: "gap",
    totalUnfiltered: ROWS.length,
    ...overrides,
  };
  render(<LowStockList {...props} />);
  return { onAdjustThreshold, onOpenInStockManagement, onReorder, onView };
}

/** A pack-forming item: `600 mg sachet (10/box)`, stock counted in sachets. */
function packRow(qty: number, threshold: number): LowStockRow {
  const item: InventoryItem = {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 600 mg sachet (10/box)",
    expiry: "",
    form: "sachet",
    id: "pack-1",
    name: "Paracetamol",
    packQty: 10,
    packSize: "(10/box)",
    packUnit: "box",
    qty,
    sku: "SKU-PACK",
    status: "low",
    strengthUnit: "mg",
    strengthValue: "600",
    supplier: "PharmaCorp",
    threshold,
  };
  return {
    currentQty: qty,
    gap: threshold - qty,
    gapPercent: (qty / threshold) * 100,
    item,
    lowStockStatus: "low-stock",
    suggestedQty: Math.max(threshold * 2 - qty, threshold),
    threshold,
  };
}

/**
 * pack-size F11/AC17 — the moment a quantity can mean sachets or boxes, every
 * number the alert shows must name its unit, while the stored values, the meter
 * and the sorting stay base units.
 */
describe("LowStockList quantities name their unit", () => {
  it("reads the current level in both units and the threshold in base units", () => {
    renderList({ rows: [packRow(20, 20)] });

    expect(screen.getByText("20 sachet (2 box)")).toBeInTheDocument();
    expect(screen.getByText("20 sachet")).toBeInTheDocument();
    const meter = screen.getByRole("meter");
    // The meter's proportions remain base units (F11 rule 1).
    expect(meter).toHaveAttribute("aria-valuenow", "20");
    expect(meter).toHaveAttribute("aria-valuemax", "20");
    expect(meter).toHaveAccessibleName("20 of 20 sachet threshold");
  });

  it("breaks a remainder into packs plus base units, never a fraction", () => {
    renderList({ rows: [packRow(13, 20)] });

    expect(
      screen.getByText("13 sachet (1 box + 3 sachet)")
    ).toBeInTheDocument();
    expect(screen.queryByText(/1\.3/)).toBeNull();
    expect(screen.getByText("-7 sachet")).toBeInTheDocument(); // the gap
  });
});

describe("LowStockList row activation", () => {
  it("opens the detail view when anywhere on the row body is clicked", async () => {
    const user = userEvent.setup();
    const { onView } = renderList();

    await user.click(screen.getByText("Amoxicillin 250mg"));

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView.mock.calls[0]?.[0]).toBe(ROWS[1]);
  });

  it("lets the checkbox, the reorder button and the threshold button swallow the click", async () => {
    const user = userEvent.setup();
    const { onView, onReorder, onAdjustThreshold } = renderList();

    await user.click(
      screen.getByRole("checkbox", { name: "Select Paracetamol 500mg" })
    );
    expect(onView).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Reorder Paracetamol 500mg" })
    );
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "Adjust threshold for Paracetamol 500mg",
      })
    );
    expect(onAdjustThreshold).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();

    const [menuButton] = screen.getAllByRole("button", {
      name: "More actions",
    });
    await user.click(menuButton);
    expect(onView).not.toHaveBeenCalled();
  });

  it("offers no batch code to copy, because the page has no clicked batch", () => {
    renderList();

    expect(
      screen.queryAllByRole("menuitem", { name: "Copy batch code" })
    ).toHaveLength(0);
    expect(
      screen.getAllByRole("menuitem", { name: "View details" })
    ).toHaveLength(ROWS.length);
  });

  it("jumps to Stock Management with the row's item", async () => {
    const user = userEvent.setup();
    const { onOpenInStockManagement } = renderList();

    const [openInStock] = screen.getAllByRole("menuitem", {
      name: "Open in Stock Management",
    });
    await user.click(openInStock);

    expect(onOpenInStockManagement).toHaveBeenCalledTimes(1);
    expect(onOpenInStockManagement.mock.calls[0]?.[0]).toBe(ROWS[0]);
  });

  it("keeps exactly one row in the tab order and moves it with the arrow keys", async () => {
    const user = userEvent.setup();
    const { onView } = renderList();

    const first = screen.getByRole("row", { name: /Paracetamol 500mg/ });
    const second = screen.getByRole("row", { name: /Amoxicillin 250mg/ });
    const third = screen.getByRole("row", { name: /Ibuprofen 200mg/ });

    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("tabindex", "0");

    await user.keyboard("{End}");
    expect(third).toHaveFocus();
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();

    expect(onView).not.toHaveBeenCalled();
  });

  it("opens the focused row with Enter", async () => {
    const user = userEvent.setup();
    const { onView } = renderList();

    const second = screen.getByRole("row", { name: /Amoxicillin 250mg/ });
    second.focus();
    await user.keyboard("{Enter}");

    expect(onView.mock.calls[0]?.[0]).toBe(ROWS[1]);
  });

  it("names each row for screen readers with item, quantity, threshold and status", () => {
    renderList();

    const second = screen.getByRole("row", { name: /Amoxicillin 250mg/ });
    expect(second).toHaveAccessibleName(/12/);
    expect(second).toHaveAccessibleName(/40/);
    expect(second).toHaveAccessibleName(/Low/);
  });
});
