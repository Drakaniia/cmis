/**
 * Reads a search param as a trimmed, non-empty string.
 *
 * Every `*-search.ts` validates its URL state through this, so a blank or
 * non-string param is dropped the same way whichever screen produced it.
 */
export function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
