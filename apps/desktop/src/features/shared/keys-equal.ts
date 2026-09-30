/**
 * Field-by-field comparison for the URL search shapes, with the same
 * "missing means the default" rule the screens' own defaults imply.
 *
 * `defaults` names the key and the value a missing key compares as — e.g. a
 * preset omitted from the URL means "30d", a blank text param means "".
 */
export function keysEqual<T extends object>(
  a: T,
  b: T,
  defaults: Partial<Record<keyof T, string>>
): boolean {
  return Object.entries(defaults).every(([key, fallback]) => {
    const left = a[key as keyof T];
    const right = b[key as keyof T];
    return (left ?? fallback) === (right ?? fallback);
  });
}
