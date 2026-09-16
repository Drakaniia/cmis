import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-db";
import { buildItemUpdate, draftFromItem } from "../domain/item-update";
import type { InventoryItem } from "../types";
import { useItemUpdateMutation } from "./use-item-update";

const getDb = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

/**
 * The row as the database holds it — including the legacy `dosage` column, which
 * is NOT NULL today and is dropped by the run-once backfill later.
 */
function seededRow(overrides: Record<string, unknown> = {}) {
  return {
    category: "Analgesic",
    display_name: "Paracetamol 500 mg",
    dosage: "500 mg",
    dosage_missing: 0,
    form: "tablet",
    id: "item-1",
    name: "Paracetamol",
    pack_size: "10",
    qty: 40,
    sku: "SKU-1",
    status: "in",
    strength_unit: "mg",
    strength_value: "500",
    supplier: "PharmaCorp",
    threshold: 50,
    updated_at: "",
    ...overrides,
  };
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    batches: [],
    category: "Analgesic",
    detailsIncomplete: false,
    dispensingHistory: [],
    displayName: "Paracetamol 500 mg",
    expiry: "",
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

let db: FakeDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  db = createFakeDb({ inventory_items: [seededRow()] });
  getDb.mockReset();
  getDb.mockResolvedValue(db);
});

describe("useItemUpdateMutation", () => {
  it("writes every value the draft computed, with nothing left undefined", async () => {
    const subject = item();
    const draft = {
      ...draftFromItem(subject),
      qty: 0,
      sku: "SKU-1",
      threshold: 50,
    };
    const values = buildItemUpdate(subject, draft);

    const { result } = renderHook(() => useItemUpdateMutation(), { wrapper });
    await result.current.mutateAsync({ ...values, id: "item-1" });

    const [row] = db.tables.inventory_items;
    expect(row).toMatchObject({
      display_name: values.display_name,
      qty: 0,
      status: "out",
      threshold: 50,
    });

    // A column named in the UPDATE but absent from the values would land here
    // as null/undefined — which the real schema rejects on `dosage`.
    const blanks = Object.entries(row ?? {})
      .filter(([, value]) => value === null || value === undefined)
      .map(([column]) => column);
    expect(blanks).toEqual([]);
  });

  it("leaves the legacy dosage column untouched", async () => {
    const subject = item();
    const values = buildItemUpdate(subject, {
      ...draftFromItem(subject),
      strengthValue: "650",
    });

    const { result } = renderHook(() => useItemUpdateMutation(), { wrapper });
    await result.current.mutateAsync({ ...values, id: "item-1" });

    const [row] = db.tables.inventory_items;
    expect(row?.dosage).toBe("500 mg");
    expect(row?.strength_value).toBe("650");
  });

  it("stamps updated_at and targets only the edited item", async () => {
    db = createFakeDb({
      inventory_items: [seededRow(), seededRow({ id: "item-2", qty: 7 })],
    });
    getDb.mockResolvedValue(db);

    const subject = item();
    const values = buildItemUpdate(subject, {
      ...draftFromItem(subject),
      qty: 12,
    });

    const { result } = renderHook(() => useItemUpdateMutation(), { wrapper });
    await result.current.mutateAsync({ ...values, id: "item-1" });

    const [first, second] = db.tables.inventory_items;
    expect(first?.qty).toBe(12);
    expect(first?.updated_at).not.toBe("");
    expect(second?.qty).toBe(7);
  });
});
