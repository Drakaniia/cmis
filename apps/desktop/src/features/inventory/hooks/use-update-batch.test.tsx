import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-db";
import { useUpdateBatchMutation } from "./use-update-batch";

const getDb = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

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

const INPUT = {
  batch: "LOT-8842",
  expiry: "2027-03-15",
  itemId: "item-1",
  nextBatch: "LOT-8842-B",
  qty: 50,
  supplier: "NewCo",
};

let db: FakeDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  db = createFakeDb({
    inventory_batches: [
      batch(),
      batch({ batch: "LOT-9000", expiry: "2027-06-01", id: "batch-2" }),
    ],
    inventory_items: [{ id: "item-1", qty: 40, status: "in", threshold: 20 }],
  });
  getDb.mockReset();
  getDb.mockResolvedValue(db);
});

describe("useUpdateBatchMutation", () => {
  it("edits the four stored columns and leaves the other batch alone", async () => {
    const { result } = renderHook(() => useUpdateBatchMutation(), {
      wrapper,
    });

    await result.current.mutateAsync(INPUT);

    const [first, second] = db.tables.inventory_batches;
    expect(first).toMatchObject({
      batch: "LOT-8842-B",
      expiry: "2027-03-15",
      qty: 50,
      supplier: "NewCo",
    });
    expect(second).toMatchObject({ batch: "LOT-9000", qty: 40 });
  });

  it("moves the product qty by the delta, not to the batch sum", async () => {
    const { result } = renderHook(() => useUpdateBatchMutation(), {
      wrapper,
    });

    await result.current.mutateAsync(INPUT);

    // 40 on hand + (50 - 40) = 50 — the running total follows the edit.
    expect(db.tables.inventory_items[0]?.qty).toBe(50);
  });

  it("keeps the correction in the audit trail", async () => {
    const { result } = renderHook(() => useUpdateBatchMutation(), {
      wrapper,
    });

    await result.current.mutateAsync(INPUT);

    const [entry] = db.tables.audit_log;
    expect(entry).toMatchObject({
      action: "correction",
      target_id: "batch-1",
      target_kind: "batch",
    });
    expect(String(entry?.detail)).toContain("LOT-8842-B");
  });

  it("refuses to rename a batch onto another batch's name", async () => {
    const { result } = renderHook(() => useUpdateBatchMutation(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({ ...INPUT, nextBatch: "LOT-9000" })
    ).rejects.toThrow(/already uses/);
    // Nothing was written.
    expect(db.tables.inventory_batches[0]?.batch).toBe("LOT-8842");
  });

  it("still edits the batch when only the audit write fails", async () => {
    getDb.mockResolvedValue({
      ...db,
      execute: (sql: string, params?: unknown[]) =>
        /INSERT INTO audit_log/i.test(sql)
          ? Promise.reject(new Error("disk full"))
          : db.execute(sql, params),
    });

    const { result } = renderHook(() => useUpdateBatchMutation(), {
      wrapper,
    });
    await result.current.mutateAsync(INPUT);

    expect(db.tables.inventory_batches[0]?.batch).toBe("LOT-8842-B");
  });

  it("refuses a batch that is no longer on the item", async () => {
    const { result } = renderHook(() => useUpdateBatchMutation(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({ ...INPUT, batch: "LOT-GONE" })
    ).rejects.toThrow(/LOT-GONE/);
  });
});
