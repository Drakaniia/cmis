import { describe, expect, it } from "vitest";
import { write } from "xlsx";
import { buildInventoryWorkbook, type InventoryExportRow } from "./export-xlsx";
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
