import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createVocabularyTerm,
  deleteVocabularyTerm,
  listVocabularyTerms,
  renameVocabularyTerm,
} from "../data/vocabulary-terms";
import type { VocabularyKind } from "../domain/vocabulary";

/**
 * The live strength unit, form and pack unit lists (migration 0013).
 *
 * Every field that asks for one of these — the new-product form, the delivery
 * sheet and its defaults strip, the stock-in wizard's Step 2 and the edit panel
 * — renders the same `VocabularyPicker`, and every write goes through these
 * mutations. So a unit added while doing a stock-in is immediately available in
 * the delivery sheet, and a rename made in one place is immediately true
 * everywhere else.
 *
 * A rename rewrites `inventory_items` and recomposes `display_name` and
 * `pack_size`, so the inventory queries are invalidated alongside the list. The
 * mutation also pushes the new list straight into the synchronous snapshot in
 * `domain/vocabulary-store.ts`, which is why `splitDosage` and `baseUnitFor`
 * see it without a refetch.
 */

export const VOCABULARY_QUERY_KEY = ["vocabulary_terms"] as const;

function vocabularyKey(kind: VocabularyKind): readonly string[] {
  return [...VOCABULARY_QUERY_KEY, kind];
}

function invalidateVocabularyConsumers(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: [...VOCABULARY_QUERY_KEY] });
  queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
  queryClient.invalidateQueries({ queryKey: ["inventory_items_count"] });
}

export function useVocabularyTerms(kind: VocabularyKind) {
  return useQuery({
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    queryFn: () => listVocabularyTerms(kind),
    queryKey: vocabularyKey(kind),
    retry: false,
    staleTime: 30_000,
  });
}

export function useCreateVocabularyTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      name,
    }: {
      kind: VocabularyKind;
      name: string;
    }) => createVocabularyTerm(kind, name),
    onSuccess: () => invalidateVocabularyConsumers(queryClient),
  });
}

export function useRenameVocabularyTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameVocabularyTerm(id, name),
    onSuccess: () => invalidateVocabularyConsumers(queryClient),
  });
}

export function useDeleteVocabularyTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVocabularyTerm(id),
    onSuccess: () => invalidateVocabularyConsumers(queryClient),
  });
}
