import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { INVENTORY_TEMPLATE_HEADERS, parseInventoryCsv } from "./csv-parser";
import { parseInventoryXlsx } from "./xlsx-parser";

const HEADERS = [...INVENTORY_TEMPLATE_HEADERS] as string[];

function buildWorkbook(rows: (string | number | null)[][]) {
  const aoa = [HEADERS, ...rows];
  const sheet = utils.aoa_to_sheet(aoa);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Inventory");
  return write(workbook, { bookType: "xlsx", type: "array" });
}

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
}): (string | number | null)[] {
  const daily = input.daily ?? new Array(31).fill("");
  return [
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
}

describe("parseInventoryXlsx", () => {
  it("parses an xlsx into the same ParseResult the CSV parser returns", () => {
    const bytes = buildWorkbook([
      build41Row({
        form: "tabs",
        name: "Paracetamol",
        packSize: "(100/tab)",
        stockOnHand: "120",
        strengthUnit: "mg",
        strengthValue: "500",
        totalDispensed: "0",
      }),
    ]);

    const result = parseInventoryXlsx(bytes);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Paracetamol");
    expect(result.rows[0].dosage).toBe("500 mg tabs (100/tab)");
    expect(result.rows[0].stockOnHand).toBe(120);
    expect(result.rows[0].totalDispensed).toBe(0);
    expect(result.rows[0].dailySum).toBe(0);
    expect(result.rows[0].totalMismatch).toBe(false);
  });

  it("accepts daily counts as Excel numbers and coerces to the daily array", () => {
    const daily = new Array(31).fill("");
    daily[0] = 5 as unknown as string;
    daily[1] = 5 as unknown as string;
    const bytes = buildWorkbook([
      build41Row({
        daily: daily as unknown as string[],
        form: "tabs",
        name: "TestMed",
        packSize: "",
        stockOnHand: "100",
        strengthUnit: "mg",
        strengthValue: "10",
        totalDispensed: "10",
      }),
    ]);

    const result = parseInventoryXlsx(bytes);

    expect(result.rows[0].dailySum).toBe(10);
    expect(result.rows[0].totalDispensed).toBe(10);
    expect(result.rows[0].totalMismatch).toBe(false);
  });

  it("handles stock 0 and blank dosage like the CSV parser (strict template has no NO STOCK text)", () => {
    const bytes = buildWorkbook([
      build41Row({
        name: "Aluminum Mag Hydroxide",
        stockOnHand: "0",
      }),
    ]);

    const result = parseInventoryXlsx(bytes);

    expect(result.rows[0].stockOnHand).toBe(0);
    expect(result.rows[0].dosageMissing).toBe(true);
    expect(result.dosageMissingCount).toBe(1);
  });

  it("produces the same result as parsing the equivalent CSV text", () => {
    const daily = new Array(31).fill("");
    daily[0] = "5";
    daily[1] = "5";
    const dataRow = build41Row({
      daily,
      form: "tabs",
      name: "TestMed",
      packSize: "",
      stockOnHand: "100",
      strengthUnit: "mg",
      strengthValue: "10",
      totalDispensed: "10",
    });

    const csv = [HEADERS.join(","), dataRow.join(",")].join("\n");
    const xlsxBytes = buildWorkbook([dataRow]);

    const fromCsv = parseInventoryCsv(csv);
    const fromXlsx = parseInventoryXlsx(xlsxBytes);

    expect(fromXlsx.rows).toEqual(fromCsv.rows);
    expect(fromXlsx.warnings).toEqual(fromCsv.warnings);
  });

  it("uses the first sheet when the workbook has several", () => {
    const aoa1 = [
      HEADERS,
      build41Row({
        name: "FirstSheetMed",
        stockOnHand: "10",
        strengthUnit: "mg",
        strengthValue: "5",
      }),
    ];
    const aoa2 = [
      HEADERS,
      build41Row({
        name: "SecondSheetMed",
        stockOnHand: "10",
        strengthUnit: "mg",
        strengthValue: "5",
      }),
    ];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.aoa_to_sheet(aoa1), "One");
    utils.book_append_sheet(wb, utils.aoa_to_sheet(aoa2), "Two");
    const bytes = write(wb, { bookType: "xlsx", type: "array" });

    const result = parseInventoryXlsx(bytes);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("FirstSheetMed");
  });

  it("throws a descriptive Error for a non-xlsx payload", () => {
    const notXlsx = new Uint8Array([0, 1, 2, 3]);
    expect(() => parseInventoryXlsx(notXlsx)).toThrow(Error);
  });
});
