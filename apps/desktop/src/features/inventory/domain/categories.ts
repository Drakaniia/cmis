import { INVENTORY_CATEGORIES } from "../types";

/**
 * The category taxonomy, and the rules a name has to satisfy.
 *
 * A category is a *label*, not a foreign key: `inventory_items.category` holds
 * the name itself. That is why renaming one is a cascade over the items that
 * carry the old text, and why the name — not the id — is what the forms, the
 * wizard, the edit panel and the filter bars all render.
 *
 * The pure rules live here so the dropdown, the Settings panel and the data
 * layer all agree on what a legal name is; the writes live in `data/categories`.
 */

/** Moved from `admin/settings/types.ts` — the settings panel is one consumer. */
export interface Category {
  id: string;
  /** How many inventory items currently carry this category's name. */
  itemCount: number;
  name: string;
}

/**
 * The taxonomy a fresh database is seeded with (migration 0006 inserts exactly
 * these seven names). Kept as the fallback list for the import keyword mapper,
 * which has to name a category before any query has run.
 */
export const DEFAULT_CATEGORY_NAMES = INVENTORY_CATEGORIES;

/** Matches the `pack_size` rule — long enough for a real grouping, short enough
 *  to stay readable in the dropdown and the table column. */
export const CATEGORY_NAME_MAX_LENGTH = 40;

/**
 * `crypto.randomUUID` with a `Math.random` fallback, mirroring `newAuditId` and
 * `newItemId`: the browser and Tauri webview both provide it, but a jsdom test
 * environment may not.
 */
export function newCategoryId(now: number = Date.now()): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === "function") {
    return uuid.call(globalThis.crypto);
  }
  return `cat-${now.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Collapses the whitespace an operator pastes in, so "First   Aid " and
 * "First Aid" cannot become two categories that look identical in a dropdown.
 */
export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The id a seeded category gets, derived from its name.
 *
 * Migration 0006 writes the same ids in its INSERT, and the Settings wipe puts
 * the taxonomy back with this function, so a first launch and a reset produce
 * the same rows instead of two sets that look alike.
 */
export function seedCategoryId(name: string): string {
  return `cat-${normalizeCategoryName(name).toLowerCase().replace(/\s+/g, "-")}`;
}

/** Case-insensitive lookup — "gastro" and "Gastro" are the same category. */
export function findCategoryByName(
  name: string,
  existing: readonly string[]
): string | null {
  const needle = normalizeCategoryName(name).toLowerCase();
  return existing.find((entry) => entry.toLowerCase() === needle) ?? null;
}

/**
 * The one duplicate/blank check every entry point shares. Returns a message to
 * show the operator, or `null` when the name is usable.
 *
 * `ignore` is the name being renamed, so saving an edit without touching the
 * name is not reported as a collision with itself.
 */
export function validateCategoryName(
  name: string,
  existing: readonly string[],
  options: { ignore?: string } = {}
): string | null {
  const clean = normalizeCategoryName(name);
  if (clean === "") {
    return "Name is required.";
  }
  if (clean.length > CATEGORY_NAME_MAX_LENGTH) {
    return `Category names are ${CATEGORY_NAME_MAX_LENGTH} characters or fewer.`;
  }
  const others =
    options.ignore === undefined
      ? existing
      : existing.filter(
          (entry) =>
            entry.toLowerCase() !==
            normalizeCategoryName(options.ignore ?? "").toLowerCase()
        );
  const duplicate = findCategoryByName(clean, others);
  if (duplicate !== null) {
    return `${duplicate} already exists.`;
  }
  return null;
}

/** The names in the order the dropdowns render them, de-duplicated. */
export function categoryNames(categories: readonly Category[]): string[] {
  return categories.map((category) => category.name);
}
