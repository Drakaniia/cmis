/**
 * The two rules the category and vocabulary-term taxonomies genuinely share.
 *
 * Both store a *label* rather than a foreign key, so a pasted name has to
 * collapse to one spelling and a lookup has to be case-insensitive. The
 * length limits and the message wording differ per taxonomy and stay with
 * their own modules.
 */
export function normalizeTaxonomyName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Case-insensitive lookup — "gastro" and "Gastro" are the same entry. */
export function findTaxonomyByName(
  name: string,
  existing: readonly string[]
): string | null {
  const needle = normalizeTaxonomyName(name).toLowerCase();
  return existing.find((entry) => entry.toLowerCase() === needle) ?? null;
}
