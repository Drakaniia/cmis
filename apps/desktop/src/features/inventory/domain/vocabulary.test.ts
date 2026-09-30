import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, REPO_ROOT } from "@/test/project-paths";
import {
  PACK_CONTAINER_TOKENS,
  SEED_MEDICINE_FORMS,
  SEED_PACK_UNITS,
  SEED_STRENGTH_UNITS,
  SEED_VOCABULARY,
  type VocabularyKind,
} from "./vocabulary";

/**
 * The seed vocabularies, pinned to the two things that have to agree with them.
 *
 * The strength spec (§5, §12 item 4) found three vocabularies that had already
 * drifted: the `.xlsx` validation lists, the Python converter, and the app.
 * Drift here is not cosmetic — a value the app can store but the template's list
 * rejects makes an exported workbook un-editable, and a value the workbook offers
 * that the app does not know cannot be classified on the way back in.
 *
 * Migration 0013 changed what "the app's list" *is*. It is now rows in
 * `vocabulary_terms`, editable by the operator, and the arrays in
 * `domain/vocabulary.ts` are the **seed** a fresh database is created from. So
 * there are two parity questions left, and this file asks both:
 *
 * 1. **Seed ↔ migration.** Does `0013_vocabulary_terms.sql` insert exactly the
 *    tokens the TS arrays declare? If they drift, a fresh install and a fresh
 *    checkout offer different dropdowns, and nothing else in the app would notice.
 * 2. **Seed ↔ Python.** Does `scripts/inventory_vocabulary.py` still mirror the
 *    seed tuples? The exporter writes stored values verbatim, so a term the
 *    operator added is correct in the workbook — but Excel's `DataValidation`
 *    dropdown is generated from Python, so only a *hand edit* of that cell is
 *    refused. That limit is real and accepted; what is not acceptable is the
 *    seed itself drifting, which would refuse edits the app itself offers.
 *
 * The third block is the floor: the strings the shipped `.xlsx` lists carried,
 * which can never be dropped however the seed evolves.
 */

const PYTHON_VOCABULARY = join(REPO_ROOT, "scripts", "inventory_vocabulary.py");
const MIGRATION_0013 = join(MIGRATIONS_DIR, "0013_vocabulary_terms.sql");

/** Pulls one `NAME = ( "a", "b", ... )` tuple out of the Python module. */
function pythonTuple(source: string, name: string): string[] {
  const match = source.match(
    new RegExp(`${name}\\s*=\\s*\\(([\\s\\S]*?)\\)`, "m")
  );
  if (!match) {
    throw new Error(`${name} is missing from scripts/inventory_vocabulary.py`);
  }
  return [...(match[1] ?? "").matchAll(/"([^"]*)"/g)].map((entry) => entry[1]);
}

/**
 * The tokens `0013_vocabulary_terms.sql` seeds, per kind, in file order.
 *
 * Only the literal `VALUES` list is read. The three adoption `INSERT … SELECT`
 * statements below it deliberately derive their ids and names from
 * `inventory_items` at migration time, so there is nothing static in them to
 * compare against — and a token that only exists because a row already carried
 * it is exactly the case the adoption exists to handle.
 */
function seededTerms(sql: string): Record<VocabularyKind, string[]> {
  const valuesBlock = sql.match(/VALUES([\s\S]*?);/);
  if (!valuesBlock) {
    throw new Error("0013_vocabulary_terms.sql has no VALUES list");
  }
  const grouped: Record<VocabularyKind, string[]> = {
    form: [],
    pack_unit: [],
    strength_unit: [],
  };
  const rowPattern = /\(\s*'[^']*'\s*,\s*'([^']+)'\s*,\s*'([^']*)'/g;
  for (const [, kind = "", name = ""] of valuesBlock[1]?.matchAll(rowPattern) ??
    []) {
    if (kind in grouped) {
      grouped[kind as VocabularyKind].push(name);
    }
  }
  return grouped;
}

describe("vocabulary seed parity", () => {
  const sql = readFileSync(MIGRATION_0013, "utf8");
  const seeded = seededTerms(sql);

  it("seeds the migration with exactly the app's strength units, in order", () => {
    expect(seeded.strength_unit).toEqual([...SEED_STRENGTH_UNITS]);
  });

  it("seeds the migration with exactly the app's dose forms, in order", () => {
    expect(seeded.form).toEqual([...SEED_MEDICINE_FORMS]);
  });

  it("seeds the migration with exactly the app's pack units, in order", () => {
    expect(seeded.pack_unit).toEqual([...SEED_PACK_UNITS]);
  });

  it("never seeds the parser-only container tokens as a pack unit", () => {
    // `vial`, `ampule` and `nebule` are readable off a legacy `pack_size` cell
    // and deliberately not *offerable*: a new item may only be written in a term
    // the operator picked. Seeding them would put them in the dropdown.
    const parserOnly = PACK_CONTAINER_TOKENS.filter(
      (token) => !(SEED_PACK_UNITS as readonly string[]).includes(token)
    );
    expect(parserOnly.length).toBeGreaterThan(0);
    for (const token of parserOnly) {
      expect(seeded.pack_unit).not.toContain(token);
    }
  });
});

describe("vocabulary seed parity with the template tooling", () => {
  const source = readFileSync(PYTHON_VOCABULARY, "utf8");

  it("keeps the Python units identical to the app's seed, in order", () => {
    expect(pythonTuple(source, "STRENGTH_UNITS")).toEqual([
      ...SEED_STRENGTH_UNITS,
    ]);
  });

  it("keeps the Python forms identical to the app's seed, in order", () => {
    expect(pythonTuple(source, "MEDICINE_FORMS")).toEqual([
      ...SEED_MEDICINE_FORMS,
    ]);
  });
});

describe("vocabulary floor", () => {
  it("holds the template's own tokens, so a converted workbook stays importable", () => {
    // These are the strings the shipped `.xlsx` DataValidation lists carried;
    // dropping one would silently stop accepting files the clinic already has.
    for (const unit of ["mg", "g", "mcg", "ml", "mg/ml", "mg/5ml", "%", "IU"]) {
      expect(SEED_STRENGTH_UNITS).toContain(unit);
    }
    for (const form of [
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
    ]) {
      expect(SEED_MEDICINE_FORMS).toContain(form);
    }
  });

  it("keeps every seed list free of duplicates, case-insensitively", () => {
    // The table's UNIQUE is `(kind, name)` under `COLLATE NOCASE`, so a seed
    // holding both `Tab` and `tab` would fail the migration outright on a
    // collation this test cannot see.
    for (const kind of Object.keys(SEED_VOCABULARY) as VocabularyKind[]) {
      const lowered = SEED_VOCABULARY[kind].map((term) => term.toLowerCase());
      expect(new Set(lowered).size).toBe(lowered.length);
    }
  });
});
