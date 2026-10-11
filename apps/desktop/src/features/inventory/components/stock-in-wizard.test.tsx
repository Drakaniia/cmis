// biome-ignore-all lint/performance/useTopLevelRegex: test regex convenience
// biome-ignore-all lint/suspicious/noEmptyBlockStatements: vi.fn wrappers use empty arrow
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "@/features/admin/settings/hooks/use-settings";
import { pickTerm } from "@/test/pick-term";
import type { InventoryItem } from "../types";
import { StockInWizard } from "./stock-in-wizard/stock-in-wizard";

// The category dropdown owns the shared category list and its own popover; the
// wizard's tests only need a list to choose from (the picker's behaviour has its
// own suite in category-picker.test.tsx). The three vocabulary pickers on Step 2
// read their own shared queries for the same reason.
vi.mock("../hooks/use-categories", () => import("@/test/categories-mock"));
vi.mock(
  "../hooks/use-vocabulary-terms",
  () => import("@/test/vocabulary-mock")
);
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));

vi.mock("@/features/admin/settings/hooks/use-settings", () => ({
  useSettings: vi.fn(() => ({
    state: {
      alerts: { expiryWindowDays: 30, globalLowStock: 15, overrides: [] },
      general: {
        appName: "cmis",
        dateFormat: "MM/DD/YYYY",
        operatorName: "",
        timeFormat: "12-hour",
      },
      suppliers: [
        { contact: "", id: "1", leadTimeDays: 3, name: "A" },
        { contact: "", id: "2", leadTimeDays: 5, name: "B" },
      ],
      units: undefined,
    },
  })),
}));

const mockedUseSettings = vi.mocked(useSettings);

/**
 * Partial settings double: the wizard only reads `state`, so the action
 * callbacks are stubbed out instead of re-declared per test.
 */
function mockSettingsState(value: Record<string, unknown>) {
  return value as unknown as ReturnType<typeof useSettings>;
}

/** The fields the wizard reads off an existing item, with a usable pack. */
function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [{ batch: "LOT-1", expiry: "2027-01-31", qty: 40, supplier: "" }],
    category: "Antibiotic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Acetylcysteine 600 mg sachet 10/box",
    expiry: "2027-01-31",
    form: "sachet",
    id: "item-1",
    name: "Acetylcysteine",
    packQty: 10,
    packSize: "10/box",
    packUnit: "box",
    qty: 40,
    sku: "SKU-ACET",
    status: "in",
    strengthUnit: "mg",
    strengthValue: "600",
    supplier: "",
    threshold: 20,
    ...overrides,
  };
}

/**
 * Steps 1 → 3 for a brand new medicine: type an identifier, fill the details
 * that block Next, then land on the batch step.
 */
async function reachBatchStep(
  user: ReturnType<typeof userEvent.setup>,
  opts: { category: string; form?: string; name: string }
) {
  await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-NEW");
  await user.click(screen.getByRole("button", { name: /Next/i }));
  await screen.findByText(/Step 2 — Item Details/i);
  await user.type(
    screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
    opts.name
  );
  if (opts.form) {
    await pickTerm(user, /^Form$/i, opts.form);
  }
  await chooseCategory(user, opts.category);
  await user.click(screen.getByRole("button", { name: /Next/i }));
  await screen.findByText(/Step 3 — Batch Info/i);
}

/** Batch, expiry and a quantity — what step 3 needs before Next enables. */
async function fillBatchStep(
  user: ReturnType<typeof userEvent.setup>,
  qty: string
) {
  await user.type(screen.getByPlaceholderText("B-2026-04"), "BATCH-PACK");
  const expiryInput = screen.getByLabelText(/Expiry date/i) as HTMLInputElement;
  await user.type(expiryInput, futureIso(10));
  await user.type(screen.getByPlaceholderText("0"), qty);
}

function futureIso(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const noop = () => undefined;

/**
 * Choosing a category is two gestures now: the picker is a popover with the
 * list management on it, not a native `<select>` whose options the browser
 * draws.
 */
async function chooseCategory(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  await user.click(screen.getByRole("button", { name: /^Category$/ }));
  await user.click(
    await screen.findByRole("button", { name: new RegExp(`^${name}`) })
  );
}

describe("StockInWizard — supplier UI removed, still proceed without it", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSettings.mockReturnValue(
      mockSettingsState({
        state: {
          alerts: { expiryWindowDays: 30, globalLowStock: 15, overrides: [] },
          categories: [],
          general: {
            appName: "cmis",
            dateFormat: "MM/DD/YYYY",
            operatorName: "",
            timeFormat: "12-hour",
          },
          suppliers: [
            { contact: "", id: "1", leadTimeDays: 3, name: "A" },
            { contact: "", id: "2", leadTimeDays: 5, name: "B" },
          ],
        },
      })
    );
  });

  it("does not render supplier UI (optional UI removed)", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-001");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Paracetamol 500mg"
    );
    const categoryTrigger = screen.getByLabelText(/Category/i);
    expect(categoryTrigger).toBeInTheDocument();
    await chooseCategory(user, "Analgesic");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
    expect(screen.queryByLabelText(/Supplier/i)).toBeNull();
    expect(screen.queryByText(/Select supplier \(optional\)/i)).toBeNull();
    expect(screen.queryByText(/No suppliers — add in Settings/i)).toBeNull();
  });

  it("can proceed without supplier UI — batch+future+qty enables Next", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-001");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Paracetamol 500mg"
    );
    await chooseCategory(user, "Analgesic");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
    await user.type(screen.getByPlaceholderText("B-2026-04"), "BATCH-1");
    const expiryInput = screen.getByLabelText(
      /Expiry date/i
    ) as HTMLInputElement;
    await user.clear(expiryInput);
    await user.type(expiryInput, futureIso(10));
    await user.type(screen.getByPlaceholderText("0"), "5");
    expect(screen.queryByLabelText(/Supplier/i)).toBeNull();
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    await waitFor(() => expect(nextBtn).toBeEnabled());
  });

  it("confirm payload always has supplier null (UI removed)", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        items={[]}
        onConfirm={onConfirm}
        onOpenChange={noop}
        open
      />
    );
    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-001");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Item X"
    );
    await chooseCategory(user, "Analgesic");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
    await user.type(screen.getByPlaceholderText("B-2026-04"), "BATCH-2");
    const expiryInput = screen.getByLabelText(
      /Expiry date/i
    ) as HTMLInputElement;
    await user.type(expiryInput, futureIso(10));
    await user.type(screen.getByPlaceholderText("0"), "10");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(await screen.findByText(/Step 4 — Review/i)).toBeInTheDocument();
    // supplier line removed from review
    expect(screen.queryByText(/Supplier:/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ batch: "BATCH-2", qty: 10, supplier: null })
    );
  });

  it("null payload when proceeded without supplier (still null)", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        items={[]}
        onConfirm={onConfirm}
        onOpenChange={noop}
        open
      />
    );
    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-002");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Item Y"
    );
    await chooseCategory(user, "Antibiotic");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
    await user.type(screen.getByPlaceholderText("B-2026-04"), "BATCH-NULL");
    const expiryInput = screen.getByLabelText(
      /Expiry date/i
    ) as HTMLInputElement;
    await user.type(expiryInput, futureIso(20));
    await user.type(screen.getByPlaceholderText("0"), "3");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() =>
      expect(screen.getByText(/Step 4 — Review/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Supplier:/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ supplier: null })
    );
  });

  it("shows a red required indicator on an empty category after Next", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-003");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Item Z"
    );
    // category still placeholder "", but Next is clickable so the gap is shown
    // rather than hidden behind a dead button.
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByText(/Step 2 — Item Details/i)).toBeInTheDocument();
    expect(screen.getByText(/Category is required\./i)).toBeInTheDocument();
    await chooseCategory(user, "Supplement");
    expect(screen.queryByText(/Category is required\./i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
  });

  it("does not advance past Step 3 when the quantity is empty, and flags it", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    await reachBatchStep(user, { category: "Analgesic", name: "Ibuprofen" });
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByText(/Step 3 — Batch Info/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Quantity must be 1 or more\./i)
    ).toBeInTheDocument();
    // Fill the quantity and the step finally advances.
    await user.type(screen.getByPlaceholderText("0"), "5");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 — Review/i);
  });

  it("offers the canonical strength vocabularies and never blocks Next on them", async () => {
    // The old Step 2 `Unit` dropdown (`tablet`/`capsule`/`bottle`…) went nowhere:
    // it collected a value with no column behind it (decision 8). The four
    // strength fields replace it, and their options come from one canonical list
    // (decision 12) rather than from per-screen literals.
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-004");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);

    expect(screen.queryByLabelText(/^Unit$/i)).toBeNull();

    // The options live in the picker's panel, so they are only in the document
    // once it is open. Both lists come from the shared vocabulary query rather
    // than from per-screen literals (decision 12), which is also what lets the
    // operator add a unit the clinic actually stocks.
    await user.click(screen.getByRole("button", { name: /Strength unit/i }));
    expect(
      screen.getByRole("button", { name: /^mg\/5ml/ })
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /^Form$/i }));
    expect(
      screen.getByRole("button", { name: /^capsule/ })
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // All four are optional (decision 7): a delivery is never blocked on a
    // strength nobody recorded.
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Item Four"
    );
    await chooseCategory(user, "Supplement");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled()
    );
  });

  it("required indicators appear on Step 2 only after Next is tried", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-005");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    // Nothing is flagged on a pristine step.
    expect(screen.queryByText(/Name required\./i)).toBeNull();
    expect(screen.queryByText(/Category is required\./i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Next/i }));
    // Both empty required fields are flagged, and the step does not advance.
    expect(screen.getByText(/Step 2 — Item Details/i)).toBeInTheDocument();
    expect(screen.getByText(/Name required\./i)).toBeInTheDocument();
    expect(screen.getByText(/Category is required\./i)).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "New Item"
    );
    // Typing clears the field's own indicator as it is filled.
    expect(screen.queryByText(/Name required\./i)).toBeNull();
    expect(screen.getByText(/Category is required\./i)).toBeInTheDocument();
  });
});

/**
 * The pack pair on the details step (F3) and the quantity step's unit toggle
 * (F4). Both exist so a delivery written as `5 box` is stored as 50 base units
 * — the ×10 bug this spec was opened to fix — and so a person recording a new
 * `10/box` item has somewhere to type the multiple at all.
 */
describe("StockInWizard — pack pair and pack-to-base conversion", () => {
  it("collects the pack pair and derives the pack-size text (F3/D24)", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        items={[]}
        onConfirm={onConfirm}
        onOpenChange={noop}
        open
      />
    );

    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-NEW");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Cefalexin"
    );
    await chooseCategory(user, "Antibiotic");

    await user.type(screen.getByLabelText(/Pack quantity/i), "10");
    await pickTerm(user, /Pack unit/i, "box");

    // The text field follows the pair rather than being typed beside it (F3).
    const packSize = screen.getByLabelText(/Pack size/i) as HTMLInputElement;
    expect(packSize.value).toBe("10/box");
    expect(packSize.readOnly).toBe(true);
    expect(
      screen.getByText(/Reads as 10\/box, derived from the pair/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
    await fillBatchStep(user, "20");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 — Review/i);
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ packQty: 10, packUnit: "box", qty: 20 })
    );
  });

  it("stores a pack quantity as base units and shows the conversion (F4/D12)", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        initialItemId="item-1"
        items={[item()]}
        onConfirm={onConfirm}
        onOpenChange={noop}
        open
      />
    );

    // Step 1 is prefilled from the item, and step 2 prefills the pair with it too
    // — an item that already records `10/box` must not look unpaired (F3).
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    expect(
      (screen.getByLabelText(/Pack quantity/i) as HTMLInputElement).value
    ).toBe("10");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);

    await user.type(screen.getByPlaceholderText("B-2026-04"), "BATCH-PACK");
    const expiryInput = screen.getByLabelText(
      /Expiry date/i
    ) as HTMLInputElement;
    await user.type(expiryInput, futureIso(10));
    await user.type(screen.getByPlaceholderText("0"), "5");
    // Base units by default: no conversion is happening, so nothing is claimed.
    expect(screen.queryByText(/^= /)).toBeNull();

    await user.click(screen.getByRole("button", { name: "box" }));
    expect(await screen.findByText("= 50 sachet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 — Review/i);
    // The review reads back the stored number first, with the pack it came from.
    expect(screen.getByText(/50 sachet \(5 box\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ qty: 50 })
    );
  });

  it("offers only the base unit when the item records no usable pack (F4)", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );

    await reachBatchStep(user, {
      category: "Analgesic",
      form: "sachet",
      name: "Ibuprofen",
    });

    expect(screen.getByRole("button", { name: "sachet" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "pack" })).toBeDisabled();
    // The reason is shown, not just implied by a dead button.
    expect(screen.getByText(/No pack size recorded/)).toBeInTheDocument();
  });

  it("blocks Next when a pack unit has no multiple, and says why (V1/V2)", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );

    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-NEW");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Cefalexin"
    );
    await chooseCategory(user, "Antibiotic");
    await pickTerm(user, /Pack unit/i, "box");

    expect(
      screen.getByText(/Enter how many base units one pack holds/i)
    ).toBeInTheDocument();
    // Next is clickable, but the broken pack pair keeps the step in place.
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByText(/Step 2 — Item Details/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Enter how many base units one pack holds/i)
    ).toBeInTheDocument();
  });

  it("resets the pack pair when the wizard is pointed at another item", async () => {
    const packed = item();
    const bare = item({
      id: "item-2",
      name: "Ibuprofen",
      packQty: 0,
      packSize: "",
      packUnit: "",
      sku: "SKU-IBU",
    });
    const items: InventoryItem[] = [packed, bare];
    const user = userEvent.setup();
    const { rerender } = render(
      <StockInWizard
        initialItemId="item-1"
        items={items}
        onConfirm={vi.fn()}
        onOpenChange={noop}
        open
      />
    );

    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    expect(
      (screen.getByLabelText(/Pack quantity/i) as HTMLInputElement).value
    ).toBe("10");

    rerender(
      <StockInWizard
        initialItemId="item-2"
        items={items}
        onConfirm={vi.fn()}
        onOpenChange={noop}
        open
      />
    );

    // A second delivery must not inherit the last one's multiple.
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    expect(
      (screen.getByLabelText(/Pack quantity/i) as HTMLInputElement).value
    ).toBe("");
    // The trigger shows the placeholder when the pair is blank, which is the
    // picker's equivalent of a `<select>` sitting on its empty option.
    expect(
      screen.getByRole("button", { name: /Pack unit/i })
    ).toHaveTextContent(/— select/);
  });
});

/**
 * V4 — the compatibility rule made visible: a form of "box" is its own base
 * unit, so the pack quantity and pack unit below it are disabled and the
 * reason is stated, instead of letting an invalid pair be submitted.
 */
describe("StockInWizard — unit compatibility (V4)", () => {
  it("disables the pack fields and explains why when the form is box", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );

    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-BOX");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Boxed"
    );
    await chooseCategory(user, "Analgesic");
    await pickTerm(user, /^Form$/i, "box");

    // The reason is shown, not just implied by a dead field.
    expect(screen.getByText(/is its own base unit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pack quantity/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Pack unit/i })).toHaveAttribute(
      "aria-disabled",
      "true"
    );

    // The disabled pair does not block the step — there is nothing to fix.
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
  });
});

/**
 * Stock-In Step 1 identity: barcode scan button, placeholder SKU,
 * non-blocking Next with fallback (stock-in-step-identity-barcode).
 * Seam: StockInWizard public interface (render + onConfirm).
 */
describe("StockInWizard — Step 1 identity barcode", () => {
  it("shows SKU as grey placeholder, not value, when opened on an item", async () => {
    render(
      <StockInWizard
        initialItemId="item-1"
        items={[item()]}
        onConfirm={vi.fn()}
        onOpenChange={noop}
        open
      />
    );
    const input = (await screen.findByLabelText(
      /Barcode \/ SKU/i
    )) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("SKU-ACET");
  });

  it("Next is enabled with empty input when an item is resolved", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard
        initialItemId="item-1"
        items={[item()]}
        onConfirm={vi.fn()}
        onOpenChange={noop}
        open
      />
    );
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    await waitFor(() => expect(nextBtn).toBeEnabled());
    await user.click(nextBtn);
    expect(
      await screen.findByText(/Step 2 — Item Details/i)
    ).toBeInTheDocument();
  });

  it("scan button focuses the input", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    const scanBtn = await screen.findByRole("button", {
      name: /Focus barcode input for scanner/i,
    });
    // Button lives inside the field wrapper, right-aligned.
    expect(scanBtn.closest("div.relative")).not.toBeNull();
    await user.click(scanBtn);
    expect(screen.getByLabelText(/Barcode \/ SKU/i)).toHaveFocus();
  });

  it("empty input falls back to foundItem sku on confirm", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        initialItemId="item-1"
        items={[item()]}
        onConfirm={onConfirm}
        onOpenChange={noop}
        open
      />
    );
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
    await user.type(screen.getByPlaceholderText("B-2026-04"), "BATCH-FALLBACK");
    await user.type(screen.getByLabelText(/Expiry date/i), futureIso(10));
    await user.type(screen.getByPlaceholderText("0"), "4");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 4 — Review/i);
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "SKU-ACET", itemId: "item-1" })
    );
  });

  it("empty input falls back to barcode when sku is blank", async () => {
    const barcoded = item({ barcode: "BC-ONLY-1", id: "item-bc", sku: "" });
    render(
      <StockInWizard
        initialItemId="item-bc"
        items={[barcoded]}
        onConfirm={vi.fn()}
        onOpenChange={noop}
        open
      />
    );
    const input = (await screen.findByLabelText(
      /Barcode \/ SKU/i
    )) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("BC-ONLY-1");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled()
    );
  });

  it("typed input wins over fallback sku", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        initialItemId="item-1"
        items={[item()]}
        onConfirm={onConfirm}
        onOpenChange={noop}
        open
      />
    );
    const input = await screen.findByLabelText(/Barcode \/ SKU/i);
    await user.type(input, "SKU-TYPED");
    await user.click(screen.getByRole("button", { name: /Lookup/i }));
    // Unknown typed code goes down the isNew path, not the fallback item.
    expect(
      await screen.findByText(/Item not found — Create new\?/i)
    ).toBeInTheDocument();
  });

  it("flags the identifier as required when Next is tried while empty", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    const input = (await screen.findByLabelText(
      /Barcode \/ SKU/i
    )) as HTMLInputElement;
    expect(input.placeholder).toBe("Scan barcode or type SKU");
    expect(screen.queryByText(/Identifier is required\./i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Next/i }));
    // Still on step 1, with the missing identifier flagged.
    expect(screen.getByText(/Step 1 — Identify/i)).toBeInTheDocument();
    expect(screen.getByText(/Identifier is required\./i)).toBeInTheDocument();
  });
});

/**
 * A delivery usually holds more than one item, so after a successful submit the
 * wizard stays open on a success screen and offers "Stock In Another Item"
 * (multi-item-stock-in) instead of closing. The next run starts blank — no
 * prefill from the item just saved — so the next delivery can be anything.
 */
describe("StockInWizard — stock in another item", () => {
  /** A brand new item taken all the way to a submitted delivery. */
  async function stockInNewItem(
    user: ReturnType<typeof userEvent.setup>,
    opts: { category: string; name: string; qty: string }
  ) {
    await reachBatchStep(user, { category: opts.category, name: opts.name });
    await fillBatchStep(user, opts.qty);
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));
    await screen.findByText(/Step 5 — Done/i);
  }

  it("stays open on a success screen that offers the next item", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        items={[]}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open
      />
    );

    await stockInNewItem(user, {
      category: "Analgesic",
      name: "Ibuprofen",
      qty: "5",
    });

    expect(screen.getByText(/Stocked in/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Stock In Another Item/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // The wizard must not close itself; the operator chooses whether to finish.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("resets to a blank Step 1 when Stock In Another Item is pressed", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );

    await stockInNewItem(user, {
      category: "Analgesic",
      name: "Ibuprofen",
      qty: "5",
    });
    await user.click(
      screen.getByRole("button", { name: /Stock In Another Item/i })
    );

    await screen.findByText(/Step 1 — Identify/i);
    const input = screen.getByLabelText(/Barcode \/ SKU/i) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.queryByText(/Step 5 — Done/i)).toBeNull();
  });

  it("logs two deliveries in a row without leaving the wizard", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        items={[]}
        onConfirm={onConfirm}
        onOpenChange={noop}
        open
      />
    );

    await stockInNewItem(user, {
      category: "Analgesic",
      name: "Ibuprofen",
      qty: "5",
    });
    await user.click(
      screen.getByRole("button", { name: /Stock In Another Item/i })
    );
    await screen.findByText(/Step 1 — Identify/i);
    await stockInNewItem(user, {
      category: "Antibiotic",
      name: "Cefalexin",
      qty: "7",
    });

    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Cefalexin", qty: 7 })
    );
  });

  it("keeps the just-stocked item selected for the next delivery", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        initialItemId="item-1"
        items={[item()]}
        onConfirm={onConfirm}
        onOpenChange={noop}
        open
      />
    );

    // First delivery: an existing item, answered from the fallback SKU.
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
    await user.type(screen.getByPlaceholderText("B-2026-04"), "LOT-2");
    await user.type(screen.getByPlaceholderText("0"), "5");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));
    await screen.findByText(/Step 5 — Done/i);

    // Same product, next lot: the item stays selected and the wizard lands on
    // the batch step, so only the lot and quantity have to be typed again.
    await user.click(
      screen.getByRole("button", { name: /Stock In Another Item/i })
    );
    await screen.findByText(/Step 3 — Batch Info/i);
    expect(screen.queryByText(/Step 1 — Identify/i)).toBeNull();
    await user.type(screen.getByPlaceholderText("B-2026-04"), "LOT-3");
    await user.type(screen.getByPlaceholderText("0"), "2");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));

    expect(onConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ batch: "LOT-3", itemId: "item-1", qty: 2 })
    );
  });

  it("does not carry a stale selection when a brand-new item was stocked", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard
        initialItemId="item-1"
        items={[item()]}
        onConfirm={vi.fn()}
        onOpenChange={noop}
        open
      />
    );

    // A genuinely different product was opened on the wizard's own item. The
    // placeholder is that item's SKU, so the field is reached by its label.
    await user.type(screen.getByLabelText(/Barcode \/ SKU/i), "SKU-BRAND");
    await user.click(screen.getByRole("button", { name: /Lookup/i }));
    await screen.findByText(/Item not found — Create new\?/i);
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "Brandnew"
    );
    await chooseCategory(user, "Analgesic");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 3 — Batch Info/i);
    await user.type(screen.getByPlaceholderText("0"), "3");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Confirm Stock In/i }));
    await screen.findByText(/Step 5 — Done/i);

    // The parent never handed the created row back, so the previously selected
    // item must not be reused as if the new delivery had been for it.
    await user.click(
      screen.getByRole("button", { name: /Stock In Another Item/i })
    );
    await screen.findByText(/Step 1 — Identify/i);
    expect(screen.queryByText(/Step 3 — Batch Info/i)).toBeNull();
  });

  it("closes the wizard when Done is pressed", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <StockInWizard
        items={[]}
        onConfirm={vi.fn()}
        onOpenChange={onOpenChange}
        open
      />
    );

    await stockInNewItem(user, {
      category: "Analgesic",
      name: "Ibuprofen",
      qty: "5",
    });
    await user.click(screen.getByRole("button", { name: /^Done$/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
