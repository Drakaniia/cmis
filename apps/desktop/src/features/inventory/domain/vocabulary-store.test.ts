import { describe, expect, it } from "vitest";
import {
  baseUnitFor,
  FALLBACK_BASE_UNIT,
  isPackForming,
  parsePackSize,
} from "./pack-size";
import { splitDosage } from "./strength";
import {
  resetVocabularyForTesting,
  setVocabulary,
  vocabulary,
} from "./vocabulary-store";

/**
 * The snapshot has one job beyond holding the list: an edit to it must be visible
 * to every derived structure immediately, not at the next launch.
 *
 * Each case below runs the same assertion twice — once on the shipped seed, once
 * after `setVocabulary` adds a token — because a memo built once at module load
 * is the exact bug this guards. `splitDosage`'s length-sorted unit list,
 * `baseUnitFor`'s known-form set and `parsePackSize`'s two token sets are all
 * memoised, and all three would keep serving the pre-edit vocabulary forever if
 * the version check were missing.
 */

function withExtra<T>(
  kind: "form" | "pack_unit" | "strength_unit",
  extra: string,
  run: () => T
): T {
  setVocabulary(kind, [...vocabulary(kind), extra]);
  try {
    return run();
  } finally {
    resetVocabularyForTesting();
  }
}

describe("snapshot defaults to the shipped seeds", () => {
  it("serves a usable vocabulary before any hydration has run", () => {
    // The property that lets every other domain test in this feature run
    // without a database.
    expect(vocabulary("strength_unit")).toContain("mg");
    expect(vocabulary("form")).toContain("tablet");
    expect(vocabulary("pack_unit")).toContain("box");
  });
});

describe("splitDosage sees a unit added after load", () => {
  it("parses the shipped longest-match shape on the seed", () => {
    // `mg/5ml` must beat `mg`, which is what the length sort exists for.
    expect(splitDosage("250mg/5ml").strengthUnit).toBe("mg/5ml");
  });

  it("parses a unit the operator added, not just the seeded ones", () => {
    const result = withExtra("strength_unit", "µg", () =>
      splitDosage("250µg syrup")
    );
    expect(result.strengthUnit).toBe("µg");
    expect(result.form).toBe("syrup");
  });

  it("still prefers the longer seeded token over a shorter added one", () => {
    // A new unit that is a prefix of a seeded one must not shadow it.
    const result = withExtra("strength_unit", "mg/", () =>
      splitDosage("mg/5ml syrup 120 ml")
    );
    expect(result.strengthUnit).toBe("mg/5ml");
  });
});

describe("baseUnitFor sees a form added after load", () => {
  it("falls back to `unit` for a form the snapshot does not hold", () => {
    expect(baseUnitFor({ form: "piece/bx" })).toBe(FALLBACK_BASE_UNIT);
  });

  it("stops falling back once the form is in the snapshot", () => {
    // E25: `piece/bx` is a real workbook form the seed does not name. Adding it
    // has to change how every quantity on screen reads.
    const result = withExtra("form", "piece/bx", () =>
      baseUnitFor({ form: "piece/bx" })
    );
    expect(result).not.toBe(FALLBACK_BASE_UNIT);
  });

  it("is case-insensitive, matching the table's COLLATE NOCASE", () => {
    expect(baseUnitFor({ form: "TABLET" })).toBe("tab");
  });
});

describe("parsePackSize sees a container added after load", () => {
  it("parses a seeded container", () => {
    expect(parsePackSize("(10/box)")).toEqual({ qty: 10, unit: "box" });
  });

  it("parses a container the operator added", () => {
    const result = withExtra("pack_unit", "crate", () =>
      parsePackSize("(12/crate)")
    );
    expect(result).toEqual({ qty: 12, unit: "crate" });
  });

  it("still reads the parser-only tokens, which are not in the table", () => {
    // `vial` is deliberately not seeded, but a legacy cell naming it is still an
    // unambiguous multiple worth pairing.
    expect(parsePackSize("(10/vial)")).toEqual({ qty: 10, unit: "vial" });
  });
});

describe("isPackForming is unchanged by a snapshot edit", () => {
  it("keeps its own hand-maintained list", () => {
    // `PACK_FORMING_FORMS` encodes domain judgement rather than derivable fact,
    // so it deliberately does not follow the vocabulary. A new form is simply
    // not pack-forming until someone says so — which `vocabulary-drift.test.ts`
    // reports rather than hides.
    expect(isPackForming("tablet")).toBe(true);
    expect(isPackForming("syrup")).toBe(false);
  });
});
