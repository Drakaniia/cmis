import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from "../data/categories";

/**
 * The one category list the whole app reads (migration 0006).
 *
 * The forms, the stock-in wizard, the edit panel, both filter bars and
 * Settings → Categories all render from this query, and every write goes
 * through these mutations — so a category created inside a dropdown is
 * immediately visible in the Settings panel, and a rename made there is
 * immediately visible in the forms. That shared list is the whole point: the
 * previous version kept a second copy in `useSettings` React state that nothing
 * else could see.
 *
 * A rename rewrites `inventory_items.category`, so the inventory queries are
 * invalidated alongside the list.
 */

export const CATEGORY_QUERY_KEY = ["categories"] as const;

function invalidateCategoryConsumers(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: [...CATEGORY_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
  queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] });
}

export function useCategories() {
  return useQuery({
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: listCategories,
    queryKey: [...CATEGORY_QUERY_KEY],
    retry: false,
    staleTime: 30_000,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => invalidateCategoryConsumers(queryClient),
  });
}

export function useRenameCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameCategory(id, name),
    onSuccess: () => invalidateCategoryConsumers(queryClient),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => invalidateCategoryConsumers(queryClient),
  });
}
