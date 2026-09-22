import { describe, expect, it } from "vitest";
import {
  baseUnitFor,
  describeQuantity,
  hasPack,
  packBreakdown,
  packFactor,
  packSizeText,
  parsePackSize,
  toBaseUnits,
  unitKind,
} from "./pack-size";

/**
 * The pack module is the one place a multiple is interpreted (`pack-size-handling`
 * F1), so its edge cases are pinned here rather than discovered as a ×10 stock
 * loss. The fixtures are the ones already in the repo — `(100/box)`, `(10/box)`,
 * `(100/tab)`, `60ml`, `120 ml` — plus the reference workbook's leftovers.
 */

const SACHET = { form: "sachet", packQty: 10, packUnit: "box" };
const TAB = { form: "tab", packQty: 100, packUnit: "box" };
const NO_PACK = { form: "tab", packQty: 0, packUnit: "" };

describe("hasPack / packFactor", () => {
  it("accepts an integer multiple greater than one in a named container", () => {
    expect(hasPack(SACHET)).toBe(true);
    expect(packFactor(SACHET)).toBe(10);
  });

  it("reads a typed string and ignores surrounding whitespace", () => {
    expect(packFactor({ packQty: " 10 ", packUnit: " box " })).toBe(10);
  });

  it("treats a blank, zero, one or non-integer multiple as no pack", () => {
    // Each of these means "no conversion happens" — never "multiply by nothing".
    for (const packQty of ["", 0, -5, 1, 2.5, Number.NaN, "abc"]) {
      expect(packFactor({ packQty, packUnit: "box" })).toBe(1);
      expect(hasPack({ packQty, packUnit: "box" })).toBe(false);
    }
  });

  it("treats a blank unit as no pack, however large the number", () => {
    // `100’s` — the number is real but the container is unstated (D28).
    expect(hasPack({ packQty: 100, packUnit: "" })).toBe(false);
    expect(packFactor({ packQty: 100, packUnit: "" })).toBe(1);
  });
});

describe("baseUnitFor", () => {
  it("is the dose form, which is what stock is counted in", () => {
    expect(baseUnitFor({ form: "sachet" })).toBe("sachet");
    expect(baseUnitFor({ form: "Tablet" })).toBe("tab");
  });

  it("falls back to `unit` when the form is blank or unknown", () => {
    // A pack with no dose form is valid (D30); `piece/bx` is not a form (E25).
    expect(baseUnitFor({ form: "" })).toBe("unit");
    expect(baseUnitFor({ form: "piece/bx" })).toBe("unit");
  });
});

describe("unitKind", () => {
  it("recognises the base unit, including its plural spelling", () => {
    expect(unitKind("tab", TAB)).toBe("base");
    expect(unitKind("tabs", TAB)).toBe("base");
    expect(unitKind("box", TAB)).toBe("pack");
  });

  it("treats a box whose form is `box` as its own base unit (D15)", () => {
    expect(unitKind("box", { form: "box", packUnit: "" })).toBe("base");
  });

  it("returns `unknown` for a unit that is neither base nor pack (E5)", () => {
    expect(unitKind("strip", SACHET)).toBe("unknown");
    expect(unitKind("", SACHET)).toBe("unknown");
    // OQ6 — the bare legacy token `pack` is deliberately not folded on.
    expect(unitKind("pack", SACHET)).toBe("unknown");
  });
});

describe("toBaseUnits", () => {
  it("multiplies a pack by its factor", () => {
    expect(toBaseUnits(2, "box", SACHET)).toBe(20);
  });

  it("passes a base-unit quantity through untouched", () => {
    expect(toBaseUnits(3, "sachet", SACHET)).toBe(3);
    expect(toBaseUnits(3, "tabs", TAB)).toBe(3);
  });

  it("returns `null` rather than guessing", () => {
    // E4/E5/Acceptance 19 — a pack-worded request on an item with no usable
    // pack must not silently become a factor of one.
    expect(toBaseUnits(2, "box", NO_PACK)).toBeNull();
    expect(
      toBaseUnits(2, "box", { form: "tab", packQty: 0, packUnit: "box" })
    ).toBeNull();
    expect(toBaseUnits(2, "strip", SACHET)).toBeNull();
    expect(toBaseUnits(0, "sachet", SACHET)).toBeNull();
    expect(toBaseUnits(2.5, "sachet", SACHET)).toBeNull();
  });
});

describe("describeQuantity / packBreakdown", () => {
  it("renders base units first with a pack parenthetical on an exact multiple", () => {
    expect(describeQuantity(20, SACHET)).toBe("20 sachet (2 box)");
  });

  it("breaks a remainder into packs plus base units, never fractions", () => {
    expect(describeQuantity(13, SACHET)).toBe("13 sachet (1 box + 3 sachet)");
    expect(describeQuantity(13, SACHET)).not.toContain("1.3");
  });

  it("stays in base units when the pack adds nothing", () => {
    expect(describeQuantity(7, SACHET)).toBe("7 sachet");
    expect(describeQuantity(20, NO_PACK)).toBe("20 tab");
  });

  it("exposes the mixed part on its own", () => {
    expect(packBreakdown(20, SACHET)).toBe("2 box");
    expect(packBreakdown(13, SACHET)).toBe("1 box + 3 sachet");
    expect(packBreakdown(7, SACHET)).toBe("7 sachet");
  });
});

describe("packSizeText", () => {
  it("derives the stored text from the pair (D24)", () => {
    expect(packSizeText(SACHET)).toBe("10/box");
  });

  it("stores blank rather than a half-written text", () => {
    expect(packSizeText({ packQty: 10, packUnit: "" })).toBe("");
    expect(packSizeText({ packQty: "", packUnit: "box" })).toBe("");
    expect(packSizeText({ packQty: 0, packUnit: "box" })).toBe("");
  });

  it("keeps a pack of one, which validation warns about rather than blocks (V3)", () => {
    expect(packSizeText({ packQty: 1, packUnit: "box" })).toBe("1/box");
  });
});

describe("parsePackSize", () => {
  it("pairs a named container, wherever the group sits in the cell (D27)", () => {
    expect(parsePackSize("(10/box)")).toEqual({ qty: 10, unit: "box" });
    expect(parsePackSize("(100/box)")).toEqual({ qty: 100, unit: "box" });
    expect(parsePackSize("mg tab (30/box)")).toEqual({ qty: 30, unit: "box" });
    expect(parsePackSize("Flavored Sachet (30/box)")).toEqual({
      qty: 30,
      unit: "box",
    });
    expect(parsePackSize("(35/box)")).toEqual({ qty: 35, unit: "box" });
    expect(parsePackSize("(10/vial)")).toEqual({ qty: 10, unit: "vial" });
  });

  it("reads the number but leaves the container unstated for a dose-form token (D28)", () => {
    // `100’s` never becomes `box` by inference, and the unit is never the base unit.
    expect(parsePackSize("(100/tab)")).toEqual({ qty: 100, unit: "" });
    expect(parsePackSize("100’s")).toEqual({ qty: 100, unit: "" });
    expect(parsePackSize("20’s")).toEqual({ qty: 20, unit: "" });
    expect(parsePackSize("(30’s)")).toEqual({ qty: 30, unit: "" });
    expect(parsePackSize("(25’s)")).toEqual({ qty: 25, unit: "" });
    expect(parsePackSize("100's")).toEqual({ qty: 100, unit: "" });
  });

  it("returns `null` for prose, measures and anything ambiguous (D6)", () => {
    expect(parsePackSize("")).toBeNull();
    expect(parsePackSize("60ml")).toBeNull();
    expect(parsePackSize("120 ml")).toBeNull();
    expect(parsePackSize("60ml suspension")).toBeNull();
    expect(parsePackSize("for injection")).toBeNull();
    expect(parsePackSize("mg/325mg tab")).toBeNull();
    expect(parsePackSize("1.5/box")).toBeNull();
  });
});
