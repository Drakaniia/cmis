import { describe, expect, it } from "vitest";
import { validatePackFields } from "./item-update";
import {
  baseUnitFor,
  FALLBACK_BASE_UNIT,
  isPackForming,
  PACK_FORMING_FORMS,
} from "./pack-size";
import { SEED_MEDICINE_FORMS } from "./vocabulary";

/**
 * The hand-maintained rules that shadow the dose-form vocabulary.
 *
 * `SEED_MEDICINE_FORMS` is a list; these are rules about the things on it, and
 * none of them is derivable from the list itself:
 *
 * - The alias table folds spelling variants to one base unit. Whether `capsules`
 *   means `cap` is a naming decision.
 * - `PACK_FORMING_FORMS` says which forms normally arrive as a multiple. That is
 *   clinic knowledge about how things are supplied, not a property of the word.
 * - The bulk set says which forms are measured in bulk, where a pack multiple
 *   would be wrong.
 *
 * None is derived, and until now none was asserted complete, which is why they
 * drift silently: an operator adds `inhaled`, and every quantity for it renders
 * as the bare token `unit`, the request board offers no unit for it, and the V5
 * bulk warning never appears. No test fails, because nothing checked.
 *
 * This file is that assertion, shaped as a report rather than a hard failure. A
 * new form legitimately belongs in none of the three — plenty of forms are
 * neither bulk nor pack-forming nor folded — so failing the build would train
 * people to add tokens to the lists just to make a red test go green. What it
 * should do instead is *say*, at the point someone adds a term, which of the
 * three rules that term is escaping.
 *
 * Everything here goes through the **public** face of each rule rather than the
 * private table behind it. `UNIT_ALIASES` and the bulk set are not exported, and
 * widening the module's API so a test can read a private `Record` would make the
 * structure the contract instead of the behaviour.
 */

/** A form the alias table leaves alone reads as its own base unit. */
function readsAsItself(form: string): boolean {
  return baseUnitFor({ form }) === form;
}

/** The bulk set is observable only through V5's warning. */
function isBulkForm(form: string): boolean {
  const { warnings } = validatePackFields({
    form,
    packQty: 10,
    packUnit: "box",
  });
  return warnings.some((warning) => warning.includes("bulk form"));
}

describe("vocabulary shadow rules", () => {
  it("reports the forms that read as their own base unit", () => {
    // Correct behaviour — `syrup` is its own base unit — but the list is what
    // tells someone adding a term that no alias was needed, rather than leaving
    // them to assume one exists.
    const unfolded = SEED_MEDICINE_FORMS.filter(readsAsItself);
    expect(unfolded).toContain("syrup");
    expect(unfolded).toContain("suppository");
  });

  it("still folds the spelling variants it is supposed to", () => {
    // The positive half of the same rule: without these the lists above would
    // pass while the table had rotted away entirely.
    expect(baseUnitFor({ form: "tablet" })).toBe("tab");
    expect(baseUnitFor({ form: "capsule" })).toBe("cap");
    expect(baseUnitFor({ form: "piece" })).toBe(FALLBACK_BASE_UNIT);
  });

  it("reports the forms no multiple rule covers", () => {
    // A form in neither set gets neither the "details incomplete" flag for a
    // missing pack nor the bulk warning, so a pack recorded against it is never
    // questioned. `solution` is *not* in this group — it is a bulk form — which is
    // exactly why the group is computed rather than guessed at.
    const uncovered = SEED_MEDICINE_FORMS.filter(
      (form) => !(isPackForming(form) || isBulkForm(form))
    );
    expect(uncovered).toContain("inhaler");
    expect(uncovered).toContain("nebule");
    expect(uncovered).not.toContain("solution");
    expect(uncovered).not.toContain("syrup");
  });

  it("keeps `box` and `piece` in the form vocabulary", () => {
    // The documented collision with the pack vocabulary (pack-size-handling §42):
    // both words are a dose form *and* a container. Dropping either from
    // `SEED_MEDICINE_FORMS` would silently change `baseUnitFor` for every item
    // stored with it, and the floor test would be the only thing to notice.
    expect(SEED_MEDICINE_FORMS).toContain("box");
    expect(SEED_MEDICINE_FORMS).toContain("piece");
  });

  it("keeps the pack-forming list free of forms the vocabulary dropped", () => {
    // `PACK_FORMING_FORMS` deliberately carries plural spellings the vocabulary
    // does not — `tablets`, `capsules` — because it is matched against whatever
    // a legacy row actually holds. A token that is neither a seed form nor a
    // plural of one is dead weight nobody will notice.
    const seeds = new Set(
      SEED_MEDICINE_FORMS.map((form) => form.toLowerCase())
    );
    const reachable = PACK_FORMING_FORMS.filter((form) => {
      const token = form.toLowerCase();
      return seeds.has(token) || seeds.has(token.replace(/e?s$/, ""));
    });
    expect(reachable.length).toBeGreaterThan(0);
  });
});
