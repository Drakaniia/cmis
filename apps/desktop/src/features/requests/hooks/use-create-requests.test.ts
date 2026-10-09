// Spec §5.6/§6.3 — the submit-time re-check: `create()` diffs fresh DB
// availability against what the form displayed and writes nothing on drift.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InventoryItem } from "@/features/inventory/types";
import {
  checkRows,
  type ItemAvailability,
  itemAvailability,
} from "../domain/request-availability";
import { notifyRequestsChanged, saveRequests } from "../persistence";
import type { NewRequestInput } from "./use-create-requests";
import { useCreateRequests } from "./use-create-requests";

const h = vi.hoisted(() => ({
  fresh: new Map<string, ItemAvailability>(),
  items: [] as InventoryItem[],
  notify: vi.fn(),
  reserveIds: vi.fn(async (n: number) =>
    Array.from({ length: n }, (_, index) => `REQ-${index + 1}`)
  ),
  save: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
}));
vi.mock("@/features/inventory/hooks/use-inventory-items", () => ({
  useInventoryItems: () => ({
    data: h.items,
    isLoading: false,
    refetch: vi.fn(async () => undefined),
  }),
}));
vi.mock("../persistence", () => ({
  notifyRequestsChanged: h.notify,
  saveRequests: h.save,
}));
vi.mock("../request-id", () => ({ reserveRequestIds: h.reserveIds }));
vi.mock("../stock", () => ({ fetchItemAvailability: () => h.fresh }));

const FUTURE = "2030-01-01T00:00:00.000Z";

const ITEM: InventoryItem = {
  batches: [{ batch: "B-1", expiry: FUTURE, qty: 100, supplier: "Acme" }],
  category: "Analgesic",
  detailsIncomplete: false,
  dispensingHistory: [],
  displayName: "Paracetamol 500 mg tablet",
  expiry: "",
  form: "tab",
  id: "item-a",
  name: "Paracetamol",
  packQty: 0,
  packSize: "",
  packUnit: "",
  qty: 100,
  sku: "SKU-001",
  status: "in",
  strengthUnit: "mg",
  strengthValue: "500",
  supplier: "",
  threshold: 0,
};

const INPUT: NewRequestInput = {
  reason: "",
  requestor: { email: "", id: "", name: "" },
  rows: [{ key: "r1", medicine: ITEM.displayName, qty: "5", unit: "tabs" }],
  startReady: false,
};

const EXPECTED = checkRows(
  [{ item: ITEM, key: "r1", qty: 5, unit: "tabs" }],
  Date.now()
);

beforeEach(() => {
  vi.clearAllMocks();
  h.items = [ITEM];
});

describe("create() — §5.6 submit-time re-check", () => {
  it("returns drift and writes nothing when fresh stock is gone", async () => {
    h.fresh = new Map([
      [
        ITEM.id,
        itemAvailability(
          { batches: [], id: ITEM.id, qty: 0, threshold: 0 },
          Date.now()
        ),
      ],
    ]);
    const { result } = renderHook(() => useCreateRequests());

    const out = await result.current.create(INPUT, EXPECTED);

    expect(out.created).toEqual([]);
    expect(out.drift).toHaveLength(1);
    expect(out.drift[0]).toMatchObject({
      blocking: true,
      check: { state: "unavailable" },
      key: "r1",
    });
    expect(saveRequests).not.toHaveBeenCalled();
    expect(notifyRequestsChanged).not.toHaveBeenCalled();
  });

  it("returns blocking drift when the numbers merely moved", async () => {
    h.fresh = new Map([
      [ITEM.id, itemAvailability({ ...ITEM, qty: 60 }, Date.now())],
    ]);
    const { result } = renderHook(() => useCreateRequests());

    const out = await result.current.create(INPUT, EXPECTED);

    expect(out.created).toEqual([]);
    expect(out.drift).toHaveLength(1);
    expect(out.drift[0].blocking).toBe(false);
    expect(out.drift[0].check.available).toBe(60);
    expect(saveRequests).not.toHaveBeenCalled();
  });

  it("writes exactly as before when fresh numbers match the display", async () => {
    h.fresh = new Map([[ITEM.id, itemAvailability(ITEM, Date.now())]]);
    const { result } = renderHook(() => useCreateRequests());

    const out = await result.current.create(INPUT, EXPECTED);

    expect(out.drift).toEqual([]);
    expect(out.created).toHaveLength(1);
    expect(out.created[0]).toMatchObject({
      itemId: ITEM.id,
      medicine: ITEM.displayName,
      qty: 5,
      status: "pending",
    });
    expect(saveRequests).toHaveBeenCalledTimes(1);
    expect(notifyRequestsChanged).toHaveBeenCalledTimes(1);
  });
});
