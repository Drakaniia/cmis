import { vi } from "vitest";
import type { VocabularyKind } from "@/features/inventory/domain/vocabulary";
import type { VocabularyTerm } from "@/features/inventory/domain/vocabulary-terms";

/**
 * Test-only stand-in for `@/features/inventory/hooks/use-vocabulary-terms`.
 *
 * `VocabularyPicker` reads the shared term query, so any component test that
 * mounts one — the wizard, the edit panel, the new-product form, the delivery
 * sheet — would otherwise need a `QueryClientProvider` and a database mock just
 * to render a dropdown. This is the same trade `categories-mock.ts` already
 * makes for `CategoryPicker`, and for the same reason: keep the component's own
 * behaviour under test, leave the data layer to the data tests.
 *
 * The fixtures are the shipped seeds, which is what a migrated database holds on
 * a first launch. The mutations are exported so a test can assert what a create
 * or a rename was asked to do.
 *
 * Use it with:
 *
 * ```ts
 * vi.mock("../hooks/use-vocabulary-terms", () => import("@/test/vocabulary-mock"));
 * ```
 */

function seededTerms(kind: VocabularyKind): VocabularyTerm[] {
  const names: Record<VocabularyKind, readonly string[]> = {
    form: [
      "ampule",
      "box",
      "cap",
      "capsule",
      "cream",
      "drops",
      "gel",
      "inhaler",
      "injection",
      "lotion",
      "nebule",
      "ointment",
      "piece",
      "sachet",
      "solution",
      "spray",
      "suppository",
      "susp",
      "suspension",
      "syrup",
      "tab",
      "tablet",
      "tabs",
      "vial",
    ],
    pack_unit: ["bottle", "box", "carton", "pack", "strip", "tube"],
    strength_unit: [
      "%",
      "IU",
      "g",
      "mcg",
      "mg",
      "mg/5ml",
      "mg/ml",
      "ml",
      "units",
    ],
  };
  return names[kind].map((name) => ({
    id: `vt-${kind}-${name.replace(/[^a-z0-9]+/g, "-")}`,
    kind,
    name,
    usageCount: 0,
  }));
}

export const TERM_FIXTURES: Record<VocabularyKind, VocabularyTerm[]> = {
  form: seededTerms("form"),
  pack_unit: seededTerms("pack_unit"),
  strength_unit: seededTerms("strength_unit"),
};

/**
 * The list the mocked query serves.
 *
 * Mutable so a test can stage a row with a usage count — the panel refuses to
 * delete a term items still carry, and no fixture ships one, because a fresh
 * database genuinely has none. Reassign `TERM_FIXTURES.form` in a case rather
 * than adding a second knob: one source of truth is easier to reason about than
 * a base list plus an override map.
 */
export function setTermFixtures(
  kind: VocabularyKind,
  terms: VocabularyTerm[]
): void {
  TERM_FIXTURES[kind] = terms;
}

/** Restores every list to the shipped seeds. Call from `beforeEach`. */
export function resetTermFixtures(): void {
  setTermFixtures("form", seededTerms("form"));
  setTermFixtures("pack_unit", seededTerms("pack_unit"));
  setTermFixtures("strength_unit", seededTerms("strength_unit"));
}

export const createTermMutate = vi.fn();
export const renameTermMutate = vi.fn();
export const deleteTermMutate = vi.fn();

export function useVocabularyTerms(kind: VocabularyKind) {
  return {
    data: TERM_FIXTURES[kind],
    error: null,
    isLoading: false,
  };
}

export function useCreateVocabularyTerm() {
  return { isPending: false, mutate: createTermMutate };
}

export function useRenameVocabularyTerm() {
  return { isPending: false, mutate: renameTermMutate };
}

export function useDeleteVocabularyTerm() {
  return { isPending: false, mutate: deleteTermMutate };
}
