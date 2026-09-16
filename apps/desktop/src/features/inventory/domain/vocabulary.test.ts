import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "@/test/project-paths";
import { MEDICINE_FORMS, STRENGTH_UNITS } from "./vocabulary";

/**
 * The strength spec (§5, §12 item 4) found three vocabularies that had already
 * drifted: the `.xlsx` validation lists, the Python converter, and the app.
 * Drift here is not cosmetic — a value the app can store but the template's list
 * rejects makes an exported workbook un-editable, and a value the workbook offers
 * that the app does not know cannot be classified on the way back in.
 *
 * So the app's list is canonical and the Python tooling mirrors it. This test is
 * what makes the mirroring real rather than a comment: it parses
 * `scripts/inventory_vocabulary.py` and compares the tuples.
 */

const PYTHON_VOCABULARY = join(REPO_ROOT, "scripts", "inventory_vocabulary.py");

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

describe("strength vocabulary parity", () => {
  const source = readFileSync(PYTHON_VOCABULARY, "utf8");

  it("keeps the Python units identical to the app's list, in order", () => {
    expect(pythonTuple(source, "STRENGTH_UNITS")).toEqual([...STRENGTH_UNITS]);
  });

  it("keeps the Python forms identical to the app's list, in order", () => {
    expect(pythonTuple(source, "MEDICINE_FORMS")).toEqual([...MEDICINE_FORMS]);
  });

  it("holds the template's own tokens, so a converted workbook stays importable", () => {
    // These are the strings the shipped `.xlsx` DataValidation lists carried;
    // dropping one would silently stop accepting files the clinic already has.
    for (const unit of ["mg", "g", "mcg", "ml", "mg/ml", "mg/5ml", "%", "IU"]) {
      expect(STRENGTH_UNITS).toContain(unit);
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
      expect(MEDICINE_FORMS).toContain(form);
    }
  });
});
