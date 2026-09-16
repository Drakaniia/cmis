import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-db";
import { useExtendExpiryMutation } from "./use-extend-expiry";

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
  itemId: "item-1",
  newExpiry: "2027-03-15",
  note: "Supplier confirmed a longer shelf life",
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
  });
  getDb.mockReset();
  getDb.mockResolvedValue(db);
});

describe("useExtendExpiryMutation", () => {
  it("moves the named batch's expiry and leaves the other batches alone", async () => {
    const { result } = renderHook(() => useExtendExpiryMutation(), { wrapper });

    await result.current.mutateAsync(INPUT);

    const [first, second] = db.tables.inventory_batches;
    expect(first?.expiry).toBe("2027-03-15");
    expect(second?.expiry).toBe("2027-06-01");
  });

  it("keeps the required note in the audit trail, the only place it can live", async () => {
    const { result } = renderHook(() => useExtendExpiryMutation(), { wrapper });

    await result.current.mutateAsync(INPUT);

    const [entry] = db.tables.audit_log;
    expect(entry).toMatchObject({
      action: "correction",
      reason: "Supplier confirmed a longer shelf life",
      target_id: "batch-1",
      target_kind: "batch",
    });
    expect(String(entry?.detail)).toContain("LOT-8842");
  });

  it("still extends the expiry when only the audit write fails", async () => {
    getDb.mockResolvedValue({
      ...db,
      execute: (sql: string, params?: unknown[]) =>
        /INSERT INTO audit_log/i.test(sql)
          ? Promise.reject(new Error("disk full"))
          : db.execute(sql, params),
    });

    const { result } = renderHook(() => useExtendExpiryMutation(), { wrapper });
    await result.current.mutateAsync(INPUT);

    // The operator's extension is the real work; a broken log must not lose it.
    expect(db.tables.inventory_batches[0]?.expiry).toBe("2027-03-15");
  });

  it("refuses a batch that is no longer on the item", async () => {
    const { result } = renderHook(() => useExtendExpiryMutation(), { wrapper });

    await expect(
      result.current.mutateAsync({ ...INPUT, batch: "LOT-GONE" })
    ).rejects.toThrow(/LOT-GONE/);
  });
});
