import { describe, expect, it } from "vitest";
import { INVENTORY_TEMPLATE_HEADERS, parseInventoryCsv } from "./csv-parser";

const HEADER = INVENTORY_TEMPLATE_HEADERS.join(",");

function buildLine(cells: (string | number | null)[]): string {
  return cells
    .map((c) => {
      const s = String(c ?? "");
      return s.includes(",") ? `"${s}"` : s;
    })
    .join(",");
}

// Helper to build a 41-col row with split dosage: [name, strength_value, strength_unit, form, pack_size, stock, ...31 daily, total, remaining, category, supplier]
function build41Row(input: {
  category?: string;
  daily?: (string | number | null)[];
  form?: string;
  name: string;
  packSize?: string;
  stockOnHand?: string | number | null;
  stockRemaining?: string | number | null;
  strengthUnit?: string;
  strengthValue?: string;
  supplier?: string;
  totalDispensed?: string | number | null;
}): string {
  const daily = input.daily ?? new Array(31).fill("");
  const cells: (string | number | null)[] = [
    input.name,
    input.strengthValue ?? "",
    input.strengthUnit ?? "",
    input.form ?? "",
    input.packSize ?? "",
    input.stockOnHand ?? "",
    ...daily.slice(0, 31),
    input.totalDispensed ?? "",
    input.stockRemaining ?? "",
    input.category ?? "",
    input.supplier ?? "",
  ];
  return buildLine(cells);
}

describe("parseInventoryCsv", () => {
  it("handles packed dosage via split columns (100 + mg/5ml + syrup + 120 ml)", () => {
    const line = build41Row({
      daily: new Array(31).fill(""),
      form: "syrup",
      name: "Ascorbic Acid Syrup",
      packSize: "120 ml",
      stockOnHand: "", // blank = 0
      strengthUnit: "mg/5ml",
      strengthValue: "100",
    });
    const csv = [HEADER, line].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Ascorbic Acid Syrup");
    // assembled dosage is "100 mg/5ml syrup 120 ml" per spec §4.4
    expect(result.rows[0].dosage).toBe("100 mg/5ml syrup 120 ml");
    expect(result.rows[0].stockOnHand).toBeNull();
    expect(result.rows[0].dosageMissing).toBe(false);
  });

  it("coerces 14a to 14 with warning and 440 (April) via numeric extractor", () => {
    const dailyCef = new Array(31).fill("");
    dailyCef[9] = "21";
    dailyCef[23] = "14a";
    dailyCef[30] = "21";
    const cefLine = build41Row({
      daily: dailyCef,
      form: "caps",
      name: "Cefalexin",
      packSize: "(100/box)",
      stockOnHand: "",
      strengthUnit: "mg",
      strengthValue: "50",
    });
    const atenLine = build41Row({
      daily: new Array(31).fill(""),
      form: "tab",
      name: "Atenolol",
      packSize: "(100/box)",
      stockOnHand: "440 (April)",
      strengthUnit: "mg",
      strengthValue: "50",
    });
    const csv = [HEADER, cefLine, atenLine].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows).toHaveLength(2);
    const cef = result.rows.find((r) => r.name === "Cefalexin");
    expect(cef).toBeDefined();
    expect(cef?.daily[23]).toBe(14);
    expect(cef?.daily[9]).toBe(21);
    const warning14a = result.warnings.find(
      (w) => w.raw === "14a" && w.coerced === 14
    );
    expect(warning14a).toBeDefined();
    expect(warning14a?.column).toBe("24");

    const aten = result.rows.find((r) => r.name === "Atenolol");
    expect(aten?.stockOnHand).toBe(440);
    const warn440 = result.warnings.find((w) => w.raw === "440 (April)");
    expect(warn440).toBeDefined();
    expect(warn440?.coerced).toBe(440);
  });

  it("creates valid row for stock_on_hand 0 (template uses 0 for no stock, not NO STOCK text)", () => {
    const line = build41Row({
      daily: new Array(31).fill(""),
      form: "suspension",
      name: "Aluminum Mag Hydroxide",
      packSize: "60ml",
      stockOnHand: "0",
      strengthUnit: "mg/ml",
      strengthValue: "200",
    });
    const csv = [HEADER, line].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].isNoStock).toBe(false);
    expect(result.rows[0].stockOnHand).toBe(0);
    expect(result.rows[0].dailySum).toBe(0);
  });

  it("treats NO STOCK text as unparseable numeric cell (strict template blocks it)", () => {
    const line = build41Row({
      daily: new Array(31).fill(""),
      form: "suspension",
      name: "BadStock",
      packSize: "60ml",
      stockOnHand: "NO STOCK",
      strengthUnit: "mg",
      strengthValue: "10",
    });
    const csv = [HEADER, line].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].stockOnHand).toBeNull();
    const warn = result.warnings.find(
      (w) => w.raw === "NO STOCK" && w.column === "stock_on_hand"
    );
    expect(warn).toBeDefined();
  });

  it("skips empty separator rows ,,, and counts skippedEmptyRows", () => {
    const validLine = build41Row({
      daily: new Array(31).fill(""),
      form: "tablet",
      name: "Paracetamol",
      packSize: "(100/tab)",
      stockOnHand: "",
      strengthUnit: "mg",
      strengthValue: "500",
      totalDispensed: "0",
    });
    const emptyRow = new Array(41).fill("").join(",");
    const csv = [HEADER, validLine, emptyRow, validLine].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.skippedEmptyRows).toBe(1);
  });

  it("flags blank dosage with dosageMissing and dosageMissingCount", () => {
    const line = build41Row({
      daily: new Array(31).fill(""),
      name: "Ciprofloxacin",
      stockOnHand: "0",
    });
    const csv = [HEADER, line].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows[0].dosageMissing).toBe(true);
    expect(result.rows[0].dosage).toBe("");
    expect(result.dosageMissingCount).toBe(1);
  });

  it("detects total vs daily sum mismatch and sets totalMismatch", () => {
    const daily = new Array(31).fill("");
    daily[0] = "5";
    daily[1] = "5"; // sum 10
    const line = build41Row({
      daily,
      form: "tabs",
      name: "TestMed",
      packSize: "",
      stockOnHand: "100",
      strengthUnit: "mg",
      strengthValue: "10",
      totalDispensed: "999",
    });
    const csv = [HEADER, line].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows[0].dailySum).toBe(10);
    expect(result.rows[0].totalDispensed).toBe(999);
    expect(result.rows[0].totalMismatch).toBe(true);
    expect(result.mismatchCount).toBe(1);
    const warn = result.warnings.find((w) =>
      w.reason.includes("total vs daily sum mismatch")
    );
    expect(warn).toBeDefined();
  });

  it("forgiving: pads short rows and truncates long rows with warning", () => {
    const shortLine = "ShortMed,10,mg,tabs,,5,1,2"; // only 8 cols, will be padded to 41
    const longCells = [
      "LongMed",
      "10",
      "mg",
      "",
      "",
      "5",
      ...new Array(31).fill("1"),
      "31",
      "",
      "",
      "",
      "extra1",
      "extra2",
    ]; // 43 cols >41
    const longLine = longCells.join(",");
    const csv = [HEADER, shortLine, longLine].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe("ShortMed");
    expect(result.rows[0].dailySum).toBe(3); // 1+2
    const truncWarn = result.warnings.find((w) =>
      w.reason.includes("truncated")
    );
    expect(truncWarn).toBeDefined();
  });

  it("parses header-only and blank-row template as 0 rows per spec §6", () => {
    const csvHeaderOnly = HEADER;
    const r1 = parseInventoryCsv(csvHeaderOnly);
    expect(r1.rows).toHaveLength(0);
    expect(r1.skippedEmptyRows).toBe(0);
    const hundredBlanks = [
      HEADER,
      ...new Array(100).fill(new Array(41).fill("").join(",")),
    ].join("\n");
    const r2 = parseInventoryCsv(hundredBlanks);
    expect(r2.rows).toHaveLength(0);
    expect(r2.skippedEmptyRows).toBe(100);
  });

  it("handles BOM and blank stock_remaining as null without warning", () => {
    const bomHeader = `\uFEFF${HEADER}`;
    const line = build41Row({
      daily: (() => {
        const d = new Array(31).fill("");
        d[0] = "15";
        d[1] = "60";
        return d;
      })(),
      form: "caps",
      name: "Mefenamic Acid",
      packSize: "(100/box)",
      stockOnHand: "",
      strengthUnit: "mg",
      strengthValue: "500",
      totalDispensed: "75",
    });
    const csv = [bomHeader, line].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].stockRemaining).toBeNull();
    expect(result.rows[0].totalDispensed).toBe(75);
  });

  it("emits header mismatch warning for old 36-col file", () => {
    const oldHeader =
      "NAME OF MEDICATION,DOSAGE,stock on hand,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,total dispensed,stock remaining";
    const line = [
      "Paracetamol",
      "500mg",
      "10",
      ...new Array(31).fill(""),
      "0",
      "",
    ].join(",");
    const csv = [oldHeader, line].join("\n");
    const result = parseInventoryCsv(csv);
    const headerWarn = result.warnings.find(
      (w) => w.column === "header" && w.reason.includes("column count")
    );
    expect(headerWarn).toBeDefined();
    expect(headerWarn?.raw).toBe("36");
  });

  it("parses category and supplier when provided", () => {
    const line = build41Row({
      category: "Antibiotic",
      daily: new Array(31).fill(""),
      form: "caps",
      name: "Amoxicillin",
      packSize: "(100/box)",
      stockOnHand: "50",
      strengthUnit: "mg",
      strengthValue: "500",
      supplier: "Acme Pharma",
    });
    const csv = [HEADER, line].join("\n");
    const result = parseInventoryCsv(csv);
    expect(result.rows[0].category).toBe("Antibiotic");
    expect(result.rows[0].supplier).toBe("Acme Pharma");
  });

  it("assembles dosage per spec §4.4 examples", () => {
    const cases: Array<{
      input: Parameters<typeof build41Row>[0];
      expected: string;
    }> = [
      {
        expected: "600 mg sachet (10/box)",
        input: {
          form: "sachet",
          name: "X",
          packSize: "(10/box)",
          strengthUnit: "mg",
          strengthValue: "600",
        },
      },
      {
        expected: "500 mg tabs (100/tab)",
        input: {
          form: "tabs",
          name: "X",
          packSize: "(100/tab)",
          strengthUnit: "mg",
          strengthValue: "500",
        },
      },
      {
        expected: "15 g ointment",
        input: {
          form: "ointment",
          name: "X",
          strengthUnit: "g",
          strengthValue: "15",
        },
      },
      {
        expected: "cream",
        input: { form: "cream", name: "X" },
      },
    ];
    for (const c of cases) {
      const line = build41Row({
        ...c.input,
        daily: new Array(31).fill(""),
        name: "Probe",
      });
      const csv = [HEADER, line].join("\n");
      const result = parseInventoryCsv(csv);
      expect(result.rows[0].dosage).toBe(c.expected);
    }
  });
});
