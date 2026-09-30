import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInventoryDeletion } from "./use-inventory-deletion";

const purgeTrash = vi.fn();
const runManualBackup = vi.fn();
let isDesktop = true;

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/open-external", () => ({
  isTauriRuntime: () => isDesktop,
}));

vi.mock("@/features/backup/hooks/use-daily-backup", () => ({
  useBackupActions: () => ({ retry: vi.fn(), runManualBackup }),
}));

vi.mock("./use-trash", () => ({
  useDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDeleteImpact: () => ({ data: new Map() }),
  useDeleteItem: () => ({ mutateAsync: vi.fn() }),
  usePurgeTrash: () => ({ mutateAsync: purgeTrash }),
  useRestoreTrash: () => ({ mutateAsync: vi.fn() }),
  useTrash: () => ({ data: [] }),
}));

const filters = {
  category: "All",
  search: "",
  sortDir: "asc",
  sortKey: "name",
  status: "All",
} as const;
const noItems: never[] = [];

function renderDeletion() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(
    () => useInventoryDeletion({ filtered: noItems, filters, items: noItems }),
    { wrapper }
  );
}

const TRASH_ITEM = {
  batchCount: 1,
  deletedAt: "2026-09-30",
  dispensingCount: 2,
  id: "trash-1",
  kind: "item",
  label: "Paracetamol 500mg",
} as never;

/** Open the purge modal, then let the state update land before confirming. */
async function openAndConfirm(result: {
  current: ReturnType<typeof useInventoryDeletion>;
}) {
  await act(() => {
    result.current.requestPurge(TRASH_ITEM);
  });
  await act(() => result.current.confirmPurge(""));
}

beforeEach(() => {
  isDesktop = true;
  purgeTrash.mockReset().mockResolvedValue({
    batches: 1,
    dispensingRecords: 2,
    products: 1,
  });
  runManualBackup.mockReset().mockResolvedValue({ name: "cmis-manual-x.db" });
});

describe("confirmPurge safety gate", () => {
  it("writes a safety backup before purging", async () => {
    const order: string[] = [];
    runManualBackup.mockImplementation(() => {
      order.push("backup");
      return Promise.resolve({ name: "cmis-manual-x.db" });
    });
    purgeTrash.mockImplementation(() => {
      order.push("purge");
      return Promise.resolve({
        batches: 1,
        dispensingRecords: 2,
        products: 1,
      });
    });

    const { result } = renderDeletion();
    await openAndConfirm(result);

    await waitFor(() => expect(purgeTrash).toHaveBeenCalled());
    expect(order).toEqual(["backup", "purge"]);
  });

  it("refuses to purge when the safety backup fails", async () => {
    // Purge is the only irreversible in-app action. Destroying data that has
    // just been proven unrecoverable is worse than refusing.
    runManualBackup.mockRejectedValue(new Error("backup disk is full"));

    const { result } = renderDeletion();
    await openAndConfirm(result);

    await waitFor(() => expect(runManualBackup).toHaveBeenCalled());
    expect(purgeTrash).not.toHaveBeenCalled();
  });
});
