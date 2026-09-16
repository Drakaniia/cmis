import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATEGORY_NAME_MAX_LENGTH,
  categoryNames,
  DEFAULT_CATEGORY_NAMES,
  findCategoryByName,
  newCategoryId,
  normalizeCategoryName,
  validateCategoryName,
} from "./categories";

const EXISTING = ["Analgesic", "Antibiotic", "First Aid"];

// Top level, so a case is not compiling a fresh pattern on each assertion.
const UUID_RE = /[0-9a-f-]{36}/i;
const SEEDED_ID_RE = /^cat-/;

describe("normalizeCategoryName", () => {
  it("trims and collapses the whitespace of a pasted name", () => {
    expect(normalizeCategoryName("  First   Aid ")).toBe("First Aid");
  });

  it("leaves a clean name alone", () => {
    expect(normalizeCategoryName("First Aid")).toBe("First Aid");
  });
});

describe("findCategoryByName", () => {
  it("matches case-insensitively", () => {
    expect(findCategoryByName("analgesic", EXISTING)).toBe("Analgesic");
  });

  it("matches despite different spacing, because it normalizes first", () => {
    expect(findCategoryByName("first  aid", EXISTING)).toBe("First Aid");
  });

  it("returns null for an unknown name", () => {
    expect(findCategoryByName("Ophthalmic", EXISTING)).toBeNull();
  });
});

describe("validateCategoryName", () => {
  it("accepts a new name", () => {
    expect(validateCategoryName("Ophthalmic", EXISTING)).toBeNull();
  });

  it("rejects a blank name", () => {
    expect(validateCategoryName("   ", EXISTING)).toBe("Name is required.");
  });

  it("rejects a duplicate regardless of case", () => {
    expect(validateCategoryName("analgesic", EXISTING)).toBe(
      "Analgesic already exists."
    );
  });

  it("rejects a name longer than the cap", () => {
    const long = "x".repeat(CATEGORY_NAME_MAX_LENGTH + 1);
    expect(validateCategoryName(long, EXISTING)).toBe(
      `Category names are ${CATEGORY_NAME_MAX_LENGTH} characters or fewer.`
    );
  });

  it("accepts an edit that keeps the same name", () => {
    expect(
      validateCategoryName("Analgesic", EXISTING, { ignore: "Analgesic" })
    ).toBeNull();
  });

  it("still rejects a case-only edit that collides with another category", () => {
    expect(
      validateCategoryName("Antibiotic", EXISTING, { ignore: "Analgesic" })
    ).toBe("Antibiotic already exists.");
  });

  it("lets a category be renamed to a name that only it holds, in different case", () => {
    expect(
      validateCategoryName("ANALGESIC", EXISTING, { ignore: "analgesic" })
    ).toBeNull();
  });
});

describe("newCategoryId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the platform uuid when there is one", () => {
    expect(newCategoryId()).toMatch(UUID_RE);
  });

  it("falls back to a prefixed id when crypto has no randomUUID", () => {
    vi.stubGlobal("crypto", {});
    expect(newCategoryId(0)).toMatch(SEEDED_ID_RE);
  });
});

describe("the shipped taxonomy", () => {
  it("is the seven names the migration seeds", () => {
    expect([...DEFAULT_CATEGORY_NAMES]).toEqual([
      "Analgesic",
      "Antibiotic",
      "Antiseptic",
      "Supplement",
      "Respiratory",
      "Gastro",
      "First Aid",
    ]);
  });
});

describe("categoryNames", () => {
  it("maps rows to the strings the dropdowns render", () => {
    expect(
      categoryNames([
        { id: "1", itemCount: 3, name: "Analgesic" },
        { id: "2", itemCount: 0, name: "Gastro" },
      ])
    ).toEqual(["Analgesic", "Gastro"]);
  });
});
