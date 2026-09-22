import { describe, expect, it } from "vitest";
import { write } from "xlsx";
import {
  buildInventoryWorkbook,
  buildInventoryXlsxRows,
  type InventoryExportRow,
} from "./export-xlsx";
import { parseInventoryXlsx } from "./xlsx-parser";

/**
 * Export must be a true round trip: what the app writes out has to import back
 * unchanged. The totals columns (AL/AM) are the trap — writing a bare formula
 * leaves no cached result, and the xlsx reader that feeds the importer only
 * ever sees cached results, so those two values silently came back blank.
 */

function row(overrides: Partial<InventoryExportRow> = {}): InventoryExportRow {
  const daily = Array.from({ length: 31 }, () => 0);
  daily[0] = 5;
  daily[1] = 5;

  return {
    category: "Analgesic",
    daily,
    form: "tabs",
    name: "Paracetamol",
    packSize: "(100/box)",
    stockOnHand: 100,
    stockRemaining: 90,
    strengthUnit: "mg",
    strengthValue: "500",
    supplier: "Acme Pharma",
    totalDispensed: 10,
    ...overrides,
  };
}

function toBytes(rows: InventoryExportRow[]): Uint8Array {
  return write(buildInventoryWorkbook(rows), {
    bookType: "xlsx",
    type: "array",
  }) as Uint8Array;
}

describe("inventory export → import round trip", () => {
  it("keeps total_dispensed and stock_remaining readable by the importer", () => {
    const parsed = parseInventoryXlsx(toBytes([row()]));

    expect(parsed.rows).toHaveLength(1);
    const [item] = parsed.rows;
    expect(item?.name).toBe("Paracetamol");
    // The four columns come back verbatim — the writer no longer guesses them
    // from a composed string (decision 14).
    expect(item?.strengthValue).toBe("500");
    expect(item?.strengthUnit).toBe("mg");
    expect(item?.form).toBe("tabs");
    expect(item?.packSize).toBe("(100/box)");
    expect(item?.displayName).toBe("Paracetamol 500 mg tabs (100/box)");
    expect(item?.stockOnHand).toBe(100);
    expect(item?.dailySum).toBe(10);
    // Regression: formula-only cells read back as blank → totals were lost.
    expect(item?.totalDispensed).toBe(10);
    expect(item?.stockRemaining).toBe(90);
    expect(item?.totalMismatch).toBe(false);
  });

  it("round-trips category, supplier and the daily grid without warnings", () => {
    const parsed = parseInventoryXlsx(toBytes([row()]));
    const [item] = parsed.rows;

    expect(item?.category).toBe("Analgesic");
    expect(item?.supplier).toBe("Acme Pharma");
    expect(item?.daily[0]).toBe(5);
    expect(item?.daily[1]).toBe(5);
    expect(parsed.warnings.filter((w) => w.column === "header")).toHaveLength(
      0
    );
    expect(
      parsed.warnings.filter((w) => w.reason.includes("total"))
    ).toHaveLength(0);
  });

  it("still writes live formulas so a human can keep editing the sheet", () => {
    const workbook = buildInventoryWorkbook([row()]);
    const sheet = workbook.Sheets[workbook.SheetNames[0] as string];
    const total = sheet?.AL2 as { f?: string } | undefined;
    const remaining = sheet?.AM2 as { f?: string } | undefined;

    expect(total?.f).toBe("SUM(G2:AK2)");
    expect(remaining?.f).toBe('IF(F2="",0,F2)-AL2');
  });
});

/** `daily` sized to `days`, with the given 1-indexed days set. */
function makeDaily(
  days: number,
  entries: Record<number, number> = {}
): number[] {
  return Array.from({ length: days }, (_, index) => entries[index + 1] ?? 0);
}

describe("dynamic day columns", () => {
  it("builds a header whose day block follows the month length", () => {
    for (const days of [28, 29, 30, 31]) {
      const header = buildInventoryXlsxRows([], days)[0] ?? [];
      // 6 prefix + D days + 4 suffix + 2 pack columns.
      expect(header).toHaveLength(days + 12);
      expect(header[5]).toBe("stock_on_hand");
      expect(header[6]).toBe("1");
      expect(header[6 + days - 1]).toBe(String(days));
      expect(header[6 + days]).toBe("total_dispensed");
      expect(header[6 + days + 1]).toBe("stock_remaining");
      expect(header.at(-2)).toBe("pack_qty");
      expect(header.at(-1)).toBe("pack_unit");
    }
  });

  it("moves the totals formulas with the day block", () => {
    const workbook = buildInventoryWorkbook([row({ daily: makeDaily(30) })], {
      daysInMonth: 30,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0] as string];
    // Day 30 is column AJ; total_dispensed lands on AK, stock_remaining on AL.
    const total = sheet?.AK2 as { f?: string } | undefined;
    const remaining = sheet?.AL2 as { f?: string } | undefined;
    expect(total?.f).toBe("SUM(G2:AJ2)");
    expect(remaining?.f).toBe('IF(F2="",0,F2)-AK2');
  });

  it("appends a caller-owned summary sheet after the grid", () => {
    const workbook = buildInventoryWorkbook([row()], {
      daysInMonth: 31,
      extraSheets: [{ name: "Summary", rows: [["Medicines", 2]] }],
    });
    expect(workbook.SheetNames).toEqual(["Inventory Template", "Summary"]);
  });

  it.each([28, 30, 31])(
    "round-trips a %i-day export back through the importer",
    (days) => {
      const daily = makeDaily(days, { 1: 5, [days]: 3 });
      const parsed = parseInventoryXlsx(
        write(
          buildInventoryWorkbook(
            [
              row({
                daily,
                stockOnHand: 100,
                stockRemaining: 92,
                totalDispensed: 8,
              }),
            ],
            { daysInMonth: days }
          ),
          { bookType: "xlsx", type: "array" }
        ) as Uint8Array
      );

      expect(parsed.rows).toHaveLength(1);
      const [item] = parsed.rows;
      expect(item?.daily).toHaveLength(days);
      expect(item?.daily[0]).toBe(5);
      expect(item?.daily[days - 1]).toBe(3);
      expect(item?.dailySum).toBe(8);
      expect(item?.totalDispensed).toBe(8);
      expect(item?.stockRemaining).toBe(92);
      expect(item?.totalMismatch).toBe(false);
      expect(
        parsed.warnings.filter((warning) => warning.column === "header")
      ).toHaveLength(0);
    }
  );
});
