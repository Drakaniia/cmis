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
