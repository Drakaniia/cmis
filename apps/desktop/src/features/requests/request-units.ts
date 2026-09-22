/**
 * The unit vocabulary a request may be expressed in.
 *
 * `REQUEST_UNITS` is the fixed fallback the form shows for a row with no
 * selected item — `tabs · caps · strip · pack · unit`. Once an item is picked,
 * `requestUnitsFor` replaces it with the **item-aware** list: the item's base
 * unit (its dose form, the unit stock is counted in) followed by its recorded
 * pack unit (`box`, `strip`, …), so `2 box` and `3 sachet` can both be written
 * against the same item (pack-size F5/D8).
 *
 * A request's unit is prefilled from the matched inventory item so the common
 * case needs no thought, and stays editable. `strip` and `pack` stay in the
 * fixed list so a legacy row's unit still reads back (OQ6) — `toRequestUnit`
 * keeps whatever was stored rather than folding it away.
 */

import { baseUnitFor, hasPack } from "@/features/inventory/domain/pack-size";

export const REQUEST_UNITS = ["tabs", "caps", "strip", "pack", "unit"] as const;

export type RequestUnit = (typeof REQUEST_UNITS)[number];

const DEFAULT_UNIT = "unit";

/**
 * Dose form → the unit staff would count it in.
 *
 * `sachet` and `box` map to themselves: the dose form **is** the base unit, and
 * a sachet request is a base-unit request, not a pack request (D8, D5).
 */
const UNIT_BY_FORM: Record<string, string> = {
  ampule: "unit",
  box: "box",
  cap: "caps",
  capsule: "caps",
  drops: "unit",
  inhaler: "unit",
  injection: "unit",
  ointment: "unit",
  piece: "unit",
  sachet: "sachet",
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

/** The base unit token for an item's dose form, falling back to `unit`. */
function baseTokenFor(form: string): string {
  const key = form.trim().toLowerCase();
  const mapped = UNIT_BY_FORM[key];
  if (mapped) {
    return mapped;
  }
  // `piece/bx` and any other unrecognised form: the arithmetic's own base unit
  // is the authority (E25).
  return baseUnitFor({ form });
}

/**
 * The item-aware unit list: the base unit first, then the item's pack unit when
 * it records one. The pack unit is never duplicated if it equals the base token,
 * and a blank pack adds nothing (F5).
 */
export function requestUnitsFor(item: {
  form: string;
  packQty?: number;
  packUnit?: string;
}): string[] {
  const base = baseTokenFor(item.form);
  const packUnit = (item.packUnit ?? "").trim().toLowerCase();
  const units = [base];
  if (
    packUnit !== "" &&
    packUnit !== base &&
    hasPack({ packQty: item.packQty ?? 0, packUnit })
  ) {
    units.push(packUnit);
  }
  return units;
}

/** The unit a row starts on when its medicine is picked (prefill, editable). */
export function defaultUnitForItem(item: {
  form: string;
  packQty?: number;
  packSize: string;
  packUnit?: string;
}): string {
  return requestUnitsFor(item)[0] ?? DEFAULT_UNIT;
}

/**
 * Normalizes a stored/typed unit. Unlike the old narrowing version it keeps a
 * unit the fixed list does not contain (`sachet`, `box`), because those are now
 * real request units — only a blank value falls back to `unit`.
 */
export function toRequestUnit(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? DEFAULT_UNIT : trimmed;
}
