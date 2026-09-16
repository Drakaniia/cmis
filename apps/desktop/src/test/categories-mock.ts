import { vi } from "vitest";
import type { Category } from "@/features/inventory/domain/categories";

/**
 * Test-only stand-in for `@/features/inventory/hooks/use-categories`.
 *
 * The picker reads the shared category query, so any component test that mounts
 * it — the forms, the wizard, the edit panel, the detail modals — would
 * otherwise need a `QueryClientProvider` and a database mock just to render a
 * dropdown. The popover shim exists for the same reason: keep the component's
 * own behaviour under test, leave the data layer to the data tests.
 *
 * Use it with:
 *
 * ```ts
 * vi.mock("../hooks/use-categories", () => import("@/test/categories-mock"));
 * ```
 *
 * The mutations are exported so a test can assert what a create or a rename was
 * asked to do; the list is the shipped seven, which is what a migrated database
 * holds on a first launch.
 */

export const CATEGORY_FIXTURES: Category[] = [
  { id: "cat-analgesic", itemCount: 2, name: "Analgesic" },
  { id: "cat-antibiotic", itemCount: 0, name: "Antibiotic" },
  { id: "cat-antiseptic", itemCount: 0, name: "Antiseptic" },
  { id: "cat-supplement", itemCount: 0, name: "Supplement" },
  { id: "cat-respiratory", itemCount: 0, name: "Respiratory" },
  { id: "cat-gastro", itemCount: 0, name: "Gastro" },
  { id: "cat-first-aid", itemCount: 0, name: "First Aid" },
];

export const createCategoryMutate = vi.fn();
export const renameCategoryMutate = vi.fn();
export const deleteCategoryMutate = vi.fn();

export function useCategories() {
  return {
    data: CATEGORY_FIXTURES,
    error: null,
    isLoading: false,
  };
}

export function useCreateCategory() {
  return { isPending: false, mutate: createCategoryMutate };
}

export function useRenameCategory() {
  return { isPending: false, mutate: renameCategoryMutate };
}

export function useDeleteCategory() {
  return { isPending: false, mutate: deleteCategoryMutate };
}
