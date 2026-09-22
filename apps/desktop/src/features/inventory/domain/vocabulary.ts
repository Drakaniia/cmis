/**
 * The canonical vocabularies for strength units and dose forms.
 *
 * These are the 41-column template's own tokens, not a clinical wish-list: the
 * export writer splits a stored `dosage` back into `strength_unit` + `form`
 * using exactly these strings, so anything the creation form could offer that is
 * missing here would come back folded into the wrong column on the next
 * round-trip. One list, read by the writer and the form both.
 */

export const STRENGTH_UNITS = [
  "mg",
  "g",
  "mcg",
  "ml",
  "mg/ml",
  "mg/5ml",
  "%",
  "IU",
  "units",
] as const;

/**
 * The pack vocabulary — the containers one pack multiple may be counted in
 * (pack-size-handling D17). One list, read by the item form's pack-unit select
 * and by the request form's item-aware unit list, so `box` cannot mean two
 * things on two screens.
 */
export const PACK_UNITS = [
  "box",
  "strip",
  "pack",
  "carton",
  "bottle",
  "tube",
] as const;

/**
 * The containers the **parser** may read off a legacy `pack_size` cell.
 *
 * A superset of `PACK_UNITS`: the reference workbook's leftover bucket also names
 * `vial`, `ampule` and `nebule`, and a `(10/vial)` group is still an unambiguous
 * pack multiple worth pairing. These three are read-only — they are never
 * offered in the form select, so a new item can only be written in a
 * `PACK_UNITS` token (V6).
 */
export const PACK_CONTAINER_TOKENS = [
  ...PACK_UNITS,
  "vial",
  "ampule",
  "nebule",
] as const;

export const MEDICINE_FORMS = [
  "tablet",
  "capsule",
  "cap",
  "sachet",
  "syrup",
  "suspension",
  "susp",
  "ointment",
  "cream",
  "drops",
  "vial",
  "ampule",
  "nebule",
  "injection",
  "suppository",
  "box",
  "piece",
  "tabs",
  "tab",
  "inhaler",
  "solution",
  "gel",
  "lotion",
  "spray",
] as const;
