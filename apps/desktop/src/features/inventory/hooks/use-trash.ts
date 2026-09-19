import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import { fetchItemImpact, type ItemImpact } from "../creation/impact";
import { restoreBatch, softDeleteBatch } from "../creation/trash/batch-ops";
import { restoreItem, softDeleteItem } from "../creation/trash/item-ops";
import { purgeTrash } from "../creation/trash/purge";
import { listTrash } from "../creation/trash/records";
import type {
  BatchDeleteSummary,
  BatchRef,
  DeleteSummary,
  PurgeSummary,
  RestoreResult,
  TrashEntry,
} from "../creation/trash/types";

export const TRASH_QUERY_KEY = "trash";

/**
 * Trashed rows are extracted rather than flagged, so every consumer of the live
 * tables has to refetch after a delete or a restore — not just the Trash tab.
 */
function invalidateInventory(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inventory_items"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
    queryClient.invalidateQueries({ queryKey: [TRASH_QUERY_KEY] }),
  ]);
}

export function useTrash() {
  return useQuery({
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<TrashEntry[]> => listTrash(await getDb()),
    queryKey: [TRASH_QUERY_KEY],
    retry: false,
    staleTime: 10_000,
  });
}

/** Counted before the modal opens, so the warning shows real numbers. */
export function useDeleteImpact(itemIds: string[]) {
  const ids = [...new Set(itemIds)].filter((id) => id !== "").sort();
  return useQuery({
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, ItemImpact>> =>
      fetchItemImpact(await getDb(), ids),
    queryKey: ["delete_impact", ...ids],
    retry: false,
    staleTime: 5000,
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      itemId: string;
      reason?: string | null;
    }): Promise<DeleteSummary> =>
      softDeleteItem(await getDb(), input.itemId, { reason: input.reason }),
    onSuccess: () => invalidateInventory(queryClient),
  });
}

export function useDeleteBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: BatchRef & { reason?: string | null }
    ): Promise<BatchDeleteSummary> => {
      const ref: BatchRef =
        "batchId" in input
          ? { batchId: input.batchId }
          : { batchName: input.batchName, itemId: input.itemId };
      return softDeleteBatch(await getDb(), ref, { reason: input.reason });
    },
    onSuccess: () => invalidateInventory(queryClient),
  });
}

export function useRestoreTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: TrashEntry["kind"];
      skuOverride?: string;
      trashId: string;
    }): Promise<RestoreResult> => {
      const db = await getDb();
      return input.kind === "batch"
        ? restoreBatch(db, input.trashId)
        : restoreItem(db, input.trashId, { skuOverride: input.skuOverride });
    },
    onSuccess: () => invalidateInventory(queryClient),
  });
}

export function usePurgeTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (trashIds: string[]): Promise<PurgeSummary> =>
      purgeTrash(await getDb(), trashIds),
    onSuccess: () => invalidateInventory(queryClient),
  });
}
