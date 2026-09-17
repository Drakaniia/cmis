/**
 * The unit vocabulary a request may be expressed in — `tabs · caps · strip ·
 * pack · unit`, the same list the request card and the docs already use.
 *
 * A request's unit is prefilled from the matched inventory item so the common
 * case needs no thought, and stays editable so "a strip of 10" and "10 tabs" can
 * both be written down (D24).
 */

export const REQUEST_UNITS = ["tabs", "caps", "strip", "pack", "unit"] as const;

export type RequestUnit = (typeof REQUEST_UNITS)[number];

const DEFAULT_UNIT: RequestUnit = "unit";

/**
 * Dose form → the unit staff would count it in. Anything the vocabulary does
 * not cover falls back to a pack when the item records a pack size, and to a
 * plain unit otherwise — never to a unit the list does not contain.
 */
const UNIT_BY_FORM: Record<string, RequestUnit> = {
  ampule: "unit",
  box: "pack",
  cap: "caps",
  capsule: "caps",
  drops: "unit",
  inhaler: "unit",
  injection: "unit",
  ointment: "unit",
  piece: "unit",
  sachet: "pack",
  solution: "unit",
  suppository: "unit",
  susp: "unit",
  suspension: "unit",
  syrup: "unit",
  tab: "tabs",
  tablet: "tabs",
  tabs: "tabs",
  vial: "unit",
};

export function defaultUnitForItem(item: {
  form: string;
  packSize: string;
}): RequestUnit {
  const mapped = UNIT_BY_FORM[item.form.trim().toLowerCase()];
  if (mapped) {
    return mapped;
  }
  return item.packSize.trim() === "" ? DEFAULT_UNIT : "pack";
}

/** Narrows free text back to the vocabulary; unknown values become `unit`. */
export function toRequestUnit(value: string): RequestUnit {
  const match = REQUEST_UNITS.find((unit) => unit === value.trim());
  return match ?? DEFAULT_UNIT;
}
