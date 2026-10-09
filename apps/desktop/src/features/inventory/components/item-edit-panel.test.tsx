import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTerm } from "@/test/pick-term";
import type { InventoryItem } from "../types";
import { ItemEditPanel } from "./item-edit-panel";

const mutate = vi.fn();
// The panel awaits `mutateAsync` before it reports the save back, so the mock
// records the payload through the same spy and resolves.
const mutateAsync = vi.fn((values: unknown) => {
  mutate(values);
  return Promise.resolve(values);
});
const useItemUpdateMutation = vi.fn(() => ({
  isPending: false,
  mutate,
  mutateAsync,
}));

vi.mock("../hooks/use-item-update", () => ({
  useItemUpdateMutation: () => useItemUpdateMutation(),
}));
// The category dropdown reads the shared category query; this panel only has to
// render it (its own behaviour is tested in category-picker.test.tsx).
vi.mock("../hooks/use-categories", () => import("@/test/categories-mock"));
vi.mock(
  "../hooks/use-vocabulary-terms",
  () => import("@/test/vocabulary-mock")
);
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

// The panel invalidates the inventory query on save, so it needs a client in
// context even though the mutation itself is mocked.
function QueryWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPanel(props: Partial<Parameters<typeof ItemEditPanel>[0]> = {}) {
  const onCancel = vi.fn();
  const onSaved = vi.fn();
  render(
    <QueryWrapper>
      <ItemEditPanel
        item={item()}
        items={[item(), OTHER]}
        onCancel={onCancel}
        onSaved={onSaved}
        {...props}
      />
    </QueryWrapper>
  );
  return { onCancel, onSaved };
}

beforeEach(() => {
  mutate.mockReset();
  mutateAsync.mockClear();
  useItemUpdateMutation.mockClear();
});

describe("ItemEditPanel", () => {
  it("prefills every field from the item", () => {
    renderPanel();

    expect(screen.getByLabelText(/Name/)).toHaveValue("Paracetamol");
    expect(screen.getByLabelText(/SKU/)).toHaveValue("SKU-1");
    expect(screen.getByLabelText(/Strength value/)).toHaveValue("500");
    // The three vocabulary fields are pickers, not `<select>` elements: a select
    // cannot host the create/rename panel the shared lists now allow.
    expect(screen.getByLabelText(/Strength unit/)).toHaveTextContent("mg");
    expect(screen.getByLabelText(/^Form/)).toHaveTextContent("tablet");
    expect(screen.getByLabelText(/Pack size/)).toHaveValue("10");
    // A picker, not a `<select>`: the category is a stored row, and the panel
    // can add or rename one without leaving the edit.
    expect(screen.getByLabelText(/^Category/)).toHaveTextContent("Analgesic");
    // Quantity is an `<output>`, not an input: still labelled, no longer
    // something the operator can type over.
    expect(screen.getByLabelText(/Quantity/)).toHaveTextContent("40");
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

  it("keeps quantity read-only and points at Stock In / Stock Out", () => {
    renderPanel();

    // No input, no spinbutton to nudge the count with.
    expect(screen.queryByRole("spinbutton", { name: /Quantity/ })).toBeNull();
    expect(screen.getByLabelText(/Quantity/)).toHaveTextContent("40");
    expect(
      screen.getByText(/stock moves through Stock In and Stock Out/)
    ).toBeInTheDocument();
  });

  it("saves with the strength fields left blank, flagging the details incomplete", async () => {
    const user = userEvent.setup();
    renderPanel();

    await clearTerm(user, /Strength unit/);
    await clearTerm(user, /^Form/);
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

  it("recomputes status from the threshold it saves", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText(/Low-stock alert level/));
    await user.type(screen.getByLabelText(/Low-stock alert level/), "60");
    await user.click(screen.getByRole("button", { name: SAVE }));

    // Quantity stays at its stored 40; 40 < 60 flips the row to "low".
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      qty: 40,
      status: "low",
    });
  });

  it("warns about a rename only once the name changes", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.queryByText(RENAME_WARNING)).toBeNull();

    await user.clear(screen.getByLabelText(/Name/));
    await user.type(screen.getByLabelText(/Name/), "Paracetamol Extra");
    expect(screen.getByText(RENAME_WARNING)).toBeInTheDocument();
  });

  it("leaves batch expiries to the Expiry page", () => {
    renderPanel();

    expect(screen.queryByText(/Batch expiries/)).toBeNull();
    expect(screen.queryByPlaceholderText("Select expiry date")).toBeNull();
  });

  it("reports a saved item back so the modal can refresh and close", async () => {
    const user = userEvent.setup();
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
