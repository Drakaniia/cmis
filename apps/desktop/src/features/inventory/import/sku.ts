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

function extractStrength(dosage: string): string | null {
  const match = dosage.match(STRENGTH_NUMBER);
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
  dosage: string,
  existingSkus?: Set<string>
): string {
  const prefix = extractPrefix(name.trim());
  const strength = extractStrength(dosage);

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
