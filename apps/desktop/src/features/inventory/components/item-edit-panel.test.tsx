import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryItem } from "../types";
import { ItemEditPanel } from "./item-edit-panel";

const mutate = vi.fn();
const useItemUpdateMutation = vi.fn(() => ({ isPending: false, mutate }));

vi.mock("../hooks/use-item-update", () => ({
  useItemUpdateMutation: () => useItemUpdateMutation(),
}));
// The category dropdown reads the shared category query; this panel only has to
// render it (its own behaviour is tested in category-picker.test.tsx).
vi.mock("../hooks/use-categories", () => import("@/test/categories-mock"));
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const SAVE = "Save";
const RENAME_WARNING = /renaming changes the medicine's display label/i;

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [
      { batch: "LOT-1", expiry: "2027-01-31", qty: 25, supplier: "PharmaCorp" },
      { batch: "LOT-2", expiry: "2027-06-30", qty: 15, supplier: "PharmaCorp" },
    ],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500 mg tablet 10",
    expiry: "2027-01-31",
    form: "tablet",
    id: "item-1",
    name: "Paracetamol",
    packSize: "10",
    qty: 40,
    sku: "SKU-1",
    status: "in",
    strengthUnit: "mg",
    strengthValue: "500",
    supplier: "PharmaCorp",
    threshold: 50,
    ...overrides,
  };
}

const OTHER = item({ id: "item-2", name: "Amoxicillin", sku: "SKU-2" });

function renderPanel(props: Partial<Parameters<typeof ItemEditPanel>[0]> = {}) {
  const onCancel = vi.fn();
  const onSaved = vi.fn();
  render(
    <ItemEditPanel
      item={item()}
      items={[item(), OTHER]}
      onCancel={onCancel}
      onSaved={onSaved}
      {...props}
    />
  );
  return { onCancel, onSaved };
}

beforeEach(() => {
  mutate.mockReset();
  useItemUpdateMutation.mockClear();
});

describe("ItemEditPanel", () => {
  it("prefills every field from the item", () => {
    renderPanel();

    expect(screen.getByLabelText(/Name/)).toHaveValue("Paracetamol");
    expect(screen.getByLabelText(/SKU/)).toHaveValue("SKU-1");
    expect(screen.getByLabelText(/Strength value/)).toHaveValue("500");
    expect(screen.getByLabelText(/Strength unit/)).toHaveValue("mg");
    expect(screen.getByLabelText(/^Form/)).toHaveValue("tablet");
    expect(screen.getByLabelText(/Pack size/)).toHaveValue("10");
    // A picker, not a `<select>`: the category is a stored row, and the panel
    // can add or rename one without leaving the edit.
    expect(screen.getByLabelText(/^Category/)).toHaveTextContent("Analgesic");
    expect(screen.getByLabelText(/Quantity/)).toHaveValue(40);
    expect(screen.getByLabelText(/Low-stock alert level/)).toHaveValue(50);
    expect(screen.getByLabelText(/Supplier/)).toHaveValue("PharmaCorp");
  });

  it("refuses to save a nameless product", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText(/Name/));
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
  });

  it("refuses a SKU another product already uses", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText(/SKU/));
    await user.type(screen.getByLabelText(/SKU/), "SKU-2");
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(mutate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Another product already uses this SKU.")
    ).toBeInTheDocument();
  });

  it("lets an item keep its own SKU", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("refuses a negative quantity", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText(/Quantity/));
    await user.type(screen.getByLabelText(/Quantity/), "-5");
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(mutate).not.toHaveBeenCalled();
  });

  it("saves with the strength fields left blank, flagging the details incomplete", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(screen.getByLabelText(/Strength unit/), "");
    await user.selectOptions(screen.getByLabelText(/^Form/), "");
    await user.clear(screen.getByLabelText(/Strength value/));
    await user.clear(screen.getByLabelText(/Pack size/));
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      display_name: "Paracetamol",
      dosage_missing: 1,
      id: "item-1",
    });
  });

  it("recomputes status from the quantity and threshold it saves", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText(/Quantity/));
    await user.type(screen.getByLabelText(/Quantity/), "0");
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ qty: 0, status: "out" });
  });

  it("warns about a rename only once the name changes", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.queryByText(RENAME_WARNING)).toBeNull();

    await user.clear(screen.getByLabelText(/Name/));
    await user.type(screen.getByLabelText(/Name/), "Paracetamol Extra");
    expect(screen.getByText(RENAME_WARNING)).toBeInTheDocument();
  });

  it("calls out when the quantity is not the sum of the item's batches", async () => {
    const user = userEvent.setup();
    renderPanel();

    // 25 + 15 = 40, which matches, so nothing is claimed up front.
    expect(screen.queryByText(/not the sum of this item's batches/)).toBeNull();

    await user.clear(screen.getByLabelText(/Quantity/));
    await user.type(screen.getByLabelText(/Quantity/), "12");
    expect(
      screen.getByText(/not the sum of this item's batches/)
    ).toBeInTheDocument();
  });

  it("reports a saved item back so the modal can refresh and close", async () => {
    const user = userEvent.setup();
    mutate.mockImplementation((_values, options) => options?.onSuccess?.());
    const { onSaved } = renderPanel();

    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("asks before throwing away unsaved edits", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderPanel();

    await user.type(screen.getByLabelText(/Supplier/), " Ltd");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
