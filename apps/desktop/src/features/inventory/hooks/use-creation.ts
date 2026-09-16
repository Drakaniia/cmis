import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDb } from "@/lib/db";
import {
  type CommitCreationResult,
  commitCreation,
} from "../creation/commit-creation";
import type { CreationDraft } from "../creation/draft";
import { type IdentityIndex, loadIdentityIndex } from "../creation/identity";

export const IDENTITY_QUERY_KEY = "inventory_identities";

/**
 * A commit inserts rows and rewrites existing ones, so everything keyed off the
 * inventory tables is stale afterwards — including the identity index the forms
 * validate against.
 */
function invalidateInventory(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inventory_items"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
    queryClient.invalidateQueries({ queryKey: [IDENTITY_QUERY_KEY] }),
  ]);
}

export function useInventoryIdentities() {
  return useQuery({
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<IdentityIndex> =>
      loadIdentityIndex(await getDb()),
    queryKey: [IDENTITY_QUERY_KEY],
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * The single write path for `/admin/inventory/add` (spec §10.5). The route only
 * decides *when* to commit; the snapshot/restore policy lives in
 * `creation/commit-creation.ts` so it can be unit-tested without React.
 */
export function useCreateInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CreationDraft): Promise<CommitCreationResult> =>
      commitCreation(await getDb(), draft),
    onSuccess: () => invalidateInventory(queryClient),
  });
}
