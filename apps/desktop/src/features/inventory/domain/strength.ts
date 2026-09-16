/**
 * The strength model — `strength_value` / `strength_unit` / `form` / `pack_size`.
 *
 * One module owns all three jobs, because they can only be trusted together:
 *
 * 1. **splitting** a legacy free-text `dosage` into the four template columns
 *    (`splitDosage`). The migration backfill, the importer and the creation form
 *    all call this exact function — a second copy is how the same medication ends
 *    up with two identities and a re-import duplicates it (spec §7.1).
 * 2. **labelling** a row for display: a full `display_name` (all four parts, what
 *    dispense requests match against) and the shorter list label.
 * 3. **completeness**: which rows still have a blank part, which is what
 *    `dosage_missing` now means (§6.4).
 *
 * The vocabularies come from `domain/vocabulary.ts`, which mirrors the template's
 * own xlsx `DataValidation` lists.
 */

import { MEDICINE_FORMS, STRENGTH_UNITS } from "./vocabulary";

export interface StrengthParts {
  form: string;
  packSize: string;
  strengthUnit: string;
  strengthValue: string;
}

export interface SplitResult extends StrengthParts {
  /**
   * A part could not be placed where the template expects it, so the split is a
   * guess. The backfill reports these rows for review (§6.3, decision 22).
   */
  uncertain: boolean;
}

export const EMPTY_PARTS: StrengthParts = {
  form: "",
  packSize: "",
  strengthUnit: "",
  strengthValue: "",
};

/** Collapse runs of whitespace and trim — the one normalization used everywhere. */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** A leading numeric strength, compound values included: `500`, `200/200/5`. */
const LEADING_STRENGTH = /^\s*(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*)/;

/**
 * Two bare numbers and nothing else — `50/60`, `50mg/60` once the unit is gone.
 *
 * Read as a *ratio* rather than a compound strength: `50/60` can mean "50 of
 * 60", which is why the spec's §9 table asks for it to be kept verbatim **and**
 * flagged. Three or more parts (`200/200/5`) are a recognised compound value
 * (decision 24) and a single number is unambiguous, so neither is flagged.
 */
const BARE_RATIO = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;

/** Longest tokens first, so `mg/5ml` wins over `mg`. */
const UNITS_BY_LENGTH = [...STRENGTH_UNITS].sort((a, b) => b.length - a.length);

const DIGITS_RE = /\d+/;

/**
 * A unit/form token only counts when the text actually ends there — `500mg tabs`
 * sits flush, while `50mg/60` is *not* `mg` followed by `/60`.
 */
function tokenEndsHere(text: string, token: string): boolean {
  const after = text.slice(token.length, token.length + 1);
  return after === "" || after === " " || after === "," || after === "(";
}

function takeToken(
  text: string,
  candidates: readonly string[]
): { rest: string; token: string } {
  const lower = text.toLowerCase();
  for (const candidate of candidates) {
    if (!lower.startsWith(candidate.toLowerCase())) {
      continue;
    }
    if (tokenEndsHere(text, candidate)) {
      return { rest: text.slice(candidate.length).trim(), token: candidate };
    }
  }
  return { rest: text, token: "" };
}

/**
 * Two-word forms such as `eye drops` are in the vocabulary, so the leading
 * two-word window is tried before the single token.
 */
function takeForm(text: string): { form: string; rest: string } {
  const single = takeToken(text, MEDICINE_FORMS);
  if (single.token !== "") {
    return { form: single.token, rest: single.rest };
  }
  const [first = "", second = ""] = text.split(" ");
  if (second === "") {
    return { form: "", rest: text };
  }
  const pair = `${first} ${second}`;
  const paired = takeToken(pair, MEDICINE_FORMS);
  if (paired.token === "" && paired.rest !== pair) {
    return { form: "", rest: text };
  }
  const rest = paired.token === "" ? text : text.slice(pair.length).trim();
  return {
    form: paired.token === "" ? "" : paired.token,
    rest,
  };
}

/**
 * Legacy free-text `dosage` → the four template columns.
 *
 * Slots fill in template order, so the pieces reassemble into the same text the
 * clinic typed. Anything the fixed vocabularies cannot place is kept verbatim in
 * the last slot it could belong to rather than dropped — losing text is worse
 * than a slightly wrong column, and `uncertain` says so.
 */
export function splitDosage(dosage: string): SplitResult {
  const text = normalizeText(dosage);
  if (text === "") {
    return { ...EMPTY_PARTS, uncertain: false };
  }

  let rest = text;
  let strengthValue = "";
  let strengthUnit = "";

  const valueMatch = rest.match(LEADING_STRENGTH);
  if (valueMatch) {
    strengthValue = valueMatch[1] ?? "";
    rest = rest.slice(valueMatch[0].length).trim();
    const { rest: nextRest, token } = takeToken(rest, UNITS_BY_LENGTH);
    strengthUnit = token;
    rest = nextRest;
  } else {
    // A unit can lead with no value at all — the importer recomposes
    // `mg/5ml syrup 120 ml` from rows whose strength_value is blank, and a
    // split that could not read that shape back would make a re-import insert a
    // duplicate instead of updating (§7.1).
    const { rest: nextRest, token } = takeToken(rest, UNITS_BY_LENGTH);
    strengthUnit = token;
    rest = nextRest;
  }

  const form = takeForm(rest);
  const packSize = form.rest;

  // A blank slot *before* a filled one means a part could not be placed: `50mg/60`
  // leaves the unit empty while the pack holds text, and a bare unit with no
  // value (`mg` alone) is a fragment too.
  const misplacedBefore =
    strengthValue === "" && strengthUnit !== ""
      ? true
      : strengthValue !== "" &&
        strengthUnit === "" &&
        (form.form !== "" || packSize !== "");
  const classified =
    strengthValue !== "" || strengthUnit !== "" || form.form !== "";

  return {
    form: form.form,
    packSize,
    strengthUnit,
    strengthValue,
    uncertain: misplacedBefore || !classified || BARE_RATIO.test(strengthValue),
  };
}

/** `500 mg`, or `500` when no unit was recorded. */
export function strengthLabel(parts: {
  strengthUnit: string;
  strengthValue: string;
}): string {
  return normalizeText(`${parts.strengthValue} ${parts.strengthUnit}`.trim());
}

export interface LabelInput extends StrengthParts {
  name: string;
}

/**
 * The **full** label: `Paracetamol 500 mg tablet (100/box)`.
 *
 * This is what gets stored in `display_name`, and it is deliberately the whole
 * thing rather than a short render — dispense requests carry historically
 * formatted medicine strings that must keep matching (decision 18).
 */
export function composeDisplayName(input: LabelInput): string {
  return normalizeText(
    [
      input.name.trim(),
      strengthLabel(input),
      input.form.trim(),
      input.packSize.trim(),
    ]
      .filter((part) => part !== "")
      .join(" ")
  );
}

/**
 * The compact list render (decision 13 / §8.1): `Paracetamol 500 mg`.
 *
 * Lists gain no new columns, so the medication has to read recognizably inside
 * the existing Name cell.
 */
export function composeListLabel(input: {
  name: string;
  strengthUnit: string;
  strengthValue: string;
}): string {
  return normalizeText(`${input.name.trim()} ${strengthLabel(input)}`.trim());
}

/**
 * "Details incomplete" (§6.4): true while any of the four parts is blank. This
 * is the meaning `dosage_missing` was repurposed to carry.
 */
export function isDetailsIncomplete(parts: StrengthParts): boolean {
  return (
    parts.strengthValue.trim() === "" ||
    parts.strengthUnit.trim() === "" ||
    parts.form.trim() === "" ||
    parts.packSize.trim() === ""
  );
}

/** The number `deriveSku` uses: the first integer of `strength_value`. */
export function strengthNumber(strengthValue: string): string | null {
  const match = strengthValue.match(DIGITS_RE);
  return match ? match[0] : null;
}
