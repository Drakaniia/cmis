import { describe, expect, it } from "vitest";
import {
  composeDisplayName,
  composeListLabel,
  isDetailsIncomplete,
  splitDosage,
  strengthNumber,
} from "./strength";

/**
 * The split is the one rule the backfill, the importer, the exporter and the
 * creation form all share (spec §7.1), so its edge cases are pinned here rather
 * than discovered as duplicate inventory.
 *
 * The `50mg/60` and `cream` cases come straight from the spec's §9 table; the
 * `uncertain` flag is what puts them in the backfill's review list.
 */
describe("splitDosage", () => {
  it("splits a clean template row", () => {
    expect(splitDosage("500 mg tablet (100/box)")).toEqual({
      form: "tablet",
      packSize: "(100/box)",
      strengthUnit: "mg",
      strengthValue: "500",
      uncertain: false,
    });
  });

  it("splits a flush strength, which has no space to lean on", () => {
    expect(splitDosage("500mg")).toEqual({
      form: "",
      packSize: "",
      strengthUnit: "mg",
      strengthValue: "500",
      uncertain: false,
    });
  });

  it("keeps a compound strength whole (decision 24)", () => {
    expect(splitDosage("200/200/5")).toMatchObject({
      strengthUnit: "",
      strengthValue: "200/200/5",
      uncertain: false,
    });
  });

  it("reads a concentration as one unit", () => {
    expect(splitDosage("250mg/5ml")).toMatchObject({
      strengthUnit: "mg/5ml",
      strengthValue: "250",
      uncertain: false,
    });
  });

  it("flags a stray number as uncertain instead of guessing", () => {
    const split = splitDosage("50mg/60");
    expect(split.strengthValue).toBe("50");
    expect(split.packSize).toBe("mg/60");
    expect(split.uncertain).toBe(true);
  });

  it("flags a stray pair with no unit as uncertain", () => {
    const split = splitDosage("50/60");
    expect(split.strengthValue).toBe("50/60");
    expect(split.uncertain).toBe(true);
  });

  it("places a form-only string in `form` and calls it certain", () => {
    expect(splitDosage("cream")).toEqual({
      form: "cream",
      packSize: "",
      strengthUnit: "",
      strengthValue: "",
      uncertain: false,
    });
  });

  it("splits a strength with an abbreviation form", () => {
    expect(splitDosage("60ml susp")).toMatchObject({
      form: "susp",
      strengthUnit: "ml",
      strengthValue: "60",
      uncertain: false,
    });
  });

  it("reads a unit that leads with no value, which is what the importer writes", () => {
    // `assembleDosage` emits `mg/5ml syrup 120 ml` for a row whose strength_value
    // is blank; the split has to read that back or a re-import inserts a second
    // copy of the same medicine (§7.1).
    expect(splitDosage("mg/5ml syrup 120 ml")).toMatchObject({
      form: "syrup",
      packSize: "120 ml",
      strengthUnit: "mg/5ml",
      strengthValue: "",
    });
  });

  it("returns four blanks for empty input without flagging it", () => {
    expect(splitDosage("   ")).toEqual({
      form: "",
      packSize: "",
      strengthUnit: "",
      strengthValue: "",
      uncertain: false,
    });
  });

  it("treats a pack-size-only string as a pack size, flagged for review", () => {
    const split = splitDosage("(100/box)");
    expect(split.packSize).toBe("(100/box)");
    expect(split.strengthValue).toBe("");
    expect(split.uncertain).toBe(true);
  });
});

describe("labels", () => {
  it("composes the full display label in template order", () => {
    expect(
      composeDisplayName({
        form: "tablet",
        name: "Paracetamol",
        packSize: "(100/box)",
        strengthUnit: "mg",
        strengthValue: "500",
      })
    ).toBe("Paracetamol 500 mg tablet (100/box)");
  });

  it("omits blank parts rather than leaving double spaces", () => {
    expect(
      composeDisplayName({
        form: "",
        name: "Cetirizine",
        packSize: "",
        strengthUnit: "mg",
        strengthValue: "10",
      })
    ).toBe("Cetirizine 10 mg");
  });

  it("renders the compact list label (decision 13)", () => {
    expect(
      composeListLabel({
        name: "Paracetamol",
        strengthUnit: "mg",
        strengthValue: "500",
      })
    ).toBe("Paracetamol 500 mg");
  });

  it("falls back to the bare name when no strength is recorded", () => {
    expect(
      composeListLabel({ name: "Cream", strengthUnit: "", strengthValue: "" })
    ).toBe("Cream");
  });
});

describe("isDetailsIncomplete", () => {
  it("is true while any of the four parts is blank", () => {
    const complete = {
      form: "tablet",
      packSize: "(100/box)",
      strengthUnit: "mg",
      strengthValue: "500",
    };
    expect(isDetailsIncomplete(complete)).toBe(false);
    for (const field of Object.keys(complete) as (keyof typeof complete)[]) {
      expect(
        isDetailsIncomplete({ ...complete, [field]: "" }),
        `${field} should matter`
      ).toBe(true);
    }
  });
});

describe("strengthNumber", () => {
  it("takes the first integer, so a compound value still yields a SKU suffix", () => {
    expect(strengthNumber("200/200/5")).toBe("200");
    expect(strengthNumber("")).toBeNull();
  });
});
