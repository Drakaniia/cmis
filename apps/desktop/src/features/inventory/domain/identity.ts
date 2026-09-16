/**
 * Medication identity — the **one** key function the importer, the preview, the
 * creation forms and the backfill all agree on (decision 9, spec §7.1).
 *
 * Identity is `name` + all four strength fields. Two keys are produced for a
 * given row:
 *
 * - the **canonical** key: every part, lower-cased, joined with `|`. This is the
 *   field-by-field comparison.
 * - the **label** key: the composed full `display_name`, normalized. Because
 *   `composeDisplayName` joins the same four parts in a fixed template order,
 *   this key is equal whenever the parts are, and *also* equal when the parts were
 *   placed in different slots — the forgiving half of the pair.
 *
 * The second key exists for one concrete reason: a legacy row's `dosage` is
 * re-split by the backfill, and a re-import reads the template columns directly.
 * If those two disagree about which slot a token belongs in, the canonical key
 * misses and the import would insert a duplicate. The label key catches it.
 */

import {
  composeDisplayName,
  normalizeText,
  type StrengthParts,
} from "./strength";

export interface IdentityParts {
  form: string;
  name: string;
  packSize: string;
  strengthUnit: string;
  strengthValue: string;
}

/** Trim, case-fold and collapse whitespace, so `500 mg` and `500mg ` agree. */
export function normalizeIdentityPart(value: string): string {
  return normalizeText(value).toLowerCase();
}

/** `<name>|<strength_value>|<strength_unit>|<form>|<pack_size>`, normalized. */
export function identityKey(parts: IdentityParts): string {
  return [
    parts.name,
    parts.strengthValue,
    parts.strengthUnit,
    parts.form,
    parts.packSize,
  ]
    .map(normalizeIdentityPart)
    .join("|");
}

/** The composed full label, normalized — see the module note. */
export function identityLabelKey(parts: IdentityParts): string {
  return normalizeIdentityPart(composeDisplayName(parts));
}

/**
 * Every key a row can be recognised by, canonical first. Blank label keys are
 * dropped so an unnamed row never matches another unnamed row.
 */
export function identityKeysOf(parts: IdentityParts): string[] {
  const keys = [identityKey(parts)];
  const label = identityLabelKey(parts);
  if (label !== "") {
    keys.push(label);
  }
  return keys;
}

/**
 * The **pre-split** identity — `<name>|<dosage>`, both normalized.
 *
 * Kept as a fallback rather than deleted: a database the backfill has not reached
 * yet still describes its rows only by `name` and `dosage`, and an import that
 * could not recognise those rows would insert a duplicate of every one. The
 * backfill runs at startup, so this is a safety net for the window before it (an
 * interrupted run, an older app version, a hand-restored backup) — not the main
 * path.
 */
export function legacyIdentityKey(name: string, dosageText: string): string {
  return `${normalizeIdentityPart(name)}|${normalizeIdentityPart(dosageText)}`;
}

/**
 * The `dosage` text a set of four fields stands for — the label without the name.
 *
 * This is the mirror convention every writer in the app already uses, so a row
 * written by the creation form and a row written by the legacy importer produce
 * the same string for the same medicine.
 */
export function legacyDosageText(parts: StrengthParts): string {
  return composeDisplayName({ ...parts, name: "" });
}

/**
 * Every key a **parsed or in-app** row can be recognised by: canonical, label,
 * then the legacy dosage mirror.
 *
 * One call on both sides of a match is what makes "import → backfill → re-import"
 * safe (§7.1): the caller never has to remember which keys to compare.
 */
export function allIdentityKeys(parts: IdentityParts): string[] {
  const keys = identityKeysOf(parts);
  const legacy = legacyDosageText(parts);
  if (legacy !== "") {
    keys.push(legacyIdentityKey(parts.name, legacy));
  }
  return keys;
}

/** A key that only says "the strength columns are not filled in yet". */
export function hasStrengthColumns(parts: IdentityParts): boolean {
  return (
    parts.strengthValue.trim() !== "" ||
    parts.strengthUnit.trim() !== "" ||
    parts.form.trim() !== "" ||
    parts.packSize.trim() !== ""
  );
}
