import {
  type VocabularyKind,
  VOCABULARY_TERM_MAX_LENGTH,
} from "./vocabulary";

/**
 * One row of the shared vocabulary table (migration 0013).
 *
 * A term is a **label, not a foreign key**: `inventory_items.form` holds the
 * name itself, which is why renaming one is a cascade over the items that carry
 * the old text, and why the name — not the id — is what every picker renders.
 * That is the same relationship `domain/categories.ts` describes, and it is also
 * why the two modules agree on almost everything.
 */
export interface VocabularyTerm {
  id: string;
  kind: VocabularyKind;
  name: string;
  /** How many inventory items currently carry this term's name. */
  usageCount: number;
}

/**
 * `crypto.randomUUID` with a `Math.random` fallback, mirroring
 * `newCategoryId`: the browser and the Tauri webview both provide it, but a
 * jsdom test environment may not.
 */
export function newTermId(now: number = Date.now()): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === "function") {
    return uuid.call(globalThis.crypto);
  }
  return `vt-${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Collapses the whitespace an operator pastes in, so "mg / 5ml " and
 * "mg / 5ml" cannot become two terms that look identical in a dropdown.
 *
 * Case is deliberately **not** folded: `IU` is the correct spelling of its own
 * unit, and the table's `COLLATE NOCASE` handles the duplicate check without the
 * stored text being rewritten out from under the operator.
 */
export function normalizeTermName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The id a seeded or adopted term gets, derived from its name.
 *
 * `0013_vocabulary_terms.sql` writes the same derivation in SQL
 * (`'vt-form-' || lower(replace(trim(form), ' ', '-'))`), and the settings wipe
 * re-seeds through this function, so a first launch, an adoption and a reset
 * produce the same row instead of three that look alike.
 */
export function seedTermId(kind: VocabularyKind, name: string): string {
  const slug = normalizeTermName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `vt-${kind}-${slug}`;
}

/** Case-insensitive lookup — "Tab" and "tab" are the same term. */
export function findTermByName(
  name: string,
  existing: readonly string[]
): string | null {
  const needle = normalizeTermName(name).toLowerCase();
  return existing.find((entry) => entry.toLowerCase() === needle) ?? null;
}

/**
 * The one duplicate/blank/length check every entry point shares. Returns a
 * message to show the operator, or `null` when the name is usable.
 *
 * `ignore` is the name being renamed, so saving an edit without touching the
 * name is not reported as a collision with itself.
 */
export function validateTermName(
  name: string,
  existing: readonly string[],
  options: { ignore?: string } = {}
): string | null {
  const clean = normalizeTermName(name);
  if (clean === "") {
    return "Name is required.";
  }
  if (clean.length > VOCABULARY_TERM_MAX_LENGTH) {
    return `Terms are ${VOCABULARY_TERM_MAX_LENGTH} characters or fewer.`;
  }
  const others =
    options.ignore === undefined
      ? existing
      : existing.filter(
          (entry) =>
            entry.toLowerCase() !==
            normalizeTermName(options.ignore ?? "").toLowerCase()
        );
  const duplicate = findTermByName(clean, others);
  if (duplicate !== null) {
    return `${duplicate} already exists.`;
  }
  return null;
}
