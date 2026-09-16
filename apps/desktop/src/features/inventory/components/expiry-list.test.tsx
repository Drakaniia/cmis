import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import type { ExpiryRow, InventoryBatch, InventoryItem } from "../types";
import { ExpiryList } from "./expiry-list";

vi.mock("@tanstack/react-virtual", () => import("@/test/virtualizer-shim"));
vi.mock(
  "@cmis/ui/components/dropdown-menu",
  () => import("@/test/dropdown-menu-shim")
);
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}

function expiryRow(
  id: string,
  name: string,
  batchCode: string,
  daysUntil: number
): ExpiryRow {
  const batch: InventoryBatch = {
    batch: batchCode,
    expiry: daysFromNow(daysUntil),
    qty: 40,
    supplier: "PharmaCorp",
  };
  const item: InventoryItem = {
    batches: [batch],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: name,
    expiry: batch.expiry,
    form: "",
    id,
    name,
    packSize: "",
    qty: 40,
    sku: `SKU-${id}`,
    status: "in",
    strengthUnit: "",
    strengthValue: "",
    supplier: "PharmaCorp",
    threshold: 50,
  };
  return {
    batch,
    daysUntil,
    expiryStatus: daysUntil < 0 ? "expired" : "expiring-soon",
    item,
  };
}

const ROWS = [
  expiryRow("1", "Paracetamol 500mg", "LOT-1", -12),
  expiryRow("2", "Amoxicillin 250mg", "LOT-2", 3),
  expiryRow("3", "Ibuprofen 200mg", "LOT-3", 20),
];

function renderList(overrides: Partial<Parameters<typeof ExpiryList>[0]> = {}) {
  const onDelete = vi.fn();
  const onDispose = vi.fn();
  const onExtend = vi.fn();
  const onOpenInStockManagement = vi.fn();
  const onView = vi.fn();
  const props: Parameters<typeof ExpiryList>[0] = {
    density: "compact",
    onClearFilters: vi.fn(),
    onDelete,
    onDispose,
    onExtend,
    onOpenInStockManagement,
    onSort: vi.fn(),
    onToggleAll: vi.fn(),
    onToggleBatch: vi.fn(),
    onView,
    rows: ROWS,
    selectedBatchKeys: new Set<string>(),
    sortDir: "asc",
    sortKey: "expiry",
    totalUnfiltered: ROWS.length,
    ...overrides,
  };
  render(<ExpiryList {...props} />);
  return { onDelete, onDispose, onExtend, onOpenInStockManagement, onView };
}

describe("ExpiryList row activation", () => {
  it("opens the detail view when anywhere on the row body is clicked", async () => {
    const user = userEvent.setup();
    const { onView } = renderList();

    await user.click(screen.getByText("Amoxicillin 250mg"));

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView.mock.calls[0]?.[0]).toBe(ROWS[1]);
  });

  it("lets the row controls swallow the click", async () => {
    const user = userEvent.setup();
    const { onView, onDispose, onExtend } = renderList();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Select Paracetamol 500mg batch LOT-1",
      })
    );
    expect(onView).not.toHaveBeenCalled();

    const [disposeButton] = screen.getAllByRole("button", { name: "Dispose" });
    await user.click(disposeButton);
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();

    const [extendButton] = screen.getAllByRole("button", {
      name: "Extend expiry",
    });
    await user.click(extendButton);
    expect(onExtend).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();

    const [menuButton] = screen.getAllByRole("button", {
      name: "More actions",
    });
    await user.click(menuButton);
    expect(onView).not.toHaveBeenCalled();
  });

  it("routes the ⋯ View details item to the same handler as a row click", async () => {
    const user = userEvent.setup();
    const { onView } = renderList();

    const [firstViewDetails] = screen.getAllByRole("menuitem", {
      name: "View details",
    });
    await user.click(firstViewDetails);

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView.mock.calls[0]?.[0]).toBe(ROWS[0]);
  });

  it("does not open the detail view when a copy action is used", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) },
    });
    const { onView } = renderList();

    const [copySku] = screen.getAllByRole("menuitem", { name: "Copy SKU" });
    await user.click(copySku);

    expect(toast.success).toHaveBeenCalledWith("SKU copied");
    expect(onView).not.toHaveBeenCalled();
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
    expect(first).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowDown}");
    expect(third).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(second).toHaveFocus();

    await user.keyboard("{End}");
    expect(third).toHaveFocus();
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();

    // Arrow keys alone must not open anything.
    expect(onView).not.toHaveBeenCalled();
  });

  it("opens the focused row with Enter and with Space", async () => {
    const user = userEvent.setup();
    const { onView } = renderList();

    const second = screen.getByRole("row", { name: /Amoxicillin 250mg/ });
    second.focus();

    await user.keyboard("{Enter}");
    expect(onView.mock.calls[0]?.[0]).toBe(ROWS[1]);

    await user.keyboard(" ");
    expect(onView).toHaveBeenCalledTimes(2);
    expect(onView.mock.calls[1]?.[0]).toBe(ROWS[1]);
  });

  it("names each row for screen readers with item, batch, status and qty", () => {
    renderList();

    const first = screen.getByRole("row", { name: /Paracetamol 500mg/ });
    expect(first).toHaveAccessibleName(/LOT-1/);
    expect(first).toHaveAccessibleName(/Expired/);
    expect(first).toHaveAccessibleName(/40/);
  });
});
