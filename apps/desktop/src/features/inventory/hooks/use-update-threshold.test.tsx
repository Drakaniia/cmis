import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-db";
import { useUpdateThresholdMutation } from "./use-update-threshold";

const getDb = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

function item(overrides: Record<string, unknown> = {}) {
  return {
    category: "Analgesic",
    display_name: "Paracetamol 500 mg",
    dosage: "",
    dosage_missing: 0,
    form: "tablet",
    id: "item-1",
    name: "Paracetamol",
    pack_size: "10",
    qty: 40,
    sku: "SKU-1",
    status: "low",
    strength_unit: "mg",
    strength_value: "500",
    supplier: "PharmaCorp",
    threshold: 50,
    updated_at: "",
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
  db = createFakeDb({
    inventory_items: [item(), item({ id: "item-2", qty: 7, sku: "SKU-2" })],
  });
  getDb.mockReset();
  getDb.mockResolvedValue(db);
});

describe("useUpdateThresholdMutation", () => {
  it("writes the threshold and re-derives status from the qty on hand", async () => {
    const { result } = renderHook(() => useUpdateThresholdMutation(), {
      wrapper,
    });

    await result.current.mutateAsync({ itemId: "item-1", threshold: 10 });

    const [first] = db.tables.inventory_items;
    expect(first?.threshold).toBe(10);
    // 40 on hand against a threshold of 10 is no longer low, so the row has to
    // leave the Low-Stock list rather than stay there until the next import.
    expect(first?.status).toBe("in");
  });

  it("keeps an empty item Out however low the threshold goes", async () => {
    db = createFakeDb({ inventory_items: [item({ qty: 0, status: "out" })] });
    getDb.mockResolvedValue(db);

    const { result } = renderHook(() => useUpdateThresholdMutation(), {
      wrapper,
    });
    await result.current.mutateAsync({ itemId: "item-1", threshold: 5 });

    const [first] = db.tables.inventory_items;
    expect(first?.status).toBe("out");
  });

  it("raises the threshold into Low without any stock movement", async () => {
    db = createFakeDb({
      inventory_items: [item({ qty: 40, status: "in", threshold: 10 })],
    });
    getDb.mockResolvedValue(db);

    const { result } = renderHook(() => useUpdateThresholdMutation(), {
      wrapper,
    });
    await result.current.mutateAsync({ itemId: "item-1", threshold: 41 });

    const [first] = db.tables.inventory_items;
    expect(first?.status).toBe("low");
  });

  it("stamps updated_at and targets only the item it was given", async () => {
    const { result } = renderHook(() => useUpdateThresholdMutation(), {
      wrapper,
    });

    await result.current.mutateAsync({ itemId: "item-1", threshold: 10 });

    const [first, second] = db.tables.inventory_items;
    expect(first?.updated_at).not.toBe("");
    expect(second?.threshold).toBe(50);
  });

  it("records who moved the threshold, from what to what", async () => {
    const { result } = renderHook(() => useUpdateThresholdMutation(), {
      wrapper,
    });

    await result.current.mutateAsync({ itemId: "item-1", threshold: 10 });

    const [entry] = db.tables.audit_log;
    expect(entry).toMatchObject({
      action: "settings",
      target_id: "item-1",
      target_kind: "item",
    });
    expect(String(entry?.detail)).toContain("50");
    expect(String(entry?.detail)).toContain("10");
  });
});
