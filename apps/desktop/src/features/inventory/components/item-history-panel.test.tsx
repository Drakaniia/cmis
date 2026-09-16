import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemHistory } from "../hooks/use-item-history";
import { useItemHistory } from "../hooks/use-item-history";
import type { InventoryItem } from "../types";
import { ItemHistoryPanel } from "./item-history-panel";

function item(): InventoryItem {
  return {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500mg",
    expiry: "",
    form: "",
    id: "item-1",
    name: "Paracetamol 500mg",
    packSize: "",
    qty: 40,
    sku: "SKU-1",
    status: "in",
    strengthUnit: "",
    strengthValue: "",
    supplier: "PharmaCorp",
    threshold: 50,
  };
}

vi.mock("../hooks/use-item-history", () => ({ useItemHistory: vi.fn() }));

const LOAD_MORE = "Load more";
const EMPTY_STATE = "No dispensing recorded for this item.";

const mockedHistory = vi.mocked(useItemHistory);

function history(overrides: Partial<ItemHistory> = {}): ItemHistory {
  return {
    hasMore: false,
    isError: false,
    isLoading: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    rows: [],
    totals: { first: null, last: null, records: 0, units: 0 },
    ...overrides,
  };
}

function renderPanel(state: ItemHistory = history()) {
  mockedHistory.mockReturnValue(state);
  render(<ItemHistoryPanel item={item()} />);
  return state;
}

beforeEach(() => {
  mockedHistory.mockReset();
});

describe("ItemHistoryPanel", () => {
  it("leads with the totals strip", () => {
    renderPanel(
      history({
        totals: {
          first: "2026-01-05",
          last: "2026-09-01",
          records: 42,
          units: 310,
        },
      })
    );

    expect(screen.getByText("310")).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    // Locale-independent: the two ends of the window are distinct months.
    expect(screen.getByText(/Jan/)).toBeInTheDocument();
    expect(screen.getByText(/Sep/)).toBeInTheDocument();
  });

  it("lists each record newest first with its requestor and staff", () => {
    renderPanel(
      history({
        rows: [
          {
            at: "2026-09-01T09:30:00Z",
            batch: "LOT-9",
            qty: 5,
            requestor: "Ana Reyes",
            staff: "M. Cruz",
          },
          {
            at: "2026-08-14T11:00:00Z",
            batch: "LOT-4",
            qty: 2,
            requestor: "Ben Ong",
            staff: "M. Cruz",
          },
        ],
        totals: {
          first: "2026-08-14",
          last: "2026-09-01",
          records: 2,
          units: 7,
        },
      })
    );

    expect(screen.getByText("LOT-9")).toBeInTheDocument();
    expect(screen.getByText("Ana Reyes")).toBeInTheDocument();
    expect(screen.getByText("Ben Ong")).toBeInTheDocument();
    expect(screen.getAllByText("M. Cruz")).toHaveLength(2);

    // Newest first: the September row precedes the August one.
    const batches = screen.getAllByRole("cell", { name: /LOT-/ });
    expect(batches[0]).toHaveTextContent("LOT-9");
    expect(batches[1]).toHaveTextContent("LOT-4");
  });

  it("offers load more only while the window is short of the total", async () => {
    const user = userEvent.setup();
    const loadMore = vi.fn();
    renderPanel(
      history({
        hasMore: true,
        loadMore,
        rows: [
          {
            at: "2026-09-01T09:30:00Z",
            batch: "LOT-9",
            qty: 5,
            requestor: "Ana Reyes",
            staff: "M. Cruz",
          },
        ],
        totals: {
          first: "2026-09-01",
          last: "2026-09-01",
          records: 25,
          units: 5,
        },
      })
    );

    await user.click(screen.getByRole("button", { name: LOAD_MORE }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("hides load more once every record is on screen", () => {
    renderPanel(history({ hasMore: false }));

    expect(screen.queryByRole("button", { name: LOAD_MORE })).toBeNull();
  });

  it("says so plainly when nothing has been dispensed", () => {
    renderPanel();

    expect(screen.getByText(EMPTY_STATE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: LOAD_MORE })).toBeNull();
  });

  it("reports a failed read and offers a retry", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    renderPanel(history({ isError: true, refetch }));

    expect(
      screen.getByText(/could not load dispensing history/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
