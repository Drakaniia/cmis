// Spec §9 — the form-level gates: disabled picker options, blocking rows, the
// acknowledgment checkbox, drift, and the skipped-row toast.

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InventoryItem } from "@/features/inventory/types";
import { checkRowStock } from "../domain/request-availability";
import { NewRequestModal } from "./new-request-modal";

const h = vi.hoisted(() => ({
  create: vi.fn(),
  deduct: vi.fn(),
  items: [] as InventoryItem[],
  refetch: vi.fn(async () => undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("../hooks/use-create-requests", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../hooks/use-create-requests")>();
  return {
    ...actual,
    useCreateRequests: () => ({
      create: h.create,
      dbReady: true,
      isLoadingItems: false,
      items: h.items,
      refetch: h.refetch,
    }),
  };
});
// The direct hand-over is the shared quick-deduct write path; stubbed here so
// the form test never touches the database or the query client.
vi.mock("@/features/inventory/hooks/use-quick-deduct", () => ({
  useQuickDeduct: () => ({
    dbReady: true,
    deduct: h.deduct,
    isLoadingItems: false,
    items: [],
    undo: vi.fn(),
  }),
}));

const FUTURE = "2030-01-01T00:00:00.000Z";

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500 mg tablet",
    expiry: "",
    form: "tab",
    id: "item-1",
    name: "Paracetamol",
    packQty: 0,
    packSize: "",
    packUnit: "",
    qty: 0,
    sku: "SKU-001",
    status: "in",
    strengthUnit: "mg",
    strengthValue: "500",
    supplier: "",
    threshold: 0,
    ...overrides,
  };
}

const IN_STOCK = makeItem({
  batches: [{ batch: "B-1", expiry: FUTURE, qty: 100, supplier: "Acme" }],
  displayName: "Paracetamol 500 mg tablet",
  id: "item-in",
  name: "Paracetamol",
  qty: 100,
});

const OUT_OF_STOCK = makeItem({
  displayName: "Zolpidem 5 mg tablet",
  id: "item-out",
  name: "Zolpidem",
  qty: 0,
});

const SMALL = makeItem({
  batches: [{ batch: "B-9", expiry: FUTURE, qty: 10, supplier: "Acme" }],
  displayName: "Amoxicillin 500 capsule",
  form: "cap",
  id: "item-small",
  name: "Amoxicillin",
  qty: 10,
});

function renderModal() {
  const onOpenChange = vi.fn();
  render(<NewRequestModal onOpenChange={onOpenChange} open />);
  return { onOpenChange };
}

/** Type a full row: medicine text, unit (typed rows keep the default `unit`). */
async function fillRow(
  user: UserEvent,
  index: number,
  medicine: string,
  unit: string,
  qty: string
) {
  await user.type(
    screen.getAllByPlaceholderText("Start typing a medicine…")[index],
    medicine
  );
  fireEvent.change(screen.getAllByLabelText("Unit")[index], {
    target: { value: unit },
  });
  await user.type(
    screen.getAllByRole("spinbutton", { name: "Quantity" })[index],
    qty
  );
}

const submitButton = () =>
  screen.getByRole("button", { name: "Create request" });

beforeEach(() => {
  vi.clearAllMocks();
  h.items = [IN_STOCK, OUT_OF_STOCK, SMALL];
  h.create.mockResolvedValue({
    created: [{ id: "REQ-1" }],
    drift: [],
    skipped: [],
  });
  h.refetch.mockResolvedValue(undefined);
  h.deduct.mockReset();
  h.deduct.mockResolvedValue({ ok: true });
});

describe("NewRequestModal stock validation (spec §4–§6)", () => {
  it("shows a disabled suggestion with its reason and refuses to pick it", async () => {
    const user = userEvent.setup();
    renderModal();
    const input = screen.getByPlaceholderText("Start typing a medicine…");
    await user.type(input, "Zolpidem");
    const option = await screen.findByRole("option", { name: /Zolpidem/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("Out of stock");

    fireEvent.click(option);
    // The pick never happened: the stored label would have replaced the text.
    expect(input).toHaveValue("Zolpidem");
    expect(h.create).not.toHaveBeenCalled();
  });

  it("picks an enabled suggestion and shows its availability figure", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(
      screen.getByPlaceholderText("Start typing a medicine…"),
      "Paracetamol"
    );
    const option = await screen.findByRole("option", { name: /Paracetamol/ });
    expect(option).toHaveAttribute("aria-disabled", "false");
    expect(option).toHaveTextContent("100 available");
    fireEvent.click(option);
    expect(
      screen.getByDisplayValue("Paracetamol 500 mg tablet")
    ).toBeInTheDocument();
  });

  it("blocks submit on an unavailable item and says why inline", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillRow(user, 0, "Zolpidem 5 mg tablet", "tabs", "5");

    expect(screen.getByText("Nothing on hand.")).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(/1 item need attention/)).toBeInTheDocument();
  });

  it("shows the live breakdown for a matched row", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillRow(user, 0, "Paracetamol 500 mg tablet", "tabs", "5");
    expect(
      screen.getByText(/100 tab on hand.*→.*100 tab available/)
    ).toBeInTheDocument();
  });

  it("warns without blocking, but only submits once acknowledged", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillRow(user, 0, "Amoxicillin 500 capsule", "caps", "50");

    expect(screen.getByText(/requestable/)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /I understand/ }));
    expect(submitButton()).toBeEnabled();
    await user.click(submitButton());

    expect(h.create).toHaveBeenCalledTimes(1);
    const [input, checks] = h.create.mock.calls[0];
    expect(checks).toBeInstanceOf(Map);
    expect(input.rows[0].qty).toBe("50");
    expect(vi.mocked(toast.success)).toHaveBeenCalled();
  });

  it("clears the acknowledgment when the warn numbers change", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillRow(user, 0, "Amoxicillin 500 capsule", "caps", "50");
    const ack = screen.getByRole("checkbox", { name: /I understand/ });
    await user.click(ack);
    expect(ack).toBeChecked();

    // 50 → 51 changes `shortBy`, hence the warn signature.
    await user.click(screen.getAllByLabelText("Increase quantity")[0]);
    expect(
      screen.getByRole("checkbox", { name: /I understand/ })
    ).not.toBeChecked();
  });

  it("keeps submit blocked while any row blocks, across rows", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillRow(user, 0, "Paracetamol 500 mg tablet", "tabs", "5");
    await user.click(screen.getByRole("button", { name: "Add another item" }));
    await fillRow(user, 1, "Zolpidem 5 mg tablet", "tabs", "5");

    expect(screen.getByText("Nothing on hand.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create 2 requests" })
    ).toBeDisabled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("reports drift instead of writing, keeps the form open and disables submit", async () => {
    const user = userEvent.setup();
    h.create.mockImplementation(async (input: { rows: { key: string }[] }) => ({
      created: [],
      drift: [
        {
          blocking: true,
          check: checkRowStock({
            item: { ...OUT_OF_STOCK, id: IN_STOCK.id },
            qty: 5,
            unit: "tabs",
          }),
          key: input.rows[0].key,
        },
      ],
      skipped: [],
    }));
    const { onOpenChange } = renderModal();
    await fillRow(user, 0, "Paracetamol 500 mg tablet", "tabs", "5");
    await user.click(submitButton());

    expect(
      await screen.findByText(/Stock changed while this form was open/)
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(submitButton()).toBeDisabled();
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it("dispenses an eligible row directly through the shared path and drops it", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillRow(user, 0, "Paracetamol 500 mg tablet", "tabs", "5");

    await user.click(screen.getByRole("button", { name: "Dispense now" }));

    // The row's own unit rides along, so a pack-worded row deducts pack-aware.
    expect(h.deduct).toHaveBeenCalledWith({
      item: expect.objectContaining({ id: "item-in" }),
      qty: 5,
      unit: "tabs",
    });
    // The handed-over row is gone; the form keeps a single blank row.
    expect(
      screen.queryByDisplayValue("Paracetamol 500 mg tablet")
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Start typing a medicine…")).toHaveValue(
      ""
    );
  });

  it("offers no direct dispense when the quantity does not fit", async () => {
    const user = userEvent.setup();
    renderModal();
    await fillRow(user, 0, "Amoxicillin 500 capsule", "caps", "50");

    expect(screen.queryByRole("button", { name: "Dispense now" })).toBeNull();
  });

  it("lists skipped rows in the success toast", async () => {
    const user = userEvent.setup();
    h.create.mockResolvedValue({
      created: [{ id: "REQ-1" }],
      drift: [],
      skipped: [
        {
          key: "r9",
          message: "Quantity must be a whole number greater than zero.",
        },
      ],
    });
    renderModal();
    await fillRow(user, 0, "Paracetamol 500 mg tablet", "tabs", "5");
    await user.click(submitButton());

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      "1 request created",
      expect.objectContaining({
        description: expect.stringContaining(
          "Skipped: Quantity must be a whole number"
        ),
      })
    );
  });
});
