import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockDetailMenu } from "./stock-detail-menu";

vi.mock(
  "@cmis/ui/components/dropdown-menu",
  () => import("@/test/dropdown-menu-shim")
);
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const VIEW_DETAILS = "View details";
const COPY_SKU = "Copy SKU";
const COPY_BATCH = "Copy batch code";
const COPY_NAME = "Copy item name";
const OPEN_IN_STOCK = "Open in Stock Management";
const COPY_FAILED = "Could not copy — copy manually";

function writeText(resolve: boolean) {
  const spy = vi.fn(() =>
    resolve ? Promise.resolve() : Promise.reject(new Error("denied"))
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: spy },
  });
  return spy;
}

function renderMenu(
  props: Partial<Parameters<typeof StockDetailMenu>[0]> = {}
) {
  return render(
    <StockDetailMenu
      itemName="Paracetamol 500mg"
      onOpenInStockManagement={vi.fn()}
      onView={vi.fn()}
      sku="SKU-PARA-40"
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StockDetailMenu", () => {
  it("offers the detail view, the copy actions, and the Stock Management jump", () => {
    renderMenu({ batchCode: "LOT-8842" });

    expect(
      screen.getByRole("menuitem", { name: VIEW_DETAILS })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: COPY_SKU })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: COPY_BATCH })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: COPY_NAME })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: OPEN_IN_STOCK })
    ).toBeInTheDocument();
  });

  it("omits the batch copy where there is no batch to copy", () => {
    renderMenu();

    expect(screen.queryByRole("menuitem", { name: COPY_BATCH })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: COPY_SKU })
    ).toBeInTheDocument();
  });

  it("keeps the batch-delete correction for pages that offer it", async () => {
    const user = userEvent.setup();
    const onDeleteBatch = vi.fn();

    const { rerender } = renderMenu({ onDeleteBatch });
    await user.click(screen.getByRole("menuitem", { name: "Delete batch" }));
    expect(onDeleteBatch).toHaveBeenCalledTimes(1);

    rerender(
      <StockDetailMenu
        itemName="Paracetamol 500mg"
        onOpenInStockManagement={vi.fn()}
        onView={vi.fn()}
        sku="SKU-PARA-40"
      />
    );
    expect(screen.queryByRole("menuitem", { name: "Delete batch" })).toBeNull();
  });

  it("opens the detail view and the Stock Management page without touching the clipboard", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onOpenInStockManagement = vi.fn();
    const clipboard = writeText(true);
    renderMenu({ onOpenInStockManagement, onView });

    await user.click(screen.getByRole("menuitem", { name: VIEW_DETAILS }));
    await user.click(screen.getByRole("menuitem", { name: OPEN_IN_STOCK }));

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onOpenInStockManagement).toHaveBeenCalledTimes(1);
    expect(clipboard).not.toHaveBeenCalled();
  });

  it("copies each value and confirms which one landed", async () => {
    const user = userEvent.setup();
    const clipboard = writeText(true);
    renderMenu({ batchCode: "LOT-8842" });

    await user.click(screen.getByRole("menuitem", { name: COPY_SKU }));
    expect(clipboard).toHaveBeenCalledWith("SKU-PARA-40");
    expect(toast.success).toHaveBeenCalledWith("SKU copied");

    await user.click(screen.getByRole("menuitem", { name: COPY_BATCH }));
    expect(clipboard).toHaveBeenCalledWith("LOT-8842");
    expect(toast.success).toHaveBeenCalledWith("Batch code copied");

    await user.click(screen.getByRole("menuitem", { name: COPY_NAME }));
    expect(clipboard).toHaveBeenCalledWith("Paracetamol 500mg");
    expect(toast.success).toHaveBeenCalledWith("Item name copied");
  });

  it("tells the operator to copy by hand when the webview refuses", async () => {
    const user = userEvent.setup();
    writeText(false);
    renderMenu();

    await user.click(screen.getByRole("menuitem", { name: COPY_SKU }));

    expect(toast.error).toHaveBeenCalledWith(COPY_FAILED);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not claim a copy happened when there is nothing to copy", async () => {
    const user = userEvent.setup();
    const clipboard = writeText(true);
    renderMenu({ sku: "   " });

    await user.click(screen.getByRole("menuitem", { name: COPY_SKU }));

    expect(clipboard).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(COPY_FAILED);
  });
});
