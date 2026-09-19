import { describe, expect, it } from "vitest";
import {
  groupsFromPaste,
  normalizePasteDate,
  parsePaste,
  positionalMapping,
  SHEET_COLUMNS,
  splitCells,
} from "./paste";
import { emptySheetDefaults } from "./sheet-defaults";
import type { SheetDefaults } from "./sheet-types";

const STENCIL: SheetDefaults = {
  category: "Analgesic",
  form: "tablet",
  strengthUnit: "mg",
  supplier: "MedSupply",
  threshold: 30,
};

const BLANK = emptySheetDefaults();

describe("parsePaste", () => {
  it("maps by header when the first line is one", () => {
    const parsed = parsePaste(
      [
        "Product name\tBatch / Lot\tExpiry\tQty\tSupplier\tMystery",
        "Paracetamol\tB-1\t2027-03-01\t200\tMedSupply\tx",
      ].join("\n")
    );

    expect(parsed.headers?.[0]).toBe("Product name");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.mapping.name).toBe(0);
    expect(parsed.mapping.batch).toBe(1);
    expect(parsed.mapping.expiry).toBe(2);
    expect(parsed.mapping.qty).toBe(3);
    expect(parsed.mapping.supplier).toBe(4);
    // Reported, never guessed at.
    expect(parsed.unmappedHeaders).toEqual(["Mystery"]);
  });

  it("falls back to column order when there is no header", () => {
    const parsed = parsePaste("Paracetamol\tB-1\t2027-03-01\t200");

    expect(parsed.headers).toBeNull();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.mapping).toEqual(positionalMapping());
    expect(parsed.rows[0][0]).toBe("Paracetamol");
  });

  it("reads comma-separated text with quoted cells", () => {
    const parsed = parsePaste(
      'Product name,Coverage\n"Paracetamol, 500mg","He said ""ok"""'
    );

    expect(parsed.headers).toEqual(["Product name", "Coverage"]);
    expect(parsed.rows[0][0]).toBe("Paracetamol, 500mg");
    expect(parsed.rows[0][1]).toBe('He said "ok"');
    expect(parsed.unmappedHeaders).toEqual(["Coverage"]);
  });

  it("keeps a one-cell line whole", () => {
    expect(splitCells("SKU-PARA-500", "\t")).toEqual(["SKU-PARA-500"]);
  });

  it("names every grid column once, in grid order", () => {
    const keys = SHEET_COLUMNS.map((column) => column.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.slice(0, 4)).toEqual(["name", "batch", "expiry", "qty"]);
    expect(SHEET_COLUMNS.filter((column) => column.frozen)).toHaveLength(4);
  });
});

describe("normalizePasteDate", () => {
  it("passes ISO dates through and trims a timestamp", () => {
    expect(normalizePasteDate(" 2027-03-01 ")).toBe("2027-03-01");
    expect(normalizePasteDate("2027-03-01T00:00:00")).toBe("2027-03-01");
  });

  it("reads a month as its first day", () => {
    expect(normalizePasteDate("2027-3")).toBe("2027-03-01");
  });

  it("reads slashed and dashed dates as MM/DD/YYYY, the app's own format", () => {
    expect(normalizePasteDate("03/01/2027")).toBe("2027-03-01");
    expect(normalizePasteDate("3-1-2027")).toBe("2027-03-01");
  });

  it("leaves anything unrecognised for validation to report", () => {
    expect(normalizePasteDate("next spring")).toBe("next spring");
    expect(normalizePasteDate("")).toBe("");
  });
});

describe("groupsFromPaste", () => {
  it("merges the rows of one medicine into a single group", () => {
    const parsed = parsePaste(
      [
        "Product name\tSKU\tBatch / Lot\tExpiry\tQty",
        "Paracetamol\tSKU-PARA-500\tB-2027-01\t2027-03-01\t200",
        "Paracetamol\tSKU-PARA-500\tB-2027-02\t2027-05-01\t200",
        "Cetirizine\tSKU-CETI-10\tC-1\t2027-12-01\t100",
      ].join("\n")
    );

    const { groups, rows } = groupsFromPaste(parsed, BLANK);

    expect(rows).toBe(3);
    expect(groups.map((group) => group.product.name)).toEqual([
      "Paracetamol",
      "Cetirizine",
    ]);
    expect(groups[0].product.batches.map((row) => row.batch)).toEqual([
      "B-2027-01",
      "B-2027-02",
    ]);
    expect(groups[0].product.batches[0].qty).toBe(200);
    expect(groups[0].product.sku).toBe("SKU-PARA-500");
    expect(groups[0].skuTouched).toBe(true);
  });

  it("lets the file's values win over the stencil and marks them overridden", () => {
    const parsed = parsePaste(
      [
        "Product name\tCategory\tSupplier\tThreshold\tBatch / Lot\tQty",
        "Amoxicillin\tAntibiotic\tKefCare\t50\tA-1\t60",
      ].join("\n")
    );

    const { groups } = groupsFromPaste(parsed, STENCIL);

    expect(groups[0].product).toMatchObject({
      category: "Antibiotic",
      form: "tablet",
      supplier: "KefCare",
      threshold: 50,
    });
    // form and unit came from the stencil, so they are not the operator's own.
    expect(groups[0].overridden).toEqual(["category", "supplier", "threshold"]);
  });

  it("leaves a sparse row blank so validation reports it", () => {
    const parsed = parsePaste(
      ["Product name\tBatch / Lot\tQty", "Cetirizine\t\t"].join("\n")
    );

    const { groups } = groupsFromPaste(parsed, BLANK);

    expect(groups).toHaveLength(1);
    expect(groups[0].product.batches[0]).toMatchObject({
      batch: "",
      expiry: "",
      qty: "",
    });
    expect(groups[0].overridden).toEqual([]);
  });

  it("ignores trailing blank lines", () => {
    const parsed = parsePaste("Paracetamol\tB-1\t2027-03-01\t200\n\n");
    expect(groupsFromPaste(parsed, BLANK).groups).toHaveLength(1);
  });
});
