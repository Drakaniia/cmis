// biome-ignore-all lint/performance/useTopLevelRegex: test regex convenience
// biome-ignore-all lint/suspicious/noEmptyBlockStatements: vi.fn wrappers use empty arrow
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "@/features/admin/settings/hooks/use-settings";
import { StockInWizard } from "./stock-in-wizard/stock-in-wizard";

// The category dropdown owns the shared category list and its own popover; the
// wizard's tests only need a list to choose from (the picker's behaviour has its
// own suite in category-picker.test.tsx).
vi.mock("../hooks/use-categories", () => import("@/test/categories-mock"));
vi.mock("@cmis/ui/components/popover", () => import("@/test/popover-shim"));

vi.mock("@/features/admin/settings/hooks/use-settings", () => ({
  useSettings: vi.fn(() => ({
    state: {
      alerts: { expiryWindowDays: 30, globalLowStock: 15, overrides: [] },
      backup: { lastBackupAt: "", nextRun: "", path: "", schedule: "off" },
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
          backup: { lastBackupAt: "", nextRun: "", path: "", schedule: "off" },
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

  it("category placeholder blocks Next until selected", async () => {
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
    // category still placeholder ""
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDisabled();
    await chooseCategory(user, "Supplement");
    await waitFor(() => expect(nextBtn).toBeEnabled());
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

    const unitSelect = screen.getByLabelText(/Strength unit/i);
    expect(
      within(unitSelect).getByRole("option", { name: "mg/5ml" })
    ).toBeInTheDocument();
    const formSelect = screen.getByLabelText(/^Form$/i);
    expect(
      within(formSelect).getByRole("option", { name: "capsule" })
    ).toBeInTheDocument();

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

  it("hardcode removal: category init is placeholder and supplier init null (Next disabled initially on step2/3)", async () => {
    const user = userEvent.setup();
    render(
      <StockInWizard items={[]} onConfirm={vi.fn()} onOpenChange={noop} open />
    );
    await user.type(screen.getByPlaceholderText(/Scan barcode/i), "SKU-005");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Step 2 — Item Details/i);
    // step2 category is placeholder "" -> Next disabled
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
    await user.type(
      screen.getByPlaceholderText(/e\.g\., Paracetamol/i),
      "New Item"
    );
    // still disabled because category missing
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });
});
