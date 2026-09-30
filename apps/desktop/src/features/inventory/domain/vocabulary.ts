/**
 * The seeded vocabularies for strength units, dose forms and pack units.
 *
 * These are the 41-column template's own tokens, not a clinical wish-list: the
 * import splitter reads a stored `dosage` back into `strength_unit` + `form`
 * using exactly these strings, so anything the creation form could offer that is
 * missing here would come back folded into the wrong column on the next
 * round-trip. One list, read by the splitter and the form both.
 *
 * Since migration 0013 these arrays are the **seed**, not the list. The live list
 * lives in the `vocabulary_terms` table and reaches the app through the hydrated
 * snapshot in `vocabulary-store.ts`; every form, the stock-in wizard, the edit
 * panel and the delivery sheet read the snapshot, and the operator can add,
 * rename and delete entries from inside any of them.
 *
 * They are kept here for four reasons, and each one is load-bearing:
 *
 * 1. `domain/vocabulary.test.ts` pins them to the seed rows in
 *    `0013_vocabulary_terms.sql`, so a fresh database and a fresh checkout
 *    cannot disagree about what a new install offers.
 * 2. `scripts/inventory_vocabulary.py` mirrors `SEED_STRENGTH_UNITS` and
 *    `SEED_MEDICINE_FORMS` for the template's `DataValidation` lists.
 * 3. The snapshot **starts** as these arrays, so a read that happens before
 *    hydration — a unit test, the browser preview, a module that loads before
 *    the database does — still sees a correct list rather than an empty one.
 * 4. `PACK_CONTAINER_TOKENS` is parser-only and deliberately not in the table.
 */

/** Which list a term belongs to. The value is stored in `vocabulary_terms.kind`. */
export type VocabularyKind = "form" | "pack_unit" | "strength_unit";

/** Every kind, in the order the forms and the migration present them. */
export const VOCABULARY_KINDS = [
  "strength_unit",
  "form",
  "pack_unit",
] as const satisfies readonly VocabularyKind[];

/** Long enough for `mg/5ml` and `suppository`, short enough to stay one line. */
export const VOCABULARY_TERM_MAX_LENGTH = 24;

export const SEED_STRENGTH_UNITS = [
  "mg",
  "g",
  "mcg",
  "ml",
  "mg/ml",
  "mg/5ml",
  "%",
  "IU",
  "units",
] as const;

/**
 * The seeded pack vocabulary — the containers one pack multiple may be counted
 * in (pack-size-handling D17). One list, read by the item form's pack-unit
 * picker and by the request form's item-aware unit list, so `box` cannot mean
 * two things on two screens.
 */
export const SEED_PACK_UNITS = [
  "box",
  "strip",
  "pack",
  "carton",
  "bottle",
  "tube",
] as const;

/**
 * The containers the **parser** may read off a legacy `pack_size` cell.
 *
 * A superset of the pack vocabulary: the reference workbook's leftover bucket
 * also names `vial`, `ampule` and `nebule`, and a `(10/vial)` group is still an
 * unambiguous pack multiple worth pairing. These three are read-only — they are
 * never seeded into `vocabulary_terms` and never offered in the pack-unit
 * picker, so a new item can only be written in a term the operator picked from
 * the list (V6).
 */
export const PACK_CONTAINER_TOKENS = [
  ...SEED_PACK_UNITS,
  "vial",
  "ampule",
  "nebule",
] as const;

export const SEED_MEDICINE_FORMS = [
  "tablet",
  "capsule",
  "cap",
  "sachet",
  "syrup",
  "suspension",
  "susp",
  "ointment",
  "cream",
  "drops",
  "vial",
  "ampule",
  "nebule",
  "injection",
  "suppository",
  "box",
  "piece",
  "tabs",
  "tab",
  "inhaler",
  "solution",
  "gel",
  "lotion",
  "spray",
] as const;

/**
 * The seed for each kind, in the order the dropdowns present them.
 *
 * The snapshot in `vocabulary-store.ts` is built from this, and the migration
 * test reads the same three arrays out of `0013_vocabulary_terms.sql` — so this
 * object is the single place that says what a fresh install offers.
 */
export const SEED_VOCABULARY: Record<VocabularyKind, readonly string[]> = {
  form: SEED_MEDICINE_FORMS,
  pack_unit: SEED_PACK_UNITS,
  strength_unit: SEED_STRENGTH_UNITS,
};

/** The singular noun each kind is called in an operator-facing sentence. */
export const VOCABULARY_NOUN: Record<VocabularyKind, string> = {
  form: "form",
  pack_unit: "pack unit",
  strength_unit: "strength unit",
};

/** The column label each kind carries in the stock-in wizard and the edit panel. */
export const VOCABULARY_LABEL: Record<VocabularyKind, string> = {
  form: "Form",
  pack_unit: "Pack unit",
  strength_unit: "Strength unit",
};
