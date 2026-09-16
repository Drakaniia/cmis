import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-db";
import { useStockOutMutation } from "./use-stock-mutations";

/**
 * Expiry Alerts' Dispose reuses the stock-out path, so the rules that make a
 * disposal correct live here: the batch is emptied, the item's qty follows, the
 * status is re-derived — and, because nothing was dispensed to a patient, no
 * dispensing event is recorded.
 */

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
    needs_batch: 0,
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

function batch(overrides: Record<string, unknown> = {}) {
  return {
    batch: "LOT-8842",
    expiry: "2026-01-31",
    id: "batch-1",
    item_id: "item-1",
    qty: 40,
    supplier: "PharmaCorp",
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
    inventory_batches: [batch()],
    inventory_items: [item()],
  });
  getDb.mockReset();
  getDb.mockResolvedValue(db);
});

describe("disposing a batch through the stock-out path", () => {
  it("empties the batch, corrects the qty and re-derives the status", async () => {
    const { result } = renderHook(() => useStockOutMutation(), { wrapper });

    await result.current.mutateAsync({
      batch: "LOT-8842",
      itemId: "item-1",
      qty: 40,
      reason: "Disposed (expired)",
    });

    const [row] = db.tables.inventory_items;
    expect(row?.qty).toBe(0);
    expect(row?.status).toBe("out");
    // Nothing is left on the shelf, so the row now needs a batch.
    expect(row?.needs_batch).toBe(1);
    expect(db.tables.inventory_batches).toHaveLength(0);
  });

  it("records no dispensing event — a disposal is not a dispense", async () => {
    const { result } = renderHook(() => useStockOutMutation(), { wrapper });

    await result.current.mutateAsync({
      batch: "LOT-8842",
      itemId: "item-1",
      qty: 40,
      reason: "Disposed (expired)",
    });

    expect(db.tables.dispensing_events).toHaveLength(0);
  });

  it("still records dispensing for a dispense, so the history keeps its totals", async () => {
    const { result } = renderHook(() => useStockOutMutation(), { wrapper });

    await result.current.mutateAsync({
      batch: "LOT-8842",
      itemId: "item-1",
      qty: 5,
      reason: "Dispensed",
    });

    const [event] = db.tables.dispensing_events;
    expect(event).toMatchObject({ item_id: "item-1", qty: 5 });
  });

  it("keeps the free-text reason the operator had to type", async () => {
    const { result } = renderHook(() => useStockOutMutation(), { wrapper });

    await result.current.mutateAsync({
      batch: "LOT-8842",
      itemId: "item-1",
      qty: 6,
      reason: "Other",
      reasonOther: "Dropped the box in the yard",
    });

    // The modal insists on this text, and there is nowhere else for it to go.
    const [entry] = db.tables.audit_log;
    expect(entry).toMatchObject({ action: "stock-out", target_id: "item-1" });
    expect(String(entry?.detail)).toContain("Dropped the box in the yard");
    expect(String(entry?.detail)).toContain("Paracetamol 500 mg");
  });

  it("leaves the batch in place when the take is smaller than the lot", async () => {
    const { result } = renderHook(() => useStockOutMutation(), { wrapper });

    await result.current.mutateAsync({
      batch: "LOT-8842",
      itemId: "item-1",
      qty: 6,
      reason: "Damaged",
    });

    const [row] = db.tables.inventory_batches;
    expect(row?.qty).toBe(34);
    expect(db.tables.inventory_items[0]?.qty).toBe(34);
  });
});
