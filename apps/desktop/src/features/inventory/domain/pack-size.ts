/**
 * The pack-size model — the **one** place a pack multiple is interpreted
 * (`pack-size-handling.md` F1).
 *
 * Stock is counted in **base units** — the dose form in `form` (`sachet`, `tab`,
 * `cap`, …) — while deliveries and requests may be written in packs. Every
 * surface that converts or renders a quantity calls this module rather than
 * doing its own arithmetic, so the item form, the request form, the deduction and
 * the reports cannot disagree (G3, G4).
 *
 * The functions are pure and take a plain shape rather than an `InventoryItem`,
 * because the same conversion runs against a draft, a form row and a stored row.
 * They live here and not in `strength.ts` because `strength.ts` owns the label
 * (identity) and this owns the arithmetic; the two must not start sharing rules.
 *
 * The `pack_size` **text** column remains the label and the identity key (D24):
 * `packSizeText` is the only writer of it, and `parsePackSize` here is the
 * conservative backfill's reader, not a general-purpose pack parser (D32).
 */

import { MEDICINE_FORMS, PACK_CONTAINER_TOKENS } from "./vocabulary";

export interface PackParts {
  /** `"10"` from a form, `10` from a row, `""` when untyped. */
  packQty: number | string;
  /** The container the multiple is counted in, e.g. `"box"`. Blank when unstated. */
  packUnit: string;
}

export interface PackItem extends PackParts {
  /** The stored dose form, which is the base unit (D5). May be blank. */
  form: string;
}

/** The base unit an item with no recognised dose form falls back to (D30, E25). */
export const FALLBACK_BASE_UNIT = "unit";

const WHITESPACE_RE = /\s+/g;

/** Lower-case and collapse whitespace — the normalization used on every unit token. */
export function normalizeUnit(value: string): string {
  return value.replace(WHITESPACE_RE, " ").trim().toLowerCase();
}

/**
 * Spelling variants of one unit, folded to a single token before comparison.
 *
 * This is what lets a request written in `tabs` match an item whose `form` is
 * `tab`, and what makes `piece` and `unit` the same base unit — `piece` is a dose
 * form, but the request vocabulary counts it as a plain `unit` (E25). Anything
 * not listed is its own token.
 */
const UNIT_ALIASES: Record<string, string> = {
  cap: "cap",
  caps: "cap",
  capsule: "cap",
  capsules: "cap",
  piece: FALLBACK_BASE_UNIT,
  pieces: FALLBACK_BASE_UNIT,
  tab: "tab",
  tablet: "tab",
  tablets: "tab",
  tabs: "tab",
  unit: FALLBACK_BASE_UNIT,
  units: FALLBACK_BASE_UNIT,
};

function canonicalUnit(value: string): string {
  const normalized = normalizeUnit(value);
  return UNIT_ALIASES[normalized] ?? normalized;
}

const KNOWN_FORMS = new Set(MEDICINE_FORMS.map((form) => normalizeUnit(form)));

/**
 * The unit stock is counted in: the dose form, folded to its display token.
 *
 * A blank form, or one the vocabulary does not know (`piece/bx` in the reference
 * workbook, E25), is not a unit at all — it falls back to `unit` rather than
 * rendering an unreadable token into every quantity.
 */
export function baseUnitFor(item: { form: string }): string {
  const form = normalizeUnit(item.form);
  if (form === "" || !KNOWN_FORMS.has(form)) {
    return FALLBACK_BASE_UNIT;
  }
  return canonicalUnit(form);
}

/**
 * Dose forms that arrive as a multiple, so a blank pack on one of them is a data
 * gap rather than a choice (V7, D20). Kept here rather than in `strength.ts`
 * because it is the pack model's rule, and exported for the writers that set
 * `dosage_missing` and for the backfill's own SQL.
 */
export const PACK_FORMING_FORMS = [
  "cap",
  "caps",
  "capsule",
  "capsules",
  "piece",
  "pieces",
  "sachet",
  "sachets",
  "tab",
  "tabs",
  "tablet",
  "tablets",
] as const;

const PACK_FORMING_SET = new Set<string>(PACK_FORMING_FORMS);

/** True when the dose form is one that normally comes as a multiple. */
export function isPackForming(form: string): boolean {
  return PACK_FORMING_SET.has(normalizeUnit(form));
}

/**
 * A pack-forming item with no usable pair reads as "details incomplete" (V7) —
 * flagged for review, **never blocked** (D20).
 */
export function isPackIncomplete(item: PackItem): boolean {
  return isPackForming(item.form) && !hasPack(item);
}

/**
 * The pack shape of a stored row or UI item, with the optional pair normalized.
 * One place so the list components do not each spell out `?? 0` / `?? ""`.
 */
export function packItemOf(item: {
  form: string;
  packQty?: number | null;
  packUnit?: string | null;
}): PackItem {
  return {
    form: item.form,
    packQty: item.packQty ?? 0,
    packUnit: item.packUnit ?? "",
  };
}

/** `number | string` → a finite number, or `null` when blank/unparseable. */
function readQty(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const text = value.trim();
  if (text === "") {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * True when the pair is usable for arithmetic: an integer multiple greater than
 * one, in a named container. A blank, zero, `1` or non-integer multiple, or a
 * blank unit, is not a pack (F1 rule 1).
 */
export function hasPack(parts: PackParts): boolean {
  const qty = readQty(parts.packQty);
  return (
    qty !== null &&
    Number.isInteger(qty) &&
    qty > 1 &&
    normalizeUnit(parts.packUnit) !== ""
  );
}

/**
 * The multiple one pack stands for. **`1` when the pair is unusable** — a blank,
 * zero, `1` or non-integer multiple, or a blank unit — which means "no conversion
 * happens", never "multiply by nothing" (F1 rule 1).
 */
export function packFactor(parts: PackParts): number {
  return hasPack(parts) ? (readQty(parts.packQty) as number) : 1;
}

/**
 * Is this unit the item's pack unit, its base unit, or neither?
 *
 * `unknown` is not a failure of the caller but the thing F5's block is made of:
 * a `2 strip` request on an item whose pack is `box` cannot be placed, and the
 * deduction refuses rather than guessing (E5).
 *
 * NOTE (OQ6): the bare token `pack` is *not* folded onto an item's `pack_unit`
 * here. `REQUEST_UNITS` still contains `pack` for legacy rows, and whether that
 * should keep meaning "the item's pack" is an open decision — until it is taken,
 * a legacy `pack` row resolves to `unknown` and therefore blocks instead of
 * silently deducting one base unit.
 */
export function unitKind(
  unit: string,
  item: { form: string; packUnit: string }
): "base" | "pack" | "unknown" {
  const token = canonicalUnit(unit);
  if (token === "") {
    return "unknown";
  }
  const packUnit = normalizeUnit(item.packUnit);
  if (packUnit !== "" && token === canonicalUnit(packUnit)) {
    return "pack";
  }
  if (token === canonicalUnit(baseUnitFor(item))) {
    return "base";
  }
  return "unknown";
}

/**
 * The chosen unit and typed quantity → base units. **`null` when the conversion
 * cannot be made** (F1 rule 2), which is what F5's block is made of: a pack-worded
 * request on an item with no usable pack returns `null` rather than treating a
 * box as a single — the exact bug this spec fixes.
 *
 * A quantity is a positive whole number of base units; a fractional or
 * non-positive quantity is refused here rather than rounded (E14).
 */
export function toBaseUnits(
  qty: number,
  unit: string,
  item: PackItem
): number | null {
  if (!Number.isInteger(qty) || qty <= 0) {
    return null;
  }
  switch (unitKind(unit, item)) {
    case "base":
      return qty;
    case "pack":
      return hasPack(item) ? qty * packFactor(item) : null;
    default:
      return null;
  }
}

/**
 * The mixed part of a quantity: `2 box` for an exact multiple, `1 box + 3 sachet`
 * for a remainder, and plain base units when the pack does not divide in or does
 * not exist. Never fractions — `13` on a `10/box` item is not `1.3 box` (F1 rule 3).
 */
export function packBreakdown(baseQty: number, item: PackItem): string {
  const base = baseUnitFor(item);
  if (!(hasPack(item) && Number.isInteger(baseQty)) || baseQty <= 0) {
    return `${baseQty} ${base}`;
  }
  const factor = packFactor(item);
  const whole = Math.trunc(baseQty / factor);
  if (whole === 0) {
    return `${baseQty} ${base}`;
  }
  const packUnit = normalizeUnit(item.packUnit);
  const remainder = baseQty - whole * factor;
  if (remainder === 0) {
    return `${whole} ${packUnit}`;
  }
  return `${whole} ${packUnit} + ${remainder} ${base}`;
}

/**
 * The rendered quantity: base units first, the pack parenthetical only when it
 * adds something.
 *
 *   `20` on a `10/box` sachet item → `20 sachet (2 box)`
 *   `13` on the same item          → `13 sachet (1 box + 3 sachet)`
 *   `7`  on the same item          → `7 sachet`
 *   `20` on an item with no pack   → `20 sachet`
 *
 * Base-first (rather than the `2 box (20 sachet)` order in F1's header comment)
 * because this is what the Low-Stock alert is pinned to read — the shelf's own
 * number leads and the pack is the convenience (F11, acceptance criteria 17 + 26).
 */
export function describeQuantity(baseQty: number, item: PackItem): string {
  const base = `${baseQty} ${baseUnitFor(item)}`;
  if (!(hasPack(item) && Number.isInteger(baseQty)) || baseQty <= 0) {
    return base;
  }
  const breakdown = packBreakdown(baseQty, item);
  return breakdown === base ? base : `${base} (${breakdown})`;
}

/**
 * The `pack_size` text a pair stands for — the **only** writer of that column
 * (D24). Empty when the pair is not renderable, so callers store a blank rather
 * than a half-written `10/`.
 *
 * Note this is `10/box`, not the legacy `(10/box)`: the parens were part of the
 * hand-typed leftovers, and a derived text that adds them would change identity
 * for every paired row (PK13, acceptance criterion 1).
 */
export function packSizeText(parts: PackParts): string {
  const qty = readQty(parts.packQty);
  const unit = normalizeUnit(parts.packUnit);
  if (qty === null || !Number.isInteger(qty) || qty <= 0 || unit === "") {
    return "";
  }
  return `${qty}/${unit}`;
}

export interface ParsedPackSize {
  /** The multiple read off the cell. */
  qty: number;
  /** The container, or `""` when the cell named a dose form instead (D28). */
  unit: string;
}

/** `(10/box)`, `30/box`, `mg tab (30/box)` — the group is matched **anywhere** (D27). */
const PACK_GROUP_RE = /(\d+(?:\.\d+)?)\s*\/\s*([A-Za-z]+)/;

/** The `20’s` idiom, curly and straight apostrophes both (PK24). */
const COUNT_IDIOM_RE = /(\d+(?:\.\d+)?)\s*[’'‘`]\s*s\b/;

const CONTAINER_TOKENS = new Set(
  PACK_CONTAINER_TOKENS.map((token) => normalizeUnit(token))
);
const DOSE_FORM_TOKENS = new Set(
  MEDICINE_FORMS.map((form) => normalizeUnit(form))
);

/**
 * The conservative parse for the backfill (D6, D27, D28, D32).
 *
 * It reads `pack_size` as the **leftover bucket** it is (PK28), not as a pack
 * column: it looks for a recognisable group and infers nothing from prose.
 *
 *   `"(10/box)"`         → `{ qty: 10, unit: "box" }`   container named
 *   `"mg tab (30/box)"`  → `{ qty: 30, unit: "box" }`   group matched anywhere (D27)
 *   `"100’s"`            → `{ qty: 100, unit: "" }`     container unstated → flag (D28)
 *   `"(100/tab)"`        → `{ qty: 100, unit: "" }`     container unstated → flag (D28)
 *   `"60ml suspension"`, `"for injection"`, `"120 ml"` → `null`
 *
 * A `null` means **leave the row completely alone** and report it for review
 * (D6). A decimal number is `null` too: `1.5/box` is not a whole multiple.
 */
export function parsePackSize(text: string): ParsedPackSize | null {
  const cell = typeof text === "string" ? text.trim() : "";
  if (cell === "") {
    return null;
  }

  const group = PACK_GROUP_RE.exec(cell);
  if (group) {
    const [, rawQty = "", rawToken = ""] = group;
    if (rawQty.includes(".")) {
      return null;
    }
    const qty = Number(rawQty);
    const token = normalizeUnit(rawToken);
    if (CONTAINER_TOKENS.has(token)) {
      return { qty, unit: token };
    }
    if (DOSE_FORM_TOKENS.has(token)) {
      return { qty, unit: "" };
    }
    return null;
  }

  const count = COUNT_IDIOM_RE.exec(cell);
  if (count) {
    const [, rawQty = ""] = count;
    if (rawQty.includes(".")) {
      return null;
    }
    return { qty: Number(rawQty), unit: "" };
  }

  return null;
}
