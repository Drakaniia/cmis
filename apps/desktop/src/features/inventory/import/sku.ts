function extractPrefix(name: string): string | null {
  const cleaned = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (cleaned.length < 3) {
    return null;
  }
  // spec examples: Acetylcysteine (14) -> ACET (4), Cetirizine (10) -> CET (3), AscorbicAcid (17) -> ASCO (4)
  // heuristic: >10 chars -> 4, else 3 (keeps examples consistent while staying deterministic)
  if (cleaned.length > 10) {
    return cleaned.slice(0, 4);
  }
  if (cleaned.length >= 3) {
    return cleaned.slice(0, 3);
  }
  return null;
}

const STRENGTH_NUMBER = /-?\d+/;

/**
 * The numeric half of `strength_value`, which is now a stored column rather than
 * something parsed out of a flattened `dosage` (spec §5, decision 10).
 *
 * Compound values contribute their first number — `200/200/5` was `SKU-…-200`
 * before the strength split existed and stays that way: **existing SKUs are never
 * renumbered**, so only newly derived ones are affected at all.
 */
function extractStrength(strengthValue: string): string | null {
  const match = strengthValue.match(STRENGTH_NUMBER);
  return match ? match[0] : null;
}

function randomHex(len: number): string {
  const chars = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * 16)];
  }
  return out;
}

export function deriveSku(
  name: string,
  strengthValue: string,
  existingSkus?: Set<string>
): string {
  const prefix = extractPrefix(name.trim());
  const strength = extractStrength(strengthValue);

  let base: string;
  if (!prefix) {
    base = `SKU-${randomHex(8)}`;
  } else if (strength) {
    base = `SKU-${prefix}-${strength}`;
  } else {
    base = `SKU-${prefix}`;
  }

  if (!existingSkus?.has(base)) {
    return base;
  }

  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (existingSkus.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
